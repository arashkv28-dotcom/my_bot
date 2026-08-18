// ==========================================================================
//  Telegram Guard Bot - fixed & rewritten build
//  Runtime: Vercel Serverless Function (Node.js 18+)  |  DB: Upstash Redis REST
//
//  Required environment variables:
//    BOT_TOKEN            bot token from BotFather
//    ADMIN_IDS            numeric admin ids, comma separated
//    KV_REST_API_URL      Upstash Redis REST url
//    KV_REST_API_TOKEN    Upstash REST token
//    WEBHOOK_SECRET       (optional, recommended) same value passed to
//                         setWebhook as secret_token
// ==========================================================================

const BOT_TOKEN = process.env.BOT_TOKEN;
const KV_URL = (process.env.KV_REST_API_URL || '').replace(/\/+$/, '');
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';

const ADMIN_IDS = (process.env.ADMIN_IDS || '')
  .split(',')
  .map((id) => parseInt(id.trim(), 10))
  .filter((id) => Number.isFinite(id));

const PAGE_SIZE = 8;          // items per page in lists
const WORDS_PAGE = 12;        // bad words per page
const WORDS_CACHE_TTL = 30000;// ms - in-memory cache for bad words
const WARN_TTL_MS = 5000;     // how long warning messages stay
const DEDUP_TTL = 300;        // sec - dedupe repeated updates
const SPAM_TTL = 3600;        // sec - duplicate/spam detection window
const GROUP_TOUCH_TTL = 21600;// sec - throttle group metadata writes

// ==========================================================================
//  Core helpers
// ==========================================================================

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** escape HTML since parse_mode is HTML */
const esc = (s = '') =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function tgApi(method, body) {
  if (!BOT_TOKEN) {
    console.error('BOT_TOKEN \u062a\u0639\u0631\u06cc\u0641 \u0646\u0634\u062f\u0647 \u0627\u0633\u062a');
    return null;
  }
  try {
    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!j.ok) console.warn(`\u26a0\ufe0f ${method}: ${j.description}`);
    return j;
  } catch (e) {
    console.error(`\u274c ${method}:`, e);
    return null;
  }
}

const send = (chat_id, text, extra = {}) =>
  tgApi('sendMessage', {
    chat_id,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...extra,
  });

const del = (chat_id, message_id) => tgApi('deleteMessage', { chat_id, message_id });

/** temporary warning: send, wait, delete */
async function warn(chatId, text, ttl = WARN_TTL_MS) {
  const w = await send(chatId, text);
  if (w?.ok && w.result) {
    await sleep(ttl);
    await del(chatId, w.result.message_id);
  }
}

// ==========================================================================
//  Database layer (Upstash REST via POST + pipeline)
// ==========================================================================

const kvReady = () => Boolean(KV_URL && KV_TOKEN);

async function kv(cmd) {
  if (!kvReady()) return null;
  try {
    const r = await fetch(KV_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${KV_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(cmd),
    });
    const j = await r.json();
    if (j && j.error) {
      console.error('KV error:', j.error, cmd[0]);
      return null;
    }
    return j ? j.result : null;
  } catch (e) {
    console.error('KV fail:', e);
    return null;
  }
}

async function kvPipe(cmds) {
  if (!kvReady() || cmds.length === 0) return [];
  try {
    const r = await fetch(`${KV_URL}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${KV_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(cmds),
    });
    const j = await r.json();
    if (Array.isArray(j)) return j.map((x) => (x && x.error ? null : x?.result));
    return [];
  } catch (e) {
    console.error('KV pipeline fail:', e);
    return [];
  }
}

// --- keys ---------------------------------------------------------------
const KIND = {
  bl: { key: (id) => `bl:${id}`, index: 'bl:index', label: '\u0628\u0644\u06a9\u200c\u0644\u06cc\u0633\u062a' },
  wl: { key: (id) => `wl:${id}`, index: 'wl:index', label: '\u0648\u0627\u06cc\u062a\u200c\u0644\u06cc\u0633\u062a' },
  grp: { key: (id) => `grp:${id}`, index: 'grp:index', label: '\u06af\u0631\u0648\u0647\u200c\u0647\u0627' },
};

async function entryAdd(kind, { id, name, type }) {
  const K = KIND[kind];
  const payload = JSON.stringify({ id, name: name || String(id), type: type || 'unknown', addedAt: Date.now() });
  const res = await kvPipe([
    ['SET', K.key(id), payload],
    ['SADD', K.index, String(id)],
  ]);
  return res.length === 2;
}

async function entryRemove(kind, id) {
  const K = KIND[kind];
  const res = await kvPipe([
    ['DEL', K.key(id)],
    ['SREM', K.index, String(id)],
  ]);
  // true only if something was actually removed
  return Number(res[0] || 0) > 0 || Number(res[1] || 0) > 0;
}

async function entryHas(kind, id) {
  if (id === null || id === undefined) return false;
  const r = await kv(['EXISTS', KIND[kind].key(id)]);
  return Number(r) === 1;   // fail-closed on error (null -> false)
}

async function entryGet(kind, id) {
  const raw = await kv(['GET', KIND[kind].key(id)]);
  if (!raw) return null;
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}

/** all items via one SMEMBERS + one MGET */
async function entryList(kind) {
  const K = KIND[kind];
  const ids = await kv(['SMEMBERS', K.index]);
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const values = await kv(['MGET', ...ids.map((id) => K.key(id))]);
  const out = [];
  const orphans = [];
  ids.forEach((id, i) => {
    const raw = values?.[i];
    if (!raw) {
      orphans.push(id);
      return;
    }
    try {
      out.push(typeof raw === 'string' ? JSON.parse(raw) : raw);
    } catch {
      orphans.push(id);
    }
  });
  if (orphans.length) await kv(['SREM', K.index, ...orphans]); // clean orphan index entries
  return out.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
}

const statInc = (key, by = 1) => kv(['INCRBY', `stat:${key}`, by]);
async function statGet(key) {
  const v = await kv(['GET', `stat:${key}`]);
  return parseInt(v, 10) || 0;
}

/** migrate legacy keys */
async function migrateLegacy() {
  const map = [
    ['blacklist_*', 'bl'],
    ['whitelist_*', 'wl'],
    ['group_*', 'grp'],
  ];
  let moved = 0;
  for (const [pattern, kind] of map) {
    const keys = await kv(['KEYS', pattern]);
    if (!Array.isArray(keys) || !keys.length) continue;
    const values = await kv(['MGET', ...keys]);
    for (let i = 0; i < keys.length; i++) {
      let obj = null;
      try {
        obj = typeof values[i] === 'string' ? JSON.parse(values[i]) : values[i];
      } catch { /* corrupt value */ }
      if (!obj || obj.id === undefined) continue;
      await entryAdd(kind, { id: obj.id, name: obj.name || obj.title, type: obj.type || 'unknown' });
      moved++;
    }
  }
  return moved;
}

// ==========================================================================
//  Message parsing
// ==========================================================================

const fullName = (u) =>
  [u?.first_name, u?.last_name].filter(Boolean).join(' ').trim() ||
  (u?.username ? '@' + u.username : '') ||
  '\u06a9\u0627\u0631\u0628\u0631';

/**
 * Resolve forward source from BOTH shapes:
 *  - forward_origin  (Bot API 7.0+, current shape)
 *  - forward_from / forward_from_chat  (legacy, kept for compatibility)
 */
function getForwardSource(msg) {
  const o = msg.forward_origin;
  if (o) {
    if (o.type === 'user' && o.sender_user)
      return { id: o.sender_user.id, name: fullName(o.sender_user), type: 'user' };
    if (o.type === 'chat' && o.sender_chat)
      return { id: o.sender_chat.id, name: o.sender_chat.title || o.sender_chat.username || '\u06af\u0631\u0648\u0647', type: o.sender_chat.type };
    if (o.type === 'channel' && o.chat)
      return { id: o.chat.id, name: o.chat.title || o.chat.username || '\u06a9\u0627\u0646\u0627\u0644', type: 'channel' };
    if (o.type === 'hidden_user')
      return { id: null, name: o.sender_user_name || '\u06a9\u0627\u0631\u0628\u0631 \u0645\u062e\u0641\u06cc', type: 'hidden_user' };
  }
  if (msg.forward_from_chat)
    return {
      id: msg.forward_from_chat.id,
      name: msg.forward_from_chat.title || msg.forward_from_chat.username || '\u06a9\u0627\u0646\u0627\u0644',
      type: msg.forward_from_chat.type,
    };
  if (msg.forward_from)
    return { id: msg.forward_from.id, name: fullName(msg.forward_from), type: 'user' };
  return null;
}

/** text + caption + hidden urls in entities */
function extractText(msg) {
  const parts = [];
  if (msg.text) parts.push(msg.text);
  if (msg.caption) parts.push(msg.caption);
  for (const e of [...(msg.entities || []), ...(msg.caption_entities || [])]) {
    if (e.type === 'text_link' && e.url) parts.push(e.url);
  }
  return parts.join('\n');
}

// --- filters ---------------------------------------------------------------

/** default seed list, used only when DB is empty */
const DEFAULT_BAD_WORDS = [
  '\u0627\u062d\u0645\u0642', '\u0628\u06cc\u0634\u0639\u0648\u0631', '\u0628\u06cc \u0634\u0639\u0648\u0631', '\u06a9\u0644\u0627\u0647\u0628\u0631\u062f\u0627\u0631', '\u0634\u0627\u0634\u0632\u0627\u062f\u0647',
  '\u06a9\u0648\u0646', '\u06a9\u0635', '\u06a9\u0633 \u06a9\u0634', '\u06a9\u0633\u06a9\u0634', '\u06a9\u0648\u0633\u06a9\u0634', '\u06a9\u0648\u0635\u06a9\u0634', '\u06a9\u0635\u06a9\u0634',
  '\u06a9\u06cc\u0631', '\u06a9\u0648\u0633', '\u06af\u0648\u0647',
];

const WORDS_KEY = 'badwords';
const WORDS_SEEDED = 'badwords:seeded';

/** in-memory cache to avoid a KV call per message */
let _wordsCache = null;
let _wordsCacheAt = 0;

/** read bad words from DB (cached, auto-seeded) */
async function getBadWords(force = false) {
  const now = Date.now();
  if (!force && _wordsCache && now - _wordsCacheAt < WORDS_CACHE_TTL) return _wordsCache;

  if (!kvReady()) {
    _wordsCache = DEFAULT_BAD_WORDS.slice();
    _wordsCacheAt = now;
    return _wordsCache;
  }

  let list = await kv(['SMEMBERS', WORDS_KEY]);

  // first run: write defaults. The seeded flag means if an admin
  // clears everything, defaults do not come back.
  if (!Array.isArray(list) || list.length === 0) {
    const seeded = await kv(['GET', WORDS_SEEDED]);
    if (!seeded) {
      await kvPipe([
        ['SADD', WORDS_KEY, ...DEFAULT_BAD_WORDS],
        ['SET', WORDS_SEEDED, '1'],
      ]);
      list = DEFAULT_BAD_WORDS.slice();
    } else {
      list = [];
    }
  }

  _wordsCache = Array.isArray(list) ? list : [];
  _wordsCacheAt = now;
  return _wordsCache;
}

const invalidateWords = () => { _wordsCache = null; _wordsCacheAt = 0; };

async function addBadWords(raw) {
  // support multiple words separated by comma or newline
  const parts = String(raw)
    .split(/[,\u060C\n]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2 && w.length <= 40);

  if (parts.length === 0) return { added: [], dup: [], bad: true };

  const current = await getBadWords(true);
  const currentNorm = new Set(current.map((w) => normalizeFa(w)));

  const added = [];
  const dup = [];
  for (const w of parts) {
    const n = normalizeFa(w);
    if (!n) continue;
    if (currentNorm.has(n)) { dup.push(w); continue; }
    currentNorm.add(n);
    added.push(w);
  }

  if (added.length) {
    await kv(['SADD', WORDS_KEY, ...added]);
    invalidateWords();
  }
  return { added, dup, bad: false };
}

async function removeBadWord(word) {
  const r = await kv(['SREM', WORDS_KEY, word]);
  invalidateWords();
  return Number(r) > 0;
}

/** normalize Arabic/Persian letters, strip ZWNJ/diacritics */
function normalizeFa(s = '') {
  return String(s)
    .toLowerCase()
    .replace(/[\u200c\u200f\u200e\u061c]/g, '')      // ZWNJ + direction marks
    .replace(/[\u064B-\u0652\u0640]/g, '')           // diacritics + tatweel
    .replace(/[\u064a\ufef1\ufbfc\ufbfd]/g, '\u06cc')
    .replace(/[\u0643\ufed9]/g, '\u06a9')
    .replace(/[\u0623\u0625\u0622]/g, '\u0627')
    .replace(/\u0629/g, '\u0647')
    .replace(/[\u06f0-\u06f9]/g, (d) => '0123456789'['\u06f0\u06f1\u06f2\u06f3\u06f4\u06f5\u06f6\u06f7\u06f8\u06f9'.indexOf(d)])
    .replace(/[^\p{L}\p{N}\s@._/:-]/gu, ' ')         // punctuation -> space
    .replace(/\s+/g, ' ')
    .trim();
}

/** check text against a list, returns the matched word */
function matchBadWord(text, list) {
  const t = normalizeFa(text);
  if (!t) return null;
  const words = t.split(' ');
  for (const bw of list) {
    const b = normalizeFa(bw);
    if (!b) continue;
    // multi-word phrase -> substring, single word -> exact match
    if (b.includes(' ') ? t.includes(b) : words.includes(b)) return bw;
  }
  return null;
}

/** sync variant for tests (default list) */
function hasBadWord(text, list) {
  return matchBadWord(text, list || DEFAULT_BAD_WORDS) !== null;
}

const LINK_RE =
  /(https?:\/\/\S+)|(t\.me\/\S+)|(www\.\S+)|([a-z0-9-]+\.(com|org|ir|net|me|info|xyz|io|co|shop|site|online)\b)/i;
const MENTION_RE = /(^|\s)@[a-z0-9_]{5,}/i;

function hasLink(text, msg) {
  if (LINK_RE.test(text)) return true;
  if (MENTION_RE.test(text)) return true;
  for (const e of [...(msg.entities || []), ...(msg.caption_entities || [])]) {
    if (e.type === 'url' || e.type === 'text_link') return true;
  }
  return false;
}

// ==========================================================================
//  Keyboards and static text
// ==========================================================================

const backBtn = (cb) => [{ text: '\ud83d\udd19 \u0628\u0627\u0632\u06af\u0634\u062a', callback_data: cb }];

function mainMenu(isAdmin) {
  return {
    text: '\ud83d\udccc <b>\u0645\u0646\u0648\u06cc \u0627\u0635\u0644\u06cc</b>\n\n\u06cc\u06a9\u06cc \u0627\u0632 \u06af\u0632\u06cc\u0646\u0647\u200c\u0647\u0627 \u0631\u0627 \u0627\u0646\u062a\u062e\u0627\u0628 \u06a9\u0646\u06cc\u062f:',
    keyboard: {
      inline_keyboard: [
        [{ text: '\ud83d\udce2 \u06a9\u0627\u0646\u0627\u0644\u200c\u0647\u0627', callback_data: 'menu:channels' }],
        [{ text: '\ud83d\udc65 \u06af\u0631\u0648\u0647\u200c\u0647\u0627', callback_data: 'menu:groups' }],
        [{ text: '\ud83d\udcde \u0627\u0631\u062a\u0628\u0627\u0637', callback_data: 'menu:contact' }],
        [{ text: '\ud83d\udcdc \u0642\u0648\u0627\u0646\u06cc\u0646', callback_data: 'menu:rules' }],
        ...(isAdmin ? [[{ text: '\u2699\ufe0f \u0645\u062f\u06cc\u0631\u06cc\u062a', callback_data: 'adm:home' }]] : []),
      ],
    },
  };
}

const ADMIN_MENU = {
  text: '\u2699\ufe0f <b>\u067e\u0646\u0644 \u0645\u062f\u06cc\u0631\u06cc\u062a</b>\n\n\u06af\u0632\u06cc\u0646\u0647 \u0631\u0627 \u0627\u0646\u062a\u062e\u0627\u0628 \u06a9\u0646\u06cc\u062f:',
  keyboard: {
    inline_keyboard: [
      [{ text: '\ud83d\udcca \u0622\u0645\u0627\u0631', callback_data: 'adm:stats' }],
      [{ text: '\ud83d\udccb \u06af\u0631\u0648\u0647\u200c\u0647\u0627', callback_data: 'grp:list:0' }],
      [{ text: '\ud83d\udeab \u0628\u0644\u06a9\u200c\u0644\u06cc\u0633\u062a', callback_data: 'bl:list:0' }],
      [{ text: '\u2705 \u0648\u0627\u06cc\u062a\u200c\u0644\u06cc\u0633\u062a', callback_data: 'wl:list:0' }],
      [{ text: '\ud83e\udd2c \u06a9\u0644\u0645\u0627\u062a \u0645\u0645\u0646\u0648\u0639\u0647', callback_data: 'bw:list:0' }],
      backBtn('menu:main'),
    ],
  },
};

const typeIcon = (t) =>
  t === 'user' || t === 'private' ? '\ud83d\udc64' : t === 'channel' ? '\ud83d\udce2' : t === 'hidden_user' ? '\ud83d\udd76' : '\ud83d\udc65';

const typeLabel = (t) =>
  ({ user: '\u06a9\u0627\u0631\u0628\u0631', private: '\u06a9\u0627\u0631\u0628\u0631', channel: '\u06a9\u0627\u0646\u0627\u0644', group: '\u06af\u0631\u0648\u0647', supergroup: '\u0633\u0648\u067e\u0631\u06af\u0631\u0648\u0647' }[t] || t || '\u0646\u0627\u0645\u0634\u062e\u0635');

/** build paginated list view for bl / wl / grp */
function buildListView(kind, items, page) {
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const p = Math.min(Math.max(0, page), pages - 1);
  const slice = items.slice(p * PAGE_SIZE, p * PAGE_SIZE + PAGE_SIZE);

  const rows = slice.map((it) => [
    {
      text: `${typeIcon(it.type)} ${String(it.name || it.title || it.id).slice(0, 28)}`,
      callback_data: `${kind}:view:${it.id}:${p}`,
    },
    { text: '\ud83d\uddd1', callback_data: `${kind}:del:${it.id}:${p}` },
  ]);

  const nav = [];
  if (p > 0) nav.push({ text: '\u25c0\ufe0f \u0642\u0628\u0644\u06cc', callback_data: `${kind}:list:${p - 1}` });
  if (pages > 1) nav.push({ text: `${p + 1}/${pages}`, callback_data: 'nop' });
  if (p < pages - 1) nav.push({ text: '\u0628\u0639\u062f\u06cc \u25b6\ufe0f', callback_data: `${kind}:list:${p + 1}` });

  const counts = {
    users: items.filter((i) => i.type === 'user' || i.type === 'private').length,
    channels: items.filter((i) => i.type === 'channel').length,
    groups: items.filter((i) => i.type === 'group' || i.type === 'supergroup').length,
  };

  const head =
    kind === 'bl'
      ? '\ud83d\udeab <b>\u0628\u0644\u06a9\u200c\u0644\u06cc\u0633\u062a</b>'
      : kind === 'wl'
      ? '\u2705 <b>\u0648\u0627\u06cc\u062a\u200c\u0644\u06cc\u0633\u062a</b>'
      : '\ud83d\udccb <b>\u06af\u0631\u0648\u0647\u200c\u0647\u0627\u06cc \u0631\u0628\u0627\u062a</b>';

  let text = `${head}\n\n\ud83d\udc64 \u06a9\u0627\u0631\u0628\u0631\u0627\u0646: ${counts.users}\n\ud83d\udce2 \u06a9\u0627\u0646\u0627\u0644\u200c\u0647\u0627: ${counts.channels}\n\ud83d\udc65 \u06af\u0631\u0648\u0647\u200c\u0647\u0627: ${counts.groups}\n\ud83d\udcca \u0645\u062c\u0645\u0648\u0639: ${items.length}\n\n`;
  text += kind === 'bl'
    ? '\u26a0\ufe0f \u0641\u0648\u0631\u0648\u0627\u0631\u062f \u0627\u0632 \u0627\u06cc\u0646 \u0645\u0646\u0627\u0628\u0639 \u0628\u0631\u0627\u06cc <b>\u0647\u0645\u0647</b> \u0645\u0645\u0646\u0648\u0639 \u0627\u0633\u062a (\u062d\u062a\u06cc \u0627\u062f\u0645\u06cc\u0646\u200c\u0647\u0627).\n\n\ud83d\uddd1 = \u062d\u0630\u0641 \u0633\u0631\u06cc\u0639 \u0627\u0632 \u0644\u06cc\u0633\u062a'
    : kind === 'wl'
    ? '\ud83d\udca1 \u0645\u0639\u0627\u0641 \u0627\u0632 \u0641\u06cc\u0644\u062a\u0631 \u0644\u06cc\u0646\u06a9/\u06a9\u0644\u0645\u0627\u062a/\u0627\u0633\u067e\u0645 \u2014 \u0648\u0644\u06cc \u0646\u0647 \u0627\u0632 \u0628\u0644\u06a9\u200c\u0644\u06cc\u0633\u062a.\n\n\ud83d\uddd1 = \u062d\u0630\u0641 \u0633\u0631\u06cc\u0639 \u0627\u0632 \u0644\u06cc\u0633\u062a'
    : '\ud83d\uddd1 = \u062e\u0631\u0648\u062c \u0631\u0628\u0627\u062a \u0627\u0632 \u06af\u0631\u0648\u0647';

  return {
    text,
    keyboard: {
      inline_keyboard: [...rows, ...(nav.length ? [nav] : []), backBtn('adm:home')],
    },
  };
}

/** bad-words management view */
function buildWordsView(words, page) {
  const sorted = words.slice().sort((a, b) => a.localeCompare(b, 'fa'));
  const pages = Math.max(1, Math.ceil(sorted.length / WORDS_PAGE));
  const p = Math.min(Math.max(0, page), pages - 1);
  const slice = sorted.slice(p * WORDS_PAGE, p * WORDS_PAGE + WORDS_PAGE);

  // two columns per row to keep the list compact.
  // \u26a0\ufe0f callback_data is capped at 64 bytes and URL-encoded Persian is ~6x,
  //    so we send the index in the sorted list instead of the word.
  const rows = [];
  for (let i = 0; i < slice.length; i += 2) {
    const row = [];
    for (let j = 0; j < 2 && i + j < slice.length; j++) {
      const idx = p * WORDS_PAGE + i + j;
      const w = slice[i + j];
      const label = w.length > 18 ? w.slice(0, 17) + '\u2026' : w;
      row.push({ text: `\ud83d\uddd1 ${label}`, callback_data: `bw:del:${idx}:${p}` });
    }
    rows.push(row);
  }

  const nav = [];
  if (p > 0) nav.push({ text: '\u25c0\ufe0f \u0642\u0628\u0644\u06cc', callback_data: `bw:list:${p - 1}` });
  if (pages > 1) nav.push({ text: `${p + 1}/${pages}`, callback_data: 'nop' });
  if (p < pages - 1) nav.push({ text: '\u0628\u0639\u062f\u06cc \u25b6\ufe0f', callback_data: `bw:list:${p + 1}` });

  let text = `\ud83e\udd2c <b>\u06a9\u0644\u0645\u0627\u062a \u0645\u0645\u0646\u0648\u0639\u0647</b>\n\n\ud83d\udcca \u0645\u062c\u0645\u0648\u0639: ${sorted.length} \u06a9\u0644\u0645\u0647\n\n`;
  if (sorted.length === 0) {
    text += '\u274c \u0644\u06cc\u0633\u062a \u062e\u0627\u0644\u06cc \u0627\u0633\u062a \u2014 \u0647\u06cc\u0686 \u06a9\u0644\u0645\u0647\u200c\u0627\u06cc \u0641\u06cc\u0644\u062a\u0631 \u0646\u0645\u06cc\u200c\u0634\u0648\u062f.\n\n';
  } else {
    text += `\u0635\u0641\u062d\u0647 ${p + 1} \u0627\u0632 ${pages} \u2014 \u0631\u0648\u06cc \u0647\u0631 \u06a9\u0644\u0645\u0647 \u0628\u0632\u0646\u06cc\u062f \u062a\u0627 \u062d\u0630\u0641 \u0634\u0648\u062f.\n\n`;
  }
  text +=
    '<b>\u0627\u0641\u0632\u0648\u062f\u0646:</b>\n' +
    '<code>/addword \u06a9\u0644\u0645\u0647</code>\n' +
    '\u0686\u0646\u062f \u06a9\u0644\u0645\u0647 \u0628\u0627 \u06a9\u0627\u0645\u0627:\n' +
    '<code>/addword \u06a9\u0644\u0645\u0647\u06f1\u060c \u06a9\u0644\u0645\u0647\u06f2\u060c \u06a9\u0644\u0645\u0647\u06f3</code>\n\n' +
    '<b>\u062d\u0630\u0641:</b> <code>/delword \u06a9\u0644\u0645\u0647</code>\n' +
    '<b>\u062a\u0633\u062a:</b> <code>/testword \u06cc\u06a9 \u062c\u0645\u0644\u0647</code>';

  return {
    text,
    keyboard: {
      inline_keyboard: [
        ...rows,
        ...(nav.length ? [nav] : []),
        [
          { text: '\u2795 \u0631\u0627\u0647\u0646\u0645\u0627\u06cc \u0627\u0641\u0632\u0648\u062f\u0646', callback_data: 'bw:help' },
          { text: '\u267b\ufe0f \u0628\u0627\u0632\u06af\u0631\u062f\u0627\u0646\u06cc \u067e\u06cc\u0634\u200c\u0641\u0631\u0636', callback_data: 'bw:reset' },
        ],
        backBtn('adm:home'),
      ],
    },
  };
}

// ==========================================================================
//  Callback Query
// ==========================================================================

async function handleCallback(cb) {
  const chatId = cb.message?.chat?.id;
  const msgId = cb.message?.message_id;
  const data = cb.data || '';
  const isAdmin = ADMIN_IDS.includes(cb.from.id);

  const ack = (text, alert = false) =>
    tgApi('answerCallbackQuery', { callback_query_id: cb.id, text, show_alert: alert });

  // \ud83d\udd27 MAIN BUG in old version: startsWith("bl_") matched before "bl_remove_" so the
  //     delete button never fired. Routing now uses separated segments.
  const [ns, action, arg1, arg2] = data.split(':');

  const adminOnly = ['adm', 'bl', 'wl', 'grp', 'bw'].includes(ns);
  if (adminOnly && !isAdmin) {
    await ack('\u26d4\ufe0f \u062f\u0633\u062a\u0631\u0633\u06cc \u0646\u062f\u0627\u0631\u06cc\u062f!', true);
    return;
  }

  let text = '';
  let keyboard = null;

  if (ns === 'nop') {
    await ack();
    return;
  }

  if (ns === 'menu') {
    if (action === 'main') ({ text, keyboard } = mainMenu(isAdmin));
    else if (action === 'channels') {
      text = '\ud83d\udce2 <b>\u06a9\u0627\u0646\u0627\u0644\u200c\u0647\u0627\u06cc \u0645\u0627:</b>';
      keyboard = {
        inline_keyboard: [
          [{ text: '\u0627\u0646\u062f\u06cc\u0634\u0647 \u067e\u0647\u0644\u0648\u06cc\u0633\u0645', url: 'https://t.me/andishepahlavism' }],
          [{ text: '\u0641\u0631\u0648\u067e\u0627\u0634\u06cc', url: 'https://t.me/froopashee2' }],
          [{ text: '\u0627\u0644\u0641\u0628\u0627\u06cc \u0633\u06cc\u0627\u0633\u062a', url: 'https://t.me/Allephba' }],
          backBtn('menu:main'),
        ],
      };
    } else if (action === 'groups') {
      text = '\ud83d\udc65 <b>\u06af\u0631\u0648\u0647\u200c\u0647\u0627\u06cc \u0645\u0627:</b>';
      keyboard = {
        inline_keyboard: [
          [{ text: '\u06af\u0641\u062a\u06af\u0648\u06cc \u0627\u0646\u062f\u06cc\u0634\u0647 \u067e\u0647\u0644\u0648\u06cc\u0633\u0645', url: 'https://t.me/goftemanazadAp' }],
          [{ text: '\u06af\u0641\u062a\u06af\u0648\u06cc \u0641\u0631\u0648\u067e\u0627\u0634\u06cc', url: 'https://t.me/+6nIM1oBqTaVjNzYy' }],
          backBtn('menu:main'),
        ],
      };
    } else if (action === 'contact') {
      text = '\ud83d\udcde <b>\u0627\u0631\u062a\u0628\u0627\u0637 \u0628\u0627 \u0645\u0627:</b>';
      keyboard = {
        inline_keyboard: [
          [{ text: '\u0627\u0631\u062a\u0628\u0627\u0637 \u0627\u0646\u062f\u06cc\u0634\u0647', url: 'https://t.me/+aaJQcUU7ZIMyZWQ8' }],
          [{ text: '\u0627\u0631\u062a\u0628\u0627\u0637 \u0641\u0631\u0648\u067e\u0627\u0634\u06cc', url: 'https://t.me/+GZOW85iRkX45ODJi' }],
          backBtn('menu:main'),
        ],
      };
    } else if (action === 'rules') {
      text =
        '\ud83d\udcdc <b>\u0642\u0648\u0627\u0646\u06cc\u0646:</b>\n\n\u06f1. \u062a\u0648\u0647\u06cc\u0646 \u0648 \u06a9\u0644\u0645\u0627\u062a \u0631\u06a9\u06cc\u06a9 \u0645\u0645\u0646\u0648\u0639.\n\u06f2. \u0627\u0631\u0633\u0627\u0644 \u0644\u06cc\u0646\u06a9 \u0648 \u062a\u0628\u0644\u06cc\u063a\u0627\u062a \u0645\u0645\u0646\u0648\u0639.\n\u06f3. \u067e\u06cc\u0627\u0645 \u062a\u06a9\u0631\u0627\u0631\u06cc (\u0627\u0633\u067e\u0645) \u0645\u0645\u0646\u0648\u0639.\n\u06f4. \u0641\u0648\u0631\u0648\u0627\u0631\u062f \u0627\u0632 \u0645\u0646\u0627\u0628\u0639 \u0628\u0644\u06a9\u200c\u0644\u06cc\u0633\u062a \u0645\u0645\u0646\u0648\u0639.\n\u06f5. \u0646\u0638\u0645 \u06af\u0631\u0648\u0647 \u0631\u0627 \u0631\u0639\u0627\u06cc\u062a \u06a9\u0646\u06cc\u062f.';
      keyboard = { inline_keyboard: [backBtn('menu:main')] };
    }
  } else if (ns === 'adm') {
    if (action === 'home') ({ text, keyboard } = ADMIN_MENU);
    else if (action === 'stats') {
      const [messages, deleted, blocked, groups, bl, wl] = await Promise.all([
        statGet('messages'),
        statGet('deleted'),
        statGet('blocked_forwards'),
        entryList('grp'),
        entryList('bl'),
        entryList('wl'),
      ]);
      text =
        `\ud83d\udcca <b>\u0622\u0645\u0627\u0631 \u0631\u0628\u0627\u062a</b>\n\n` +
        `\ud83d\udce8 \u06a9\u0644 \u067e\u06cc\u0627\u0645\u200c\u0647\u0627: ${messages}\n` +
        `\ud83d\uddd1 \u062d\u0630\u0641\u200c\u0634\u062f\u0647: ${deleted}\n` +
        `\ud83d\udeab \u0641\u0648\u0631\u0648\u0627\u0631\u062f \u0628\u0644\u0627\u06a9\u200c\u0634\u062f\u0647: ${blocked}\n\n` +
        `\ud83d\udccb \u06af\u0631\u0648\u0647\u200c\u0647\u0627\u06cc \u0641\u0639\u0627\u0644: ${groups.length}\n` +
        `\ud83d\udeab \u0628\u0644\u06a9\u200c\u0644\u06cc\u0633\u062a: ${bl.length}\n` +
        `\u2705 \u0648\u0627\u06cc\u062a\u200c\u0644\u06cc\u0633\u062a: ${wl.length}`;
      keyboard = { inline_keyboard: [backBtn('adm:home')] };
    }
  } else if (ns === 'bw') {
    if (action === 'list') {
      const words = await getBadWords(true);
      ({ text, keyboard } = buildWordsView(words, parseInt(arg1, 10) || 0));
    } else if (action === 'del') {
      // arg1 = index into sorted list (not the word - 64-byte cap)
      const all = await getBadWords(true);
      const sorted = all.slice().sort((a, b) => a.localeCompare(b, 'fa'));
      const idx = parseInt(arg1, 10);
      const word = Number.isInteger(idx) ? sorted[idx] : undefined;

      if (word === undefined) {
        await ack('\u26a0\ufe0f \u0644\u06cc\u0633\u062a \u062a\u063a\u06cc\u06cc\u0631 \u06a9\u0631\u062f\u0647 \u2014 \u062f\u0648\u0628\u0627\u0631\u0647 \u062a\u0644\u0627\u0634 \u06a9\u0646\u06cc\u062f', true);
        const v = buildWordsView(all, parseInt(arg2, 10) || 0);
        await editView(chatId, msgId, v.text, v.keyboard);
        return;
      }
      const ok = await removeBadWord(word);
      await ack(ok ? `\u2705 \u00ab${word}\u00bb \u062d\u0630\u0641 \u0634\u062f` : '\u26a0\ufe0f \u067e\u06cc\u062f\u0627 \u0646\u0634\u062f');
      const fresh = await getBadWords(true);
      const v = buildWordsView(fresh, parseInt(arg2, 10) || 0);
      await editView(chatId, msgId, v.text, v.keyboard);
      return;
    } else if (action === 'help') {
      text =
        '\u2795 <b>\u0627\u0641\u0632\u0648\u062f\u0646 \u06a9\u0644\u0645\u0647 \u0645\u0645\u0646\u0648\u0639\u0647</b>\n\n' +
        '\u06a9\u0627\u0641\u06cc \u0627\u0633\u062a \u062f\u0631 \u0647\u0645\u06cc\u0646 \u0686\u062a \u0628\u0646\u0648\u06cc\u0633\u06cc\u062f:\n\n' +
        '<code>/addword \u0627\u062d\u0645\u0642</code>\n\n' +
        '<b>\u0686\u0646\u062f \u06a9\u0644\u0645\u0647 \u0628\u0627 \u0647\u0645</b> (\u0628\u0627 \u06a9\u0627\u0645\u0627 \u06cc\u0627 \u062e\u0637 \u062c\u062f\u06cc\u062f):\n' +
        '<code>/addword \u06a9\u0644\u0645\u0647\u06f1\u060c \u06a9\u0644\u0645\u0647\u06f2\u060c \u06a9\u0644\u0645\u0647\u06f3</code>\n\n' +
        '<b>\u0639\u0628\u0627\u0631\u062a \u0686\u0646\u062f\u06a9\u0644\u0645\u0647\u200c\u0627\u06cc</b> \u0647\u0645 \u067e\u0634\u062a\u06cc\u0628\u0627\u0646\u06cc \u0645\u06cc\u200c\u0634\u0648\u062f:\n' +
        '<code>/addword \u0628\u0631\u0648 \u06af\u0645 \u0634\u0648</code>\n' +
        '\u21b3 \u0641\u0642\u0637 \u0648\u0642\u062a\u06cc \u06a9\u0644 \u0639\u0628\u0627\u0631\u062a \u067e\u0634\u062a\u200c\u0633\u0631\u0647\u0645 \u0628\u06cc\u0627\u06cc\u062f \u062d\u0630\u0641 \u0645\u06cc\u200c\u0634\u0648\u062f.\n\n' +
        '<b>\u062a\u06a9\u200c\u06a9\u0644\u0645\u0647\u200c\u0647\u0627</b> \u0628\u0627 \u0645\u0637\u0627\u0628\u0642\u062a \u06a9\u0627\u0645\u0644 \u0686\u06a9 \u0645\u06cc\u200c\u0634\u0648\u0646\u062f\u060c \u067e\u0633\n' +
        '\u00ab\u06a9\u0635\u00bb \u062f\u0627\u062e\u0644 \u00ab\u0645\u0634\u062e\u0635\u00bb \u0627\u0634\u062a\u0628\u0627\u0647\u06cc \u06af\u06cc\u0631 \u0646\u0645\u06cc\u200c\u0627\u0641\u062a\u062f.\n\n' +
        '\ud83d\udd24 \u0646\u06cc\u0645\u200c\u0641\u0627\u0635\u0644\u0647\u060c \u0627\u0639\u0631\u0627\u0628\u060c \u0648 \u06cc/\u06a9 \u0639\u0631\u0628\u06cc \u062e\u0648\u062f\u06a9\u0627\u0631 \u06cc\u06a9\u0633\u0627\u0646\u200c\u0633\u0627\u0632\u06cc \u0645\u06cc\u200c\u0634\u0648\u0646\u062f.\n\n' +
        '<b>\u062a\u0633\u062a:</b> <code>/testword \u0627\u06cc\u0646 \u06cc\u06a9 \u062c\u0645\u0644\u0647 \u0622\u0632\u0645\u0627\u06cc\u0634\u06cc \u0627\u0633\u062a</code>';
      keyboard = { inline_keyboard: [backBtn('bw:list:0')] };
    } else if (action === 'reset') {
      text =
        '\u267b\ufe0f <b>\u0628\u0627\u0632\u06af\u0631\u062f\u0627\u0646\u06cc \u0644\u06cc\u0633\u062a \u067e\u06cc\u0634\u200c\u0641\u0631\u0636</b>\n\n' +
        `${DEFAULT_BAD_WORDS.length} \u06a9\u0644\u0645\u0647\u200c\u06cc \u067e\u06cc\u0634\u200c\u0641\u0631\u0636 \u0628\u0647 \u0644\u06cc\u0633\u062a \u0627\u0636\u0627\u0641\u0647 \u0645\u06cc\u200c\u0634\u0648\u0646\u062f.\n\n` +
        '\u06a9\u0644\u0645\u0627\u062a \u0641\u0639\u0644\u06cc <b>\u062d\u0630\u0641 \u0646\u0645\u06cc\u200c\u0634\u0648\u0646\u062f</b> \u2014 \u0641\u0642\u0637 \u067e\u06cc\u0634\u200c\u0641\u0631\u0636\u200c\u0647\u0627\u06cc \u063a\u0627\u06cc\u0628 \u0627\u0636\u0627\u0641\u0647 \u0645\u06cc\u200c\u06af\u0631\u062f\u0646\u062f.';
      keyboard = {
        inline_keyboard: [
          [
            { text: '\u2705 \u0628\u0644\u0647\u060c \u0627\u0636\u0627\u0641\u0647 \u06a9\u0646', callback_data: 'bw:doreset:0:0' },
            { text: '\u274c \u0627\u0646\u0635\u0631\u0627\u0641', callback_data: 'bw:list:0' },
          ],
        ],
      };
    } else if (action === 'doreset') {
      await kvPipe([
        ['SADD', WORDS_KEY, ...DEFAULT_BAD_WORDS],
        ['SET', WORDS_SEEDED, '1'],
      ]);
      invalidateWords();
      await ack('\u2705 \u067e\u06cc\u0634\u200c\u0641\u0631\u0636\u200c\u0647\u0627 \u0627\u0636\u0627\u0641\u0647 \u0634\u062f\u0646\u062f');
      const words = await getBadWords(true);
      const v = buildWordsView(words, 0);
      await editView(chatId, msgId, v.text, v.keyboard);
      return;
    }
  } else if (ns === 'bl' || ns === 'wl' || ns === 'grp') {
    const items = await entryList(ns);

    if (action === 'list') {
      if (items.length === 0) {
        text =
          ns === 'bl'
            ? '\ud83d\udeab <b>\u0628\u0644\u06a9\u200c\u0644\u06cc\u0633\u062a</b>\n\n\u274c \u0644\u06cc\u0633\u062a \u062e\u0627\u0644\u06cc \u0627\u0633\u062a.\n\n<b>\u0627\u0641\u0632\u0648\u062f\u0646:</b>\n\u2022 \u06cc\u06a9 \u067e\u06cc\u0627\u0645 \u0627\u0632 \u0622\u0646 \u06a9\u0627\u0631\u0628\u0631/\u06a9\u0627\u0646\u0627\u0644 \u0631\u0627 \u0628\u0631\u0627\u06cc\u0645 \u0641\u0648\u0631\u0648\u0627\u0631\u062f \u06a9\u0646\u06cc\u062f\n\u2022 \u06cc\u0627 <code>/bl \u0622\u06cc\u062f\u06cc</code> \u2014 <code>/bl @username</code>\n\n<b>\u062d\u0630\u0641:</b> <code>/unbl \u0622\u06cc\u062f\u06cc</code>'
            : ns === 'wl'
            ? '\u2705 <b>\u0648\u0627\u06cc\u062a\u200c\u0644\u06cc\u0633\u062a</b>\n\n\u274c \u0644\u06cc\u0633\u062a \u062e\u0627\u0644\u06cc \u0627\u0633\u062a.\n\n<b>\u0627\u0641\u0632\u0648\u062f\u0646:</b> <code>/wl \u0622\u06cc\u062f\u06cc</code> \u06cc\u0627 <code>/wl @username</code>\n<b>\u062d\u0630\u0641:</b> <code>/unwl \u0622\u06cc\u062f\u06cc</code>'
            : '\ud83d\udccb <b>\u06af\u0631\u0648\u0647\u200c\u0647\u0627</b>\n\n\u274c \u0647\u06cc\u0686 \u06af\u0631\u0648\u0647\u06cc \u062b\u0628\u062a \u0646\u0634\u062f\u0647.';
        keyboard = { inline_keyboard: [backBtn('adm:home')] };
      } else {
        ({ text, keyboard } = buildListView(ns, items, parseInt(arg1, 10) || 0));
      }
    } else if (action === 'view') {
      const item = items.find((i) => String(i.id) === String(arg1));
      if (!item) {
        text = '\u274c \u0622\u06cc\u062a\u0645 \u06cc\u0627\u0641\u062a \u0646\u0634\u062f (\u0634\u0627\u06cc\u062f \u0642\u0628\u0644\u0627\u064b \u062d\u0630\u0641 \u0634\u062f\u0647).';
        keyboard = { inline_keyboard: [backBtn(`${ns}:list:0`)] };
      } else {
        text =
          `${typeIcon(item.type)} <b>\u062c\u0632\u0626\u06cc\u0627\u062a ${KIND[ns].label}</b>\n\n` +
          `\ud83d\udccc \u0646\u0627\u0645: ${esc(item.name || item.title)}\n` +
          `\ud83c\udd94 \u0634\u0646\u0627\u0633\u0647: <code>${item.id}</code>\n` +
          `\ud83d\udcdd \u0646\u0648\u0639: ${typeLabel(item.type)}\n` +
          (item.username ? `\ud83d\udc64 \u06cc\u0648\u0632\u0631\u0646\u06cc\u0645: @${esc(item.username)}\n` : '') +
          (item.addedAt ? `\ud83d\udd53 \u062a\u0627\u0631\u06cc\u062e: ${new Date(item.addedAt).toLocaleString('fa-IR')}\n` : '');
        keyboard = {
          inline_keyboard: [
            [
              {
                text: ns === 'grp' ? '\ud83d\udeaa \u062e\u0631\u0648\u062c \u0627\u0632 \u06af\u0631\u0648\u0647' : `\ud83d\uddd1 \u062d\u0630\u0641 \u0627\u0632 ${KIND[ns].label}`,
                callback_data: `${ns}:del:${item.id}:${arg2 || 0}`,
              },
            ],
            backBtn(`${ns}:list:${arg2 || 0}`),
          ],
        };
      }
    } else if (action === 'del') {
      // confirmation step - avoid accidental deletion
      const item = items.find((i) => String(i.id) === String(arg1));
      const name = item ? esc(item.name || item.title || item.id) : arg1;
      text =
        ns === 'grp'
          ? `\u2753 <b>\u062a\u0623\u06cc\u06cc\u062f \u062e\u0631\u0648\u062c</b>\n\n\u0631\u0628\u0627\u062a \u0627\u0632 \u06af\u0631\u0648\u0647 \u00ab${name}\u00bb \u062e\u0627\u0631\u062c \u0634\u0648\u062f\u061f`
          : `\u2753 <b>\u062a\u0623\u06cc\u06cc\u062f \u062d\u0630\u0641</b>\n\n\u00ab${name}\u00bb \u0627\u0632 ${KIND[ns].label} \u062d\u0630\u0641 \u0634\u0648\u062f\u061f` +
            (ns === 'bl' ? '\n\n\u267b\ufe0f \u0628\u0639\u062f \u0627\u0632 \u062d\u0630\u0641\u060c \u0641\u0648\u0631\u0648\u0627\u0631\u062f \u0627\u0632 \u0627\u06cc\u0646 \u0645\u0646\u0628\u0639 \u062f\u0648\u0628\u0627\u0631\u0647 \u0622\u0632\u0627\u062f \u0645\u06cc\u200c\u0634\u0648\u062f.' : '');
      keyboard = {
        inline_keyboard: [
          [
            { text: '\u2705 \u0628\u0644\u0647\u060c \u062d\u0630\u0641 \u06a9\u0646', callback_data: `${ns}:yes:${arg1}:${arg2 || 0}` },
            { text: '\u274c \u0627\u0646\u0635\u0631\u0627\u0641', callback_data: `${ns}:list:${arg2 || 0}` },
          ],
        ],
      };
    } else if (action === 'yes') {
      let ok;
      if (ns === 'grp') {
        const left = await tgApi('leaveChat', { chat_id: arg1 });
        await entryRemove('grp', arg1);
        ok = Boolean(left?.ok);
        await ack(ok ? '\u2705 \u0631\u0628\u0627\u062a \u062e\u0627\u0631\u062c \u0634\u062f' : '\u26a0\ufe0f \u062e\u0631\u0648\u062c \u0646\u0627\u0645\u0648\u0641\u0642 \u0628\u0648\u062f\u060c \u0627\u0645\u0627 \u0627\u0632 \u0644\u06cc\u0633\u062a \u067e\u0627\u06a9 \u0634\u062f');
      } else {
        ok = await entryRemove(ns, arg1);
        await ack(ok ? `\u2705 \u0627\u0632 ${KIND[ns].label} \u062d\u0630\u0641 \u0634\u062f` : '\u26a0\ufe0f \u062f\u0631 \u0644\u06cc\u0633\u062a \u0646\u0628\u0648\u062f');
      }
      const fresh = await entryList(ns);
      if (fresh.length === 0) {
        text = `\u2705 \u0627\u0646\u062c\u0627\u0645 \u0634\u062f.\n\n${KIND[ns].label} \u0627\u06a9\u0646\u0648\u0646 \u062e\u0627\u0644\u06cc \u0627\u0633\u062a.`;
        keyboard = { inline_keyboard: [backBtn('adm:home')] };
      } else {
        const v = buildListView(ns, fresh, parseInt(arg2, 10) || 0);
        text = `\u2705 \u0627\u0646\u062c\u0627\u0645 \u0634\u062f.\n\n${v.text}`;
        keyboard = v.keyboard;
      }
      // ack already sent above
      await editView(chatId, msgId, text, keyboard);
      return;
    }
  }

  if (text) await editView(chatId, msgId, text, keyboard);
  await ack();
}

async function editView(chatId, msgId, text, keyboard) {
  const r = await tgApi('editMessageText', {
    chat_id: chatId,
    message_id: msgId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: keyboard || { inline_keyboard: [] },
  });
  // if the message cannot be edited send a fresh one
  if (r && !r.ok && !/message is not modified/i.test(r.description || '')) {
    await send(chatId, text, { reply_markup: keyboard });
  }
}

// ==========================================================================
//  Target resolver for /bl /unbl /wl /unwl
// ==========================================================================

async function resolveTarget(msg, arg) {
  // \u06f1) reply-based target
  const rep = msg.reply_to_message;
  if (!arg && rep) {
    const fwd = getForwardSource(rep);
    if (fwd && fwd.id) return fwd;
    if (rep.sender_chat)
      return { id: rep.sender_chat.id, name: rep.sender_chat.title || '\u0686\u062a', type: rep.sender_chat.type };
    if (rep.from) return { id: rep.from.id, name: fullName(rep.from), type: 'user' };
  }
  if (!arg) return null;

  // \u06f2) numeric id
  if (/^-?\d+$/.test(arg)) {
    const id = Number(arg);
    if (!Number.isSafeInteger(id)) return null;
    return { id, name: `ID ${id}`, type: id < 0 ? 'group' : 'user' };
  }

  // \u06f3) username - works for channels/groups or seen users
  const uname = arg.startsWith('@') ? arg : '@' + arg;
  if (!/^@[a-zA-Z0-9_]{4,}$/.test(uname)) return null;
  const r = await tgApi('getChat', { chat_id: uname });
  if (!r?.ok) return null;
  return {
    id: r.result.id,
    name: r.result.title || fullName(r.result) || uname,
    type: r.result.type === 'private' ? 'user' : r.result.type,
  };
}

// ==========================================================================
//  Message Handler
// ==========================================================================

async function handleMessage(msg, { edited = false } = {}) {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  const isAdmin = ADMIN_IDS.includes(userId);
  const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';
  const text = extractText(msg);
  const cmd = (msg.text || '').trim();

  if (!edited) await statInc('messages');

  // record group, throttled to avoid a KV write per message
  if (isGroup && msg.chat.title) {
    const fresh = await kv(['SET', `grp:touch:${chatId}`, '1', 'NX', 'EX', GROUP_TOUCH_TTL]);
    if (fresh) {
      await entryAdd('grp', { id: chatId, name: msg.chat.title, type: msg.chat.type });
      await kv(['HSET', `grp:meta:${chatId}`, 'username', msg.chat.username || '']);
    }
  }

  // delete join/leave service messages
  if (msg.new_chat_members || msg.left_chat_member) {
    await del(chatId, msg.message_id);
    return;
  }

  // ---------------------------------------------------------------
  // \u06f1) forward blacklist - highest priority, applies to admins too
  // ---------------------------------------------------------------
  if (isGroup) {
    const src = getForwardSource(msg);
    const senderChat = msg.sender_chat?.id ?? null; // message sent on behalf of a channel

    const [srcBlocked, senderBlocked] = await Promise.all([
      src?.id ? entryHas('bl', src.id) : Promise.resolve(false),
      senderChat && !msg.is_automatic_forward ? entryHas('bl', senderChat) : Promise.resolve(false),
    ]);

    if (srcBlocked || senderBlocked) {
      const who = srcBlocked ? src : { name: msg.sender_chat.title || '\u06a9\u0627\u0646\u0627\u0644', id: senderChat };
      console.log('\ud83d\udeab BLACKLIST ENFORCED:', who.id, 'admin:', isAdmin);
      await del(chatId, msg.message_id);
      await kvPipe([
        ['INCRBY', 'stat:blocked_forwards', 1],
        ['INCRBY', 'stat:deleted', 1],
      ]);
      await warn(
        chatId,
        isAdmin
          ? `\ud83d\udeab <b>\u0627\u062e\u0637\u0627\u0631 \u0628\u0647 \u0627\u062f\u0645\u06cc\u0646</b>\n\n\u00ab${esc(who.name)}\u00bb \u062f\u0631 \u0628\u0644\u06a9\u200c\u0644\u06cc\u0633\u062a \u0627\u0633\u062a.\n\u26a0\ufe0f \u062d\u062a\u06cc \u0627\u062f\u0645\u06cc\u0646\u200c\u0647\u0627 \u0647\u0645 \u0646\u0645\u06cc\u200c\u062a\u0648\u0627\u0646\u0646\u062f \u0627\u0632 \u0645\u0646\u0627\u0628\u0639 \u0628\u0644\u06a9\u200c\u0644\u06cc\u0633\u062a \u0641\u0648\u0631\u0648\u0627\u0631\u062f \u06a9\u0646\u0646\u062f.`
          : `\ud83d\udeab \u067e\u06cc\u0627\u0645 \u062d\u0630\u0641 \u0634\u062f\n\n\u0641\u0648\u0631\u0648\u0627\u0631\u062f \u0627\u0632 \u00ab${esc(who.name)}\u00bb \u0645\u0645\u0646\u0648\u0639 \u0627\u0633\u062a.`,
        isAdmin ? 8000 : 5000
      );
      return;
    }
  }

  // ---------------------------------------------------------------
  // \u06f2) \u0645\u0639\u0627\u0641\u06cc\u062a\u200c\u0647\u0627 (\u0641\u0642\u0637 \u0628\u0631\u0627\u06cc filters\u06cc \u0639\u0645\u0648\u0645\u06cc\u060c \u0646\u0647 \u0628\u0644\u06a9\u200c\u0644\u06cc\u0633\u062a)
  // ---------------------------------------------------------------
  const senderChatId = msg.sender_chat?.id ?? null;
  const [wlUser, wlSender, wlChat] = await Promise.all([
    userId ? entryHas('wl', userId) : Promise.resolve(false),
    senderChatId ? entryHas('wl', senderChatId) : Promise.resolve(false),
    entryHas('wl', chatId),
  ]);

  const isCommandToBot = /^\/[a-z0-9_]+(@[a-zA-Z0-9_]+)?(\s|$)/i.test(cmd);
  const isExempt =
    isAdmin || wlUser || wlSender || wlChat || userId === 777000 || Boolean(msg.is_automatic_forward);

  // ---------------------------------------------------------------
  // \u06f3) filters\u06cc \u0639\u0645\u0648\u0645\u06cc
  // ---------------------------------------------------------------
  if (isGroup && !isExempt && text) {
    const words = await getBadWords();
    const bad = matchBadWord(text, words) !== null;
    // bot commands must not trip the @mention filter
    const link = !isCommandToBot && hasLink(text, msg);

    if (bad || link) {
      await del(chatId, msg.message_id);
      await statInc('deleted');
      await warn(
        chatId,
        bad ? '\u26a0\ufe0f \u0627\u0633\u062a\u0641\u0627\u062f\u0647 \u0627\u0632 \u06a9\u0644\u0645\u0627\u062a \u0646\u0627\u0645\u0646\u0627\u0633\u0628 \u0645\u0645\u0646\u0648\u0639 \u0627\u0633\u062a!' : '\u26a0\ufe0f \u0627\u0631\u0633\u0627\u0644 \u0644\u06cc\u0646\u06a9 \u0648 \u062a\u0628\u0644\u06cc\u063a\u0627\u062a \u0645\u0645\u0646\u0648\u0639 \u0627\u0633\u062a!',
        6000
      );
      return;
    }

    // anti-spam - key hashed per user+chat
    if (kvReady() && text.length > 10 && !edited) {
      const fp = hashText(`${chatId}:${userId}:${normalizeFa(text).slice(0, 120)}`);
      const fresh = await kv(['SET', `spam:${fp}`, '1', 'NX', 'EX', SPAM_TTL]);
      if (!fresh) {
        await del(chatId, msg.message_id);
        await statInc('deleted');
        await warn(chatId, '\u26a0\ufe0f \u0627\u0631\u0633\u0627\u0644 \u067e\u06cc\u0627\u0645 \u062a\u06a9\u0631\u0627\u0631\u06cc (\u0627\u0633\u067e\u0645) \u0645\u0645\u0646\u0648\u0639 \u0627\u0633\u062a!', 6000);
        return;
      }
    }
  }

  // ---------------------------------------------------------------
  // \u06f4) admin commands (private chat)
  // ---------------------------------------------------------------
  if (isAdmin && !isGroup) {
    // forwarding in PM = add to blacklist
    const src = getForwardSource(msg);
    if (src && !isCommandToBot) {
      if (!src.id) {
        await send(chatId, '\u26a0\ufe0f \u0641\u0631\u0633\u062a\u0646\u062f\u0647\u200c\u06cc \u0627\u06cc\u0646 \u067e\u06cc\u0627\u0645 \u062d\u0633\u0627\u0628 \u062e\u0648\u062f \u0631\u0627 \u0645\u062e\u0641\u06cc \u06a9\u0631\u062f\u0647 \u0648 \u0634\u0646\u0627\u0633\u0647\u200c\u0627\u06cc \u0646\u062f\u0627\u0631\u062f\u061b \u0646\u0645\u06cc\u200c\u062a\u0648\u0627\u0646 \u0628\u0644\u06a9\u200c\u0644\u06cc\u0633\u062a \u06a9\u0631\u062f.');
        return;
      }
      if (await entryHas('bl', src.id)) {
        await send(
          chatId,
          `\u26a0\ufe0f \u0642\u0628\u0644\u0627\u064b \u062f\u0631 \u0628\u0644\u06a9\u200c\u0644\u06cc\u0633\u062a \u0627\u0633\u062a!\n\n\ud83d\udccc ${esc(src.name)}\n\ud83c\udd94 <code>${src.id}</code>`,
          { reply_markup: { inline_keyboard: [[{ text: '\ud83d\uddd1 \u062d\u0630\u0641 \u0627\u0632 \u0628\u0644\u06a9\u200c\u0644\u06cc\u0633\u062a', callback_data: `bl:del:${src.id}:0` }]] } }
        );
      } else {
        await entryAdd('bl', src);
        await send(
          chatId,
          `\u2705 \u0628\u0647 \u0628\u0644\u06a9\u200c\u0644\u06cc\u0633\u062a \u0627\u0636\u0627\u0641\u0647 \u0634\u062f!\n\n\ud83d\udccc ${esc(src.name)}\n\ud83c\udd94 <code>${src.id}</code>\n\ud83d\udcdd ${typeLabel(src.type)}\n\n\ud83d\udeab \u0627\u0632 \u0627\u06cc\u0646 \u067e\u0633 \u0647\u06cc\u0686\u200c\u06a9\u0633 (\u062d\u062a\u06cc \u0627\u062f\u0645\u06cc\u0646\u200c\u0647\u0627) \u0646\u0645\u06cc\u200c\u062a\u0648\u0627\u0646\u062f \u0627\u0632 \u0627\u06cc\u0646 \u0645\u0646\u0628\u0639 \u0641\u0648\u0631\u0648\u0627\u0631\u062f \u06a9\u0646\u062f.`,
          { reply_markup: { inline_keyboard: [[{ text: '\u21a9\ufe0f \u0644\u063a\u0648 / \u062d\u0630\u0641 \u0627\u0632 \u0628\u0644\u06a9\u200c\u0644\u06cc\u0633\u062a', callback_data: `bl:yes:${src.id}:0` }]] } }
        );
      }
      return;
    }
  }

  const [rawCmd, ...args] = cmd.split(/\s+/);
  const base = rawCmd.split('@')[0].toLowerCase();
  const arg = args[0];

  if (isAdmin && ['/bl', '/unbl', '/wl', '/unwl'].includes(base)) {
    if (isGroup) await del(chatId, msg.message_id);
    const kind = base.includes('wl') ? 'wl' : 'bl';
    const removing = base.startsWith('/un');
    const target = await resolveTarget(msg, arg);

    if (!target) {
      await send(
        chatId,
        `\u274c <b>\u0647\u062f\u0641 \u0645\u0634\u062e\u0635 \u0646\u0634\u062f.</b>\n\n<b>\u0631\u0648\u0634\u200c\u0647\u0627:</b>\n\u2022 <code>${base} 123456789</code>\n\u2022 <code>${base} @username</code>\n\u2022 \u0631\u06cc\u067e\u0644\u0627\u06cc \u0631\u0648\u06cc \u067e\u06cc\u0627\u0645 + <code>${base}</code>`
      );
      return;
    }

    if (removing) {
      const ok = await entryRemove(kind, target.id);
      await send(
        chatId,
        ok
          ? `\u2705 \u0627\u0632 ${KIND[kind].label} \u062d\u0630\u0641 \u0634\u062f.\n\n\ud83d\udccc ${esc(target.name)}\n\ud83c\udd94 <code>${target.id}</code>` +
              (kind === 'bl' ? '\n\n\u267b\ufe0f \u0641\u0648\u0631\u0648\u0627\u0631\u062f \u0627\u0632 \u0627\u06cc\u0646 \u0645\u0646\u0628\u0639 \u062f\u0648\u0628\u0627\u0631\u0647 \u0622\u0632\u0627\u062f \u0634\u062f.' : '')
          : `\u26a0\ufe0f <code>${target.id}</code> \u062f\u0631 ${KIND[kind].label} \u0646\u0628\u0648\u062f.`
      );
    } else {
      if (await entryHas(kind, target.id)) {
        await send(chatId, `\u26a0\ufe0f <code>${target.id}</code> \u0627\u0632 \u0642\u0628\u0644 \u062f\u0631 ${KIND[kind].label} \u0627\u0633\u062a.`);
      } else {
        await entryAdd(kind, target);
        await send(
          chatId,
          `\u2705 \u0628\u0647 ${KIND[kind].label} \u0627\u0636\u0627\u0641\u0647 \u0634\u062f.\n\n\ud83d\udccc ${esc(target.name)}\n\ud83c\udd94 <code>${target.id}</code>\n\ud83d\udcdd ${typeLabel(target.type)}` +
            (kind === 'wl' ? '\n\n\ud83d\udca1 \u0645\u0639\u0627\u0641 \u0627\u0632: \u0644\u06cc\u0646\u06a9\u060c \u06a9\u0644\u0645\u0627\u062a \u0631\u06a9\u06cc\u06a9\u060c \u0627\u0633\u067e\u0645\n\u26a0\ufe0f \u063a\u06cc\u0631\u0645\u0639\u0627\u0641 \u0627\u0632: \u0628\u0644\u06a9\u200c\u0644\u06cc\u0633\u062a' : ''),
          { reply_markup: { inline_keyboard: [[{ text: `\ud83d\uddd1 \u062d\u0630\u0641 \u0627\u0632 ${KIND[kind].label}`, callback_data: `${kind}:del:${target.id}:0` }]] } }
        );
      }
    }
    return;
  }

  // --- bad words management ---
  if (isAdmin && ['/addword', '/delword', '/listwords', '/testword'].includes(base)) {
    if (isGroup) await del(chatId, msg.message_id);
    const rest = cmd.slice(rawCmd.length).trim();

    if (base === '/addword') {
      if (!rest) {
        await send(
          chatId,
          '\u274c \u06a9\u0644\u0645\u0647\u200c\u0627\u06cc \u0646\u0646\u0648\u0634\u062a\u06cc\u062f.\n\n<b>\u0645\u062b\u0627\u0644:</b>\n<code>/addword \u0627\u062d\u0645\u0642</code>\n<code>/addword \u06a9\u0644\u0645\u0647\u06f1\u060c \u06a9\u0644\u0645\u0647\u06f2</code>'
        );
        return;
      }
      const { added, dup, bad } = await addBadWords(rest);
      if (bad) {
        await send(chatId, '\u274c \u06a9\u0644\u0645\u0647 \u0645\u0639\u062a\u0628\u0631 \u0646\u0628\u0648\u062f (\u0628\u0627\u06cc\u062f \u0628\u06cc\u0646 \u06f2 \u062a\u0627 \u06f4\u06f0 \u062d\u0631\u0641 \u0628\u0627\u0634\u062f).');
        return;
      }
      let t = '';
      if (added.length) t += `\u2705 <b>${added.length} \u06a9\u0644\u0645\u0647 \u0627\u0636\u0627\u0641\u0647 \u0634\u062f:</b>\n${added.map((w) => '\u2022 ' + esc(w)).join('\n')}\n\n`;
      if (dup.length) t += `\u26a0\ufe0f <b>\u0642\u0628\u0644\u0627\u064b \u0645\u0648\u062c\u0648\u062f \u0628\u0648\u062f:</b>\n${dup.map((w) => '\u2022 ' + esc(w)).join('\n')}\n\n`;
      const total = (await getBadWords(true)).length;
      t += `\ud83d\udcca \u0645\u062c\u0645\u0648\u0639: ${total} \u06a9\u0644\u0645\u0647`;
      await send(chatId, t, {
        reply_markup: { inline_keyboard: [[{ text: '\ud83e\udd2c \u0645\u0634\u0627\u0647\u062f\u0647 \u0644\u06cc\u0633\u062a', callback_data: 'bw:list:0' }]] },
      });
      return;
    }

    if (base === '/delword') {
      if (!rest) {
        await send(chatId, '\u274c \u06a9\u0644\u0645\u0647\u200c\u0627\u06cc \u0646\u0646\u0648\u0634\u062a\u06cc\u062f.\n\n<b>\u0645\u062b\u0627\u0644:</b> <code>/delword \u0627\u062d\u0645\u0642</code>');
        return;
      }
      const ok = await removeBadWord(rest);
      const total = (await getBadWords(true)).length;
      await send(
        chatId,
        ok
          ? `\u2705 \u00ab${esc(rest)}\u00bb \u062d\u0630\u0641 \u0634\u062f.\n\n\ud83d\udcca \u0645\u062c\u0645\u0648\u0639: ${total} \u06a9\u0644\u0645\u0647`
          : `\u26a0\ufe0f \u00ab${esc(rest)}\u00bb \u062f\u0631 \u0644\u06cc\u0633\u062a \u0646\u0628\u0648\u062f.\n\n\ud83d\udca1 \u0627\u0645\u0644\u0627 \u0631\u0627 \u062f\u0642\u06cc\u0642 \u0628\u0646\u0648\u06cc\u0633\u06cc\u062f \u06cc\u0627 \u0627\u0632 \u062f\u06a9\u0645\u0647\u200c\u0647\u0627\u06cc \ud83d\uddd1 \u062f\u0631 \u0644\u06cc\u0633\u062a \u0627\u0633\u062a\u0641\u0627\u062f\u0647 \u06a9\u0646\u06cc\u062f.`,
        { reply_markup: { inline_keyboard: [[{ text: '\ud83e\udd2c \u0645\u0634\u0627\u0647\u062f\u0647 \u0644\u06cc\u0633\u062a', callback_data: 'bw:list:0' }]] } }
      );
      return;
    }

    if (base === '/listwords') {
      const words = await getBadWords(true);
      const v = buildWordsView(words, 0);
      await send(chatId, v.text, { reply_markup: v.keyboard });
      return;
    }

    if (base === '/testword') {
      if (!rest) {
        await send(chatId, '\u274c \u0645\u062a\u0646\u06cc \u0646\u0646\u0648\u0634\u062a\u06cc\u062f.\n\n<b>\u0645\u062b\u0627\u0644:</b> <code>/testword \u0627\u06cc\u0646 \u06cc\u06a9 \u062c\u0645\u0644\u0647 \u0627\u0633\u062a</code>');
        return;
      }
      const words = await getBadWords();
      const hit = matchBadWord(rest, words);
      const link = hasLink(rest, {});
      await send(
        chatId,
        `\ud83e\uddea <b>\u0646\u062a\u06cc\u062c\u0647 \u062a\u0633\u062a</b>\n\n` +
          `\ud83d\udcdd \u0645\u062a\u0646: ${esc(rest.slice(0, 200))}\n\n` +
          `${hit ? `\ud83e\udd2c \u06a9\u0644\u0645\u0647 \u0645\u0645\u0646\u0648\u0639\u0647: <b>${esc(hit)}</b> \u2190 \u062d\u0630\u0641 \u0645\u06cc\u200c\u0634\u0648\u062f` : '\u2705 \u06a9\u0644\u0645\u0647 \u0645\u0645\u0646\u0648\u0639\u0647 \u0646\u062f\u0627\u0631\u062f'}\n` +
          `${link ? '\ud83d\udd17 \u0644\u06cc\u0646\u06a9/\u0645\u0646\u0634\u0646 \u062f\u0627\u0631\u062f \u2190 \u062d\u0630\u0641 \u0645\u06cc\u200c\u0634\u0648\u062f' : '\u2705 \u0644\u06cc\u0646\u06a9 \u0646\u062f\u0627\u0631\u062f'}\n\n` +
          `<b>\u0646\u062a\u06cc\u062c\u0647:</b> ${hit || link ? '\ud83d\uddd1 \u0627\u06cc\u0646 \u067e\u06cc\u0627\u0645 \u062d\u0630\u0641 \u0645\u06cc\u200c\u0634\u062f' : '\u2705 \u0627\u06cc\u0646 \u067e\u06cc\u0627\u0645 \u0645\u062c\u0627\u0632 \u0627\u0633\u062a'}`
      );
      return;
    }
  }

  if (isAdmin && base === '/id') {
    const t = await resolveTarget(msg, arg);
    await send(
      chatId,
      `\ud83c\udd94 \u0686\u062a \u0641\u0639\u0644\u06cc: <code>${chatId}</code>\n\ud83d\udc64 \u0634\u0645\u0627: <code>${userId}</code>` +
        (t ? `\n\ud83c\udfaf \u0647\u062f\u0641: <code>${t.id}</code> (${esc(t.name)})` : '')
    );
    return;
  }

  if (isAdmin && !isGroup && base === '/migrate') {
    const n = await migrateLegacy();
    await send(chatId, `\u267b\ufe0f \u0627\u0646\u062a\u0642\u0627\u0644 \u062f\u0627\u062f\u0647\u200c\u0647\u0627\u06cc \u0642\u062f\u06cc\u0645\u06cc \u0627\u0646\u062c\u0627\u0645 \u0634\u062f.\n\ud83d\udce6 ${n} \u0622\u06cc\u062a\u0645 \u0645\u0646\u062a\u0642\u0644/\u0628\u0647\u200c\u0631\u0648\u0632\u0631\u0633\u0627\u0646\u06cc \u0634\u062f.`);
    return;
  }

  // ---------------------------------------------------------------
  // \u06f5) public commands
  // ---------------------------------------------------------------
  if (base === '/start') {
    if (isGroup) await del(chatId, msg.message_id);
    let t = '\ud83d\udc4b <b>\u062e\u0648\u0634 \u0622\u0645\u062f\u06cc\u062f!</b>\n\n';
    if (isAdmin) {
      t +=
        '\ud83d\udd11 \u0634\u0645\u0627 \u0627\u062f\u0645\u06cc\u0646 \u0647\u0633\u062a\u06cc\u062f.\n\n<b>\u0631\u0627\u0647\u0646\u0645\u0627\u06cc \u0633\u0631\u06cc\u0639:</b>\n' +
        '\u2022 \u0641\u0648\u0631\u0648\u0627\u0631\u062f \u06cc\u06a9 \u067e\u06cc\u0627\u0645 \u062f\u0631 \u067e\u06cc\u0648\u06cc \u2190 \u0627\u0641\u0632\u0648\u062f\u0646 \u0628\u0647 \u0628\u0644\u06a9\u200c\u0644\u06cc\u0633\u062a\n' +
        '\u2022 <code>/bl \u0622\u06cc\u062f\u06cc|@username</code> \u2190 \u0627\u0641\u0632\u0648\u062f\u0646 \u0628\u0647 \u0628\u0644\u06a9\u200c\u0644\u06cc\u0633\u062a\n' +
        '\u2022 <code>/unbl \u0622\u06cc\u062f\u06cc|@username</code> \u2190 \u062d\u0630\u0641 \u0627\u0632 \u0628\u0644\u06a9\u200c\u0644\u06cc\u0633\u062a\n' +
        '\u2022 <code>/wl</code> \u0648 <code>/unwl</code> \u2190 \u0648\u0627\u06cc\u062a\u200c\u0644\u06cc\u0633\u062a\n' +
        '\u2022 <code>/addword \u06a9\u0644\u0645\u0647</code> \u2190 \u06a9\u0644\u0645\u0647 \u0645\u0645\u0646\u0648\u0639\u0647\n' +
        '\u2022 <code>/delword \u06a9\u0644\u0645\u0647</code> \u2190 \u062d\u0630\u0641 \u06a9\u0644\u0645\u0647\n' +
        '\u2022 <code>/testword \u0645\u062a\u0646</code> \u2190 \u062a\u0633\u062a \u0641\u06cc\u0644\u062a\u0631\n' +
        '\u2022 \u0631\u06cc\u067e\u0644\u0627\u06cc \u0631\u0648\u06cc \u067e\u06cc\u0627\u0645 + <code>/bl</code> \u062f\u0631 \u06af\u0631\u0648\u0647\n' +
        '\u2022 <code>/id</code> \u2190 \u0646\u0645\u0627\u06cc\u0634 \u0634\u0646\u0627\u0633\u0647\u200c\u0647\u0627\n\n' +
        '\u26a0\ufe0f \u0628\u0644\u06a9\u200c\u0644\u06cc\u0633\u062a \u0628\u0631\u0627\u06cc \u0647\u0645\u0647 \u0627\u0639\u0645\u0627\u0644 \u0645\u06cc\u200c\u0634\u0648\u062f (\u062d\u062a\u06cc \u0627\u062f\u0645\u06cc\u0646\u200c\u0647\u0627).\n\n';
    }
    t += '\u0627\u0632 \u062f\u06a9\u0645\u0647\u200c\u0647\u0627\u06cc \u0632\u06cc\u0631 \u0627\u0633\u062a\u0641\u0627\u062f\u0647 \u06a9\u0646\u06cc\u062f:';
    await send(chatId, t, {
      reply_markup: {
        keyboard: isAdmin ? [[{ text: '\ud83d\udccb \u0645\u0646\u0648' }], [{ text: '\u2699\ufe0f \u0645\u062f\u06cc\u0631\u06cc\u062a' }]] : [[{ text: '\ud83d\udccb \u0645\u0646\u0648' }]],
        resize_keyboard: true,
      },
    });
    return;
  }

  if (base === '/menu' || cmd === '\u0645\u0646\u0648' || cmd === '\ud83d\udccb \u0645\u0646\u0648') {
    if (isGroup) await del(chatId, msg.message_id);
    const m = mainMenu(isAdmin);
    await send(chatId, m.text, { reply_markup: m.keyboard });
    return;
  }

  if ((base === '/admin' || cmd === '\u2699\ufe0f \u0645\u062f\u06cc\u0631\u06cc\u062a') && isAdmin && !isGroup) {
    await send(chatId, ADMIN_MENU.text, { reply_markup: ADMIN_MENU.keyboard });
    return;
  }
}

/** \u0647\u0634 \u06a9\u0648\u062a\u0627\u0647 \u0648 \u067e\u0627\u06cc\u062f\u0627\u0631 (FNV-1a) \u0628\u0631\u0627\u06cc keys\u06cc \u0627\u0633\u067e\u0645 */
function hashText(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

// ==========================================================================
//  bot added to / removed from a chat
// ==========================================================================

async function handleMyChatMember(u) {
  const status = u.new_chat_member?.status;
  const chat = u.chat;
  if (!chat) return;
  if (status === 'left' || status === 'kicked') {
    await entryRemove('grp', chat.id);
  } else if (chat.type === 'group' || chat.type === 'supergroup') {
    await entryAdd('grp', { id: chat.id, name: chat.title, type: chat.type });
  }
}

// ==========================================================================
//  Entry point
// ==========================================================================

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'online',
      time: new Date().toISOString(),
      kv: kvReady(),
      admins: ADMIN_IDS.length,
      secured: Boolean(WEBHOOK_SECRET),
    });
  }
  if (req.method !== 'POST') return res.status(200).send('OK');

  // \ud83d\udd12 only Telegram may invoke this endpoint
  if (WEBHOOK_SECRET) {
    const got = req.headers['x-telegram-bot-api-secret-token'];
    if (got !== WEBHOOK_SECRET) {
      console.warn('\u26d4\ufe0f secret token \u0646\u0627\u0645\u0639\u062a\u0628\u0631');
      return res.status(401).send('unauthorized');
    }
  }

  const update = req.body;
  if (!update || typeof update !== 'object') return res.status(200).send('OK');

  try {
    // skip updates already processed
    if (update.update_id !== undefined && kvReady()) {
      const fresh = await kv(['SET', `upd:${update.update_id}`, '1', 'NX', 'EX', DEDUP_TTL]);
      if (!fresh) {
        console.log('\u21a9\ufe0f duplicate update skipped', update.update_id);
        return res.status(200).send('OK');
      }
    }

    if (update.callback_query) await handleCallback(update.callback_query);
    else if (update.my_chat_member) await handleMyChatMember(update.my_chat_member);
    else if (update.message) await handleMessage(update.message);
    else if (update.edited_message) await handleMessage(update.edited_message, { edited: true });
  } catch (e) {
    // never return 500 or Telegram retries forever
    console.error('\ud83d\udca5 handler error:', e);
  }

  return res.status(200).send('OK');
}

// exported for local testing
module.exports.__test = {
  hasBadWord,
  matchBadWord,
  hasLink,
  normalizeFa,
  getForwardSource,
  extractText,
  buildListView,
  buildWordsView,
  hashText,
  DEFAULT_BAD_WORDS,
};
