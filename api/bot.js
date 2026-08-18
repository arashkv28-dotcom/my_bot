// ==========================================================================
//  Telegram Guard Bot â€” ظ†ط³ط®ظ‡ ط¨ط§ط²ظ†ظˆغŒط³غŒ ظˆ ط§طµظ„ط§ط­â€Œط´ط¯ظ‡
//  Runtime: Vercel Serverless Function (Node.js 18+)  |  DB: Upstash Redis REST
//
//  ظ…طھط؛غŒط±ظ‡ط§غŒ ظ…ط­غŒط·غŒ ظ„ط§ط²ظ…:
//    BOT_TOKEN            طھظˆع©ظ† ط±ط¨ط§طھ
//    ADMIN_IDS            ط¢غŒط¯غŒ ط¹ط¯ط¯غŒ ط§ط¯ظ…غŒظ†â€Œظ‡ط§ ط¨ط§ ع©ط§ظ…ط§  (ظ…ط«ط§ظ„: 111,222)
//    KV_REST_API_URL      ط¢ط¯ط±ط³ Upstash Redis REST
//    KV_REST_API_TOKEN    طھظˆع©ظ† Upstash
//    WEBHOOK_SECRET       (ط§ط®طھغŒط§ط±غŒ ظˆظ„غŒ ط§ع©غŒط¯ط§ظ‹ طھظˆطµغŒظ‡â€Œط´ط¯ظ‡) ظ‡ظ…ط§ظ† ظ…ظ‚ط¯ط§ط±غŒ ع©ظ‡ ظ‡ظ†ع¯ط§ظ…
//                         setWebhook ط¯ط± ظ¾ط§ط±ط§ظ…طھط± secret_token ط¯ط§ط¯غŒط¯
// ==========================================================================

const BOT_TOKEN = process.env.BOT_TOKEN;
const KV_URL = (process.env.KV_REST_API_URL || '').replace(/\/+$/, '');
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';

const ADMIN_IDS = (process.env.ADMIN_IDS || '')
  .split(',')
  .map((id) => parseInt(id.trim(), 10))
  .filter((id) => Number.isFinite(id));

const PAGE_SIZE = 8;          // طھط¹ط¯ط§ط¯ ط¢غŒطھظ… ط¯ط± ظ‡ط± طµظپط­ظ‡â€ŒغŒ ظ„غŒط³طھâ€Œظ‡ط§
const WARN_TTL_MS = 5000;     // ظ…ط¯طھ ظ†ظ…ط§غŒط´ ظ¾غŒط§ظ… ط§ط®ط·ط§ط±
const DEDUP_TTL = 300;        // ط«ط§ظ†غŒظ‡ â€” ط¬ظ„ظˆع¯غŒط±غŒ ط§ط² ظ¾ط±ط¯ط§ط²ط´ ط¯ظˆط¨ط§ط±ظ‡â€ŒغŒ غŒع© ط¢ظ¾ط¯غŒطھ
const SPAM_TTL = 3600;        // ط«ط§ظ†غŒظ‡ â€” ظ¾ظ†ط¬ط±ظ‡â€ŒغŒ طھط´ط®غŒطµ ظ¾غŒط§ظ… طھع©ط±ط§ط±غŒ
const GROUP_TOUCH_TTL = 21600;// ط«ط§ظ†غŒظ‡ â€” ظ‡ط± غ¶ ط³ط§ط¹طھ غŒع©â€Œط¨ط§ط± ط§ط·ظ„ط§ط¹ط§طھ ع¯ط±ظˆظ‡ ط±ط§ ظ…غŒâ€Œظ†ظˆغŒط³غŒظ…

// ==========================================================================
//  ط§ط¨ط²ط§ط±ظ‡ط§غŒ ظ¾ط§غŒظ‡
// ==========================================================================

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** ظپط±ط§ط± ط¯ط§ط¯ظ† ع©ط§ط±ط§ع©طھط±ظ‡ط§غŒ HTML â€” ع†ظˆظ† parse_mode ط±ط§ HTML ع¯ط°ط§ط´طھظ‡â€Œط§غŒظ… */
const esc = (s = '') =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function tgApi(method, body) {
  if (!BOT_TOKEN) {
    console.error('BOT_TOKEN طھط¹ط±غŒظپ ظ†ط´ط¯ظ‡ ط§ط³طھ');
    return null;
  }
  try {
    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!j.ok) console.warn(`âڑ ï¸ڈ ${method}: ${j.description}`);
    return j;
  } catch (e) {
    console.error(`â‌Œ ${method}:`, e);
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

/** ط§ط®ط·ط§ط± ظ…ظˆظ‚طھ: ظ…غŒâ€Œظپط±ط³طھط¯طŒ طµط¨ط± ظ…غŒâ€Œع©ظ†ط¯طŒ ظ¾ط§ع© ظ…غŒâ€Œع©ظ†ط¯ */
async function warn(chatId, text, ttl = WARN_TTL_MS) {
  const w = await send(chatId, text);
  if (w?.ok && w.result) {
    await sleep(ttl);
    await del(chatId, w.result.message_id);
  }
}

// ==========================================================================
//  ظ„ط§غŒظ‡â€ŒغŒ ط¯غŒطھط§ط¨غŒط³ (Upstash REST â€” ط¨ط§ POST ظˆ ظ¾ط§غŒظ¾â€Œظ„ط§غŒظ†طŒ ظ†ظ‡ URL-path)
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

// --- ع©ظ„غŒط¯ظ‡ط§ ---------------------------------------------------------------
const KIND = {
  bl: { key: (id) => `bl:${id}`, index: 'bl:index', label: 'ط¨ظ„ع©â€Œظ„غŒط³طھ' },
  wl: { key: (id) => `wl:${id}`, index: 'wl:index', label: 'ظˆط§غŒطھâ€Œظ„غŒط³طھ' },
  grp: { key: (id) => `grp:${id}`, index: 'grp:index', label: 'ع¯ط±ظˆظ‡â€Œظ‡ط§' },
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
  // ظپظ‚ط· ظˆظ‚طھغŒ true ع©ظ‡ ظˆط§ظ‚ط¹ط§ظ‹ ع†غŒط²غŒ ط­ط°ظپ ط´ط¯ظ‡ ط¨ط§ط´ط¯
  return Number(res[0] || 0) > 0 || Number(res[1] || 0) > 0;
}

async function entryHas(kind, id) {
  if (id === null || id === undefined) return false;
  const r = await kv(['EXISTS', KIND[kind].key(id)]);
  return Number(r) === 1;   // fail-closed ظ†ط³ط¨طھ ط¨ظ‡ ط®ط·ط§ (null â†’ false)
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

/** ظ‡ظ…ظ‡â€ŒغŒ ط¢غŒطھظ…â€Œظ‡ط§ ط¨ط§ غŒع© SMEMBERS + غŒع© MGET (ط¨ظ‡â€Œط¬ط§غŒ N ط¯ط±ط®ظˆط§ط³طھ) */
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
  if (orphans.length) await kv(['SREM', K.index, ...orphans]); // ظ¾ط§ع©ط³ط§ط²غŒ ط§غŒظ†ط¯ع©ط³
  return out.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
}

const statInc = (key, by = 1) => kv(['INCRBY', `stat:${key}`, by]);
async function statGet(key) {
  const v = await kv(['GET', `stat:${key}`]);
  return parseInt(v, 10) || 0;
}

/** ط§ظ†طھظ‚ط§ظ„ ط¯ط§ط¯ظ‡â€Œظ‡ط§غŒ ط³ط§ط®طھط§ط± ظ‚ط¯غŒظ…غŒ (blacklist_* / whitelist_* / group_*) */
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
      } catch { /* ظ…ظ‚ط¯ط§ط± ط®ط±ط§ط¨ */ }
      if (!obj || obj.id === undefined) continue;
      await entryAdd(kind, { id: obj.id, name: obj.name || obj.title, type: obj.type || 'unknown' });
      moved++;
    }
  }
  return moved;
}

// ==========================================================================
//  ط§ط³طھط®ط±ط§ط¬ ط§ط·ظ„ط§ط¹ط§طھ ظ¾غŒط§ظ…
// ==========================================================================

const fullName = (u) =>
  [u?.first_name, u?.last_name].filter(Boolean).join(' ').trim() ||
  (u?.username ? '@' + u.username : '') ||
  'ع©ط§ط±ط¨ط±';

/**
 * ظ…ظ†ط¨ط¹ ظپظˆط±ظˆط§ط±ط¯ ط±ط§ ط§ط² ظ‡ط± ط¯ظˆ ط³ط§ط®طھط§ط± ط¨ط±ظ…غŒâ€Œع¯ط±ط¯ط§ظ†ط¯:
 *  - forward_origin  (Bot API 7.0 ط¨ظ‡ ط¨ط¹ط¯ â€” ط³ط§ط®طھط§ط± ظپط¹ظ„غŒ)
 *  - forward_from / forward_from_chat  (ظ‚ط¯غŒظ…غŒطŒ ط¨ط±ط§غŒ ط³ط§ط²ع¯ط§ط±غŒ)
 */
function getForwardSource(msg) {
  const o = msg.forward_origin;
  if (o) {
    if (o.type === 'user' && o.sender_user)
      return { id: o.sender_user.id, name: fullName(o.sender_user), type: 'user' };
    if (o.type === 'chat' && o.sender_chat)
      return { id: o.sender_chat.id, name: o.sender_chat.title || o.sender_chat.username || 'ع¯ط±ظˆظ‡', type: o.sender_chat.type };
    if (o.type === 'channel' && o.chat)
      return { id: o.chat.id, name: o.chat.title || o.chat.username || 'ع©ط§ظ†ط§ظ„', type: 'channel' };
    if (o.type === 'hidden_user')
      return { id: null, name: o.sender_user_name || 'ع©ط§ط±ط¨ط± ظ…ط®ظپغŒ', type: 'hidden_user' };
  }
  if (msg.forward_from_chat)
    return {
      id: msg.forward_from_chat.id,
      name: msg.forward_from_chat.title || msg.forward_from_chat.username || 'ع©ط§ظ†ط§ظ„',
      type: msg.forward_from_chat.type,
    };
  if (msg.forward_from)
    return { id: msg.forward_from.id, name: fullName(msg.forward_from), type: 'user' };
  return null;
}

/** ظ…طھظ† + ع©ظ¾ط´ظ† + ط¢ط¯ط±ط³â€Œظ‡ط§غŒ ظ…ط®ظپغŒ ط¯ط§ط®ظ„ entityظ‡ط§ (text_link) */
function extractText(msg) {
  const parts = [];
  if (msg.text) parts.push(msg.text);
  if (msg.caption) parts.push(msg.caption);
  for (const e of [...(msg.entities || []), ...(msg.caption_entities || [])]) {
    if (e.type === 'text_link' && e.url) parts.push(e.url);
  }
  return parts.join('\n');
}

// --- ظپغŒظ„طھط±ظ‡ط§ ---------------------------------------------------------------

const BAD_WORDS = [
  'ط§ط­ظ…ظ‚', 'ط¨غŒط´ط¹ظˆط±', 'ط¨غŒ ط´ط¹ظˆط±', 'ع©ظ„ط§ظ‡ط¨ط±ط¯ط§ط±', 'ط´ط§ط´ط²ط§ط¯ظ‡',
  'ع©ظˆظ†', 'ع©طµ', 'ع©ط³ ع©ط´', 'ع©ط³ع©ط´', 'ع©ظˆط³ع©ط´', 'ع©ظˆطµع©ط´', 'ع©طµع©ط´',
  'ع©غŒط±', 'ع©ظˆط³', 'ع¯ظˆظ‡',
];

/** غŒع©ط³ط§ظ†â€Œط³ط§ط²غŒ ط­ط±ظˆظپ ط¹ط±ط¨غŒ/ظپط§ط±ط³غŒطŒ ط­ط°ظپ ظ†غŒظ…â€Œظپط§طµظ„ظ‡ ظˆ ط§ط¹ط±ط§ط¨ ظˆ ع©ط´غŒط¯ظ‡ */
function normalizeFa(s = '') {
  return String(s)
    .toLowerCase()
    .replace(/[\u200c\u200f\u200e\u061c]/g, '')      // ZWNJ ظˆ ع©ط§ط±ط§ع©طھط±ظ‡ط§غŒ ط¬ظ‡طھ
    .replace(/[\u064B-\u0652\u0640]/g, '')           // ط§ط¹ط±ط§ط¨ ظˆ ع©ط´غŒط¯ظ‡
    .replace(/[ظٹï»±ï¯¼ï¯½]/g, 'غŒ')
    .replace(/[ظƒï»™]/g, 'ع©')
    .replace(/[ط£ط¥ط¢]/g, 'ط§')
    .replace(/ط©/g, 'ظ‡')
    .replace(/[غ°-غ¹]/g, (d) => '0123456789'['غ°غ±غ²غ³غ´غµغ¶غ·غ¸غ¹'.indexOf(d)])
    .replace(/[^\p{L}\p{N}\s@._/:-]/gu, ' ')         // ظ†ط´ط§ظ†ظ‡â€Œع¯ط°ط§ط±غŒ â†’ ظپط§طµظ„ظ‡
    .replace(/\s+/g, ' ')
    .trim();
}

function hasBadWord(text) {
  const t = normalizeFa(text);
  if (!t) return false;
  const words = t.split(' ');
  return BAD_WORDS.some((bw) => {
    const b = normalizeFa(bw);
    return b.includes(' ') ? t.includes(b) : words.includes(b);
  });
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
//  ع©غŒط¨ظˆط±ط¯ظ‡ط§ ظˆ ظ…طھظ†â€Œظ‡ط§غŒ ط«ط§ط¨طھ
// ==========================================================================

const backBtn = (cb) => [{ text: 'ًں”™ ط¨ط§ط²ع¯ط´طھ', callback_data: cb }];

function mainMenu(isAdmin) {
  return {
    text: 'ًں“Œ <b>ظ…ظ†ظˆغŒ ط§طµظ„غŒ</b>\n\nغŒع©غŒ ط§ط² ع¯ط²غŒظ†ظ‡â€Œظ‡ط§ ط±ط§ ط§ظ†طھط®ط§ط¨ ع©ظ†غŒط¯:',
    keyboard: {
      inline_keyboard: [
        [{ text: 'ًں“¢ ع©ط§ظ†ط§ظ„â€Œظ‡ط§', callback_data: 'menu:channels' }],
        [{ text: 'ًں‘¥ ع¯ط±ظˆظ‡â€Œظ‡ط§', callback_data: 'menu:groups' }],
        [{ text: 'ًں“‍ ط§ط±طھط¨ط§ط·', callback_data: 'menu:contact' }],
        [{ text: 'ًں“œ ظ‚ظˆط§ظ†غŒظ†', callback_data: 'menu:rules' }],
        ...(isAdmin ? [[{ text: 'âڑ™ï¸ڈ ظ…ط¯غŒط±غŒطھ', callback_data: 'adm:home' }]] : []),
      ],
    },
  };
}

const ADMIN_MENU = {
  text: 'âڑ™ï¸ڈ <b>ظ¾ظ†ظ„ ظ…ط¯غŒط±غŒطھ</b>\n\nع¯ط²غŒظ†ظ‡ ط±ط§ ط§ظ†طھط®ط§ط¨ ع©ظ†غŒط¯:',
  keyboard: {
    inline_keyboard: [
      [{ text: 'ًں“ٹ ط¢ظ…ط§ط±', callback_data: 'adm:stats' }],
      [{ text: 'ًں“‹ ع¯ط±ظˆظ‡â€Œظ‡ط§', callback_data: 'grp:list:0' }],
      [{ text: 'ًںڑ« ط¨ظ„ع©â€Œظ„غŒط³طھ', callback_data: 'bl:list:0' }],
      [{ text: 'âœ… ظˆط§غŒطھâ€Œظ„غŒط³طھ', callback_data: 'wl:list:0' }],
      backBtn('menu:main'),
    ],
  },
};

const typeIcon = (t) =>
  t === 'user' || t === 'private' ? 'ًں‘¤' : t === 'channel' ? 'ًں“¢' : t === 'hidden_user' ? 'ًں•¶' : 'ًں‘¥';

const typeLabel = (t) =>
  ({ user: 'ع©ط§ط±ط¨ط±', private: 'ع©ط§ط±ط¨ط±', channel: 'ع©ط§ظ†ط§ظ„', group: 'ع¯ط±ظˆظ‡', supergroup: 'ط³ظˆظ¾ط±ع¯ط±ظˆظ‡' }[t] || t || 'ظ†ط§ظ…ط´ط®طµ');

/** ط³ط§ط®طھ ظ„غŒط³طھ طµظپط­ظ‡â€Œط¨ظ†ط¯غŒâ€Œط´ط¯ظ‡ ط¨ط±ط§غŒ bl / wl / grp */
function buildListView(kind, items, page) {
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const p = Math.min(Math.max(0, page), pages - 1);
  const slice = items.slice(p * PAGE_SIZE, p * PAGE_SIZE + PAGE_SIZE);

  const rows = slice.map((it) => [
    {
      text: `${typeIcon(it.type)} ${String(it.name || it.title || it.id).slice(0, 28)}`,
      callback_data: `${kind}:view:${it.id}:${p}`,
    },
    { text: 'ًں—‘', callback_data: `${kind}:del:${it.id}:${p}` },
  ]);

  const nav = [];
  if (p > 0) nav.push({ text: 'â—€ï¸ڈ ظ‚ط¨ظ„غŒ', callback_data: `${kind}:list:${p - 1}` });
  if (pages > 1) nav.push({ text: `${p + 1}/${pages}`, callback_data: 'nop' });
  if (p < pages - 1) nav.push({ text: 'ط¨ط¹ط¯غŒ â–¶ï¸ڈ', callback_data: `${kind}:list:${p + 1}` });

  const counts = {
    users: items.filter((i) => i.type === 'user' || i.type === 'private').length,
    channels: items.filter((i) => i.type === 'channel').length,
    groups: items.filter((i) => i.type === 'group' || i.type === 'supergroup').length,
  };

  const head =
    kind === 'bl'
      ? 'ًںڑ« <b>ط¨ظ„ع©â€Œظ„غŒط³طھ</b>'
      : kind === 'wl'
      ? 'âœ… <b>ظˆط§غŒطھâ€Œظ„غŒط³طھ</b>'
      : 'ًں“‹ <b>ع¯ط±ظˆظ‡â€Œظ‡ط§غŒ ط±ط¨ط§طھ</b>';

  let text = `${head}\n\nًں‘¤ ع©ط§ط±ط¨ط±ط§ظ†: ${counts.users}\nًں“¢ ع©ط§ظ†ط§ظ„â€Œظ‡ط§: ${counts.channels}\nًں‘¥ ع¯ط±ظˆظ‡â€Œظ‡ط§: ${counts.groups}\nًں“ٹ ظ…ط¬ظ…ظˆط¹: ${items.length}\n\n`;
  text += kind === 'bl'
    ? 'âڑ ï¸ڈ ظپظˆط±ظˆط§ط±ط¯ ط§ط² ط§غŒظ† ظ…ظ†ط§ط¨ط¹ ط¨ط±ط§غŒ <b>ظ‡ظ…ظ‡</b> ظ…ظ…ظ†ظˆط¹ ط§ط³طھ (ط­طھغŒ ط§ط¯ظ…غŒظ†â€Œظ‡ط§).\n\nًں—‘ = ط­ط°ظپ ط³ط±غŒط¹ ط§ط² ظ„غŒط³طھ'
    : kind === 'wl'
    ? 'ًں’، ظ…ط¹ط§ظپ ط§ط² ظپغŒظ„طھط± ظ„غŒظ†ع©/ع©ظ„ظ…ط§طھ/ط§ط³ظ¾ظ… â€” ظˆظ„غŒ ظ†ظ‡ ط§ط² ط¨ظ„ع©â€Œظ„غŒط³طھ.\n\nًں—‘ = ط­ط°ظپ ط³ط±غŒط¹ ط§ط² ظ„غŒط³طھ'
    : 'ًں—‘ = ط®ط±ظˆط¬ ط±ط¨ط§طھ ط§ط² ع¯ط±ظˆظ‡';

  return {
    text,
    keyboard: {
      inline_keyboard: [...rows, ...(nav.length ? [nav] : []), backBtn('adm:home')],
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

  // ًں”§ ط¨ط§ع¯ ط§طµظ„غŒ ظ†ط³ط®ظ‡ ظ‚ط¨ظ„: startsWith("bl_") ظ‚ط¨ظ„ ط§ط² "bl_remove_" ع†ع© ظ…غŒâ€Œط´ط¯ ظˆ
  //     ط¯ع©ظ…ظ‡ ط­ط°ظپ ظ‡غŒع†â€Œظˆظ‚طھ ع©ط§ط± ظ†ظ…غŒâ€Œع©ط±ط¯. ط­ط§ظ„ط§ ط±ظˆطھغŒظ†ع¯ ط¨ط± ط§ط³ط§ط³ ط¨ط®ط´â€Œظ‡ط§غŒ ط¬ط¯ط§ ط§ط² ظ‡ظ… ط§ط³طھ.
  const [ns, action, arg1, arg2] = data.split(':');

  const adminOnly = ['adm', 'bl', 'wl', 'grp'].includes(ns);
  if (adminOnly && !isAdmin) {
    await ack('â›”ï¸ڈ ط¯ط³طھط±ط³غŒ ظ†ط¯ط§ط±غŒط¯!', true);
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
      text = 'ًں“¢ <b>ع©ط§ظ†ط§ظ„â€Œظ‡ط§غŒ ظ…ط§:</b>';
      keyboard = {
        inline_keyboard: [
          [{ text: 'ط§ظ†ط¯غŒط´ظ‡ ظ¾ظ‡ظ„ظˆغŒط³ظ…', url: 'https://t.me/andishepahlavism' }],
          [{ text: 'ظپط±ظˆظ¾ط§ط´غŒ', url: 'https://t.me/froopashee2' }],
          [{ text: 'ط§ظ„ظپط¨ط§غŒ ط³غŒط§ط³طھ', url: 'https://t.me/Allephba' }],
          backBtn('menu:main'),
        ],
      };
    } else if (action === 'groups') {
      text = 'ًں‘¥ <b>ع¯ط±ظˆظ‡â€Œظ‡ط§غŒ ظ…ط§:</b>';
      keyboard = {
        inline_keyboard: [
          [{ text: 'ع¯ظپطھع¯ظˆغŒ ط§ظ†ط¯غŒط´ظ‡ ظ¾ظ‡ظ„ظˆغŒط³ظ…', url: 'https://t.me/goftemanazadAp' }],
          [{ text: 'ع¯ظپطھع¯ظˆغŒ ظپط±ظˆظ¾ط§ط´غŒ', url: 'https://t.me/+6nIM1oBqTaVjNzYy' }],
          backBtn('menu:main'),
        ],
      };
    } else if (action === 'contact') {
      text = 'ًں“‍ <b>ط§ط±طھط¨ط§ط· ط¨ط§ ظ…ط§:</b>';
      keyboard = {
        inline_keyboard: [
          [{ text: 'ط§ط±طھط¨ط§ط· ط§ظ†ط¯غŒط´ظ‡', url: 'https://t.me/+aaJQcUU7ZIMyZWQ8' }],
          [{ text: 'ط§ط±طھط¨ط§ط· ظپط±ظˆظ¾ط§ط´غŒ', url: 'https://t.me/+GZOW85iRkX45ODJi' }],
          backBtn('menu:main'),
        ],
      };
    } else if (action === 'rules') {
      text =
        'ًں“œ <b>ظ‚ظˆط§ظ†غŒظ†:</b>\n\nغ±. طھظˆظ‡غŒظ† ظˆ ع©ظ„ظ…ط§طھ ط±ع©غŒع© ظ…ظ…ظ†ظˆط¹.\nغ². ط§ط±ط³ط§ظ„ ظ„غŒظ†ع© ظˆ طھط¨ظ„غŒط؛ط§طھ ظ…ظ…ظ†ظˆط¹.\nغ³. ظ¾غŒط§ظ… طھع©ط±ط§ط±غŒ (ط§ط³ظ¾ظ…) ظ…ظ…ظ†ظˆط¹.\nغ´. ظپظˆط±ظˆط§ط±ط¯ ط§ط² ظ…ظ†ط§ط¨ط¹ ط¨ظ„ع©â€Œظ„غŒط³طھ ظ…ظ…ظ†ظˆط¹.\nغµ. ظ†ط¸ظ… ع¯ط±ظˆظ‡ ط±ط§ ط±ط¹ط§غŒطھ ع©ظ†غŒط¯.';
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
        `ًں“ٹ <b>ط¢ظ…ط§ط± ط±ط¨ط§طھ</b>\n\n` +
        `ًں“¨ ع©ظ„ ظ¾غŒط§ظ…â€Œظ‡ط§: ${messages}\n` +
        `ًں—‘ ط­ط°ظپâ€Œط´ط¯ظ‡: ${deleted}\n` +
        `ًںڑ« ظپظˆط±ظˆط§ط±ط¯ ط¨ظ„ط§ع©â€Œط´ط¯ظ‡: ${blocked}\n\n` +
        `ًں“‹ ع¯ط±ظˆظ‡â€Œظ‡ط§غŒ ظپط¹ط§ظ„: ${groups.length}\n` +
        `ًںڑ« ط¨ظ„ع©â€Œظ„غŒط³طھ: ${bl.length}\n` +
        `âœ… ظˆط§غŒطھâ€Œظ„غŒط³طھ: ${wl.length}`;
      keyboard = { inline_keyboard: [backBtn('adm:home')] };
    }
  } else if (ns === 'bl' || ns === 'wl' || ns === 'grp') {
    const items = await entryList(ns);

    if (action === 'list') {
      if (items.length === 0) {
        text =
          ns === 'bl'
            ? 'ًںڑ« <b>ط¨ظ„ع©â€Œظ„غŒط³طھ</b>\n\nâ‌Œ ظ„غŒط³طھ ط®ط§ظ„غŒ ط§ط³طھ.\n\n<b>ط§ظپط²ظˆط¯ظ†:</b>\nâ€¢ غŒع© ظ¾غŒط§ظ… ط§ط² ط¢ظ† ع©ط§ط±ط¨ط±/ع©ط§ظ†ط§ظ„ ط±ط§ ط¨ط±ط§غŒظ… ظپظˆط±ظˆط§ط±ط¯ ع©ظ†غŒط¯\nâ€¢ غŒط§ <code>/bl ط¢غŒط¯غŒ</code> â€” <code>/bl @username</code>\n\n<b>ط­ط°ظپ:</b> <code>/unbl ط¢غŒط¯غŒ</code>'
            : ns === 'wl'
            ? 'âœ… <b>ظˆط§غŒطھâ€Œظ„غŒط³طھ</b>\n\nâ‌Œ ظ„غŒط³طھ ط®ط§ظ„غŒ ط§ط³طھ.\n\n<b>ط§ظپط²ظˆط¯ظ†:</b> <code>/wl ط¢غŒط¯غŒ</code> غŒط§ <code>/wl @username</code>\n<b>ط­ط°ظپ:</b> <code>/unwl ط¢غŒط¯غŒ</code>'
            : 'ًں“‹ <b>ع¯ط±ظˆظ‡â€Œظ‡ط§</b>\n\nâ‌Œ ظ‡غŒع† ع¯ط±ظˆظ‡غŒ ط«ط¨طھ ظ†ط´ط¯ظ‡.';
        keyboard = { inline_keyboard: [backBtn('adm:home')] };
      } else {
        ({ text, keyboard } = buildListView(ns, items, parseInt(arg1, 10) || 0));
      }
    } else if (action === 'view') {
      const item = items.find((i) => String(i.id) === String(arg1));
      if (!item) {
        text = 'â‌Œ ط¢غŒطھظ… غŒط§ظپطھ ظ†ط´ط¯ (ط´ط§غŒط¯ ظ‚ط¨ظ„ط§ظ‹ ط­ط°ظپ ط´ط¯ظ‡).';
        keyboard = { inline_keyboard: [backBtn(`${ns}:list:0`)] };
      } else {
        text =
          `${typeIcon(item.type)} <b>ط¬ط²ط¦غŒط§طھ ${KIND[ns].label}</b>\n\n` +
          `ًں“Œ ظ†ط§ظ…: ${esc(item.name || item.title)}\n` +
          `ًں†” ط´ظ†ط§ط³ظ‡: <code>${item.id}</code>\n` +
          `ًں“‌ ظ†ظˆط¹: ${typeLabel(item.type)}\n` +
          (item.username ? `ًں‘¤ غŒظˆط²ط±ظ†غŒظ…: @${esc(item.username)}\n` : '') +
          (item.addedAt ? `ًں•“ طھط§ط±غŒط®: ${new Date(item.addedAt).toLocaleString('fa-IR')}\n` : '');
        keyboard = {
          inline_keyboard: [
            [
              {
                text: ns === 'grp' ? 'ًںڑھ ط®ط±ظˆط¬ ط§ط² ع¯ط±ظˆظ‡' : `ًں—‘ ط­ط°ظپ ط§ط² ${KIND[ns].label}`,
                callback_data: `${ns}:del:${item.id}:${arg2 || 0}`,
              },
            ],
            backBtn(`${ns}:list:${arg2 || 0}`),
          ],
        };
      }
    } else if (action === 'del') {
      // ظ…ط±ط­ظ„ظ‡â€ŒغŒ طھط£غŒغŒط¯ â€” ط¬ظ„ظˆع¯غŒط±غŒ ط§ط² ط­ط°ظپ طھطµط§ط¯ظپغŒ
      const item = items.find((i) => String(i.id) === String(arg1));
      const name = item ? esc(item.name || item.title || item.id) : arg1;
      text =
        ns === 'grp'
          ? `â‌“ <b>طھط£غŒغŒط¯ ط®ط±ظˆط¬</b>\n\nط±ط¨ط§طھ ط§ط² ع¯ط±ظˆظ‡ آ«${name}آ» ط®ط§ط±ط¬ ط´ظˆط¯طں`
          : `â‌“ <b>طھط£غŒغŒط¯ ط­ط°ظپ</b>\n\nآ«${name}آ» ط§ط² ${KIND[ns].label} ط­ط°ظپ ط´ظˆط¯طں` +
            (ns === 'bl' ? '\n\nâ™»ï¸ڈ ط¨ط¹ط¯ ط§ط² ط­ط°ظپطŒ ظپظˆط±ظˆط§ط±ط¯ ط§ط² ط§غŒظ† ظ…ظ†ط¨ط¹ ط¯ظˆط¨ط§ط±ظ‡ ط¢ط²ط§ط¯ ظ…غŒâ€Œط´ظˆط¯.' : '');
      keyboard = {
        inline_keyboard: [
          [
            { text: 'âœ… ط¨ظ„ظ‡طŒ ط­ط°ظپ ع©ظ†', callback_data: `${ns}:yes:${arg1}:${arg2 || 0}` },
            { text: 'â‌Œ ط§ظ†طµط±ط§ظپ', callback_data: `${ns}:list:${arg2 || 0}` },
          ],
        ],
      };
    } else if (action === 'yes') {
      let ok;
      if (ns === 'grp') {
        const left = await tgApi('leaveChat', { chat_id: arg1 });
        await entryRemove('grp', arg1);
        ok = Boolean(left?.ok);
        await ack(ok ? 'âœ… ط±ط¨ط§طھ ط®ط§ط±ط¬ ط´ط¯' : 'âڑ ï¸ڈ ط®ط±ظˆط¬ ظ†ط§ظ…ظˆظپظ‚ ط¨ظˆط¯طŒ ط§ظ…ط§ ط§ط² ظ„غŒط³طھ ظ¾ط§ع© ط´ط¯');
      } else {
        ok = await entryRemove(ns, arg1);
        await ack(ok ? `âœ… ط§ط² ${KIND[ns].label} ط­ط°ظپ ط´ط¯` : 'âڑ ï¸ڈ ط¯ط± ظ„غŒط³طھ ظ†ط¨ظˆط¯');
      }
      const fresh = await entryList(ns);
      if (fresh.length === 0) {
        text = `âœ… ط§ظ†ط¬ط§ظ… ط´ط¯.\n\n${KIND[ns].label} ط§ع©ظ†ظˆظ† ط®ط§ظ„غŒ ط§ط³طھ.`;
        keyboard = { inline_keyboard: [backBtn('adm:home')] };
      } else {
        const v = buildListView(ns, fresh, parseInt(arg2, 10) || 0);
        text = `âœ… ط§ظ†ط¬ط§ظ… ط´ط¯.\n\n${v.text}`;
        keyboard = v.keyboard;
      }
      // ack ظ‚ط¨ظ„ط§ظ‹ ط¯ط§ط¯ظ‡ ط´ط¯ظ‡
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
  // ط§ع¯ط± ظ¾غŒط§ظ… ظ‚ط§ط¨ظ„ ظˆغŒط±ط§غŒط´ ظ†ط¨ظˆط¯ (ط®غŒظ„غŒ ظ‚ط¯غŒظ…غŒ/ط­ط°ظپâ€Œط´ط¯ظ‡) غŒع© ظ¾غŒط§ظ… طھط§ط²ظ‡ ط¨ظپط±ط³طھ
  if (r && !r.ok && !/message is not modified/i.test(r.description || '')) {
    await send(chatId, text, { reply_markup: keyboard });
  }
}

// ==========================================================================
//  ط§ط¨ط²ط§ط± ط´ظ†ط§ط³ط§غŒغŒ ظ‡ط¯ظپ ط¨ط±ط§غŒ ط¯ط³طھظˆط±ط§طھ (/bl /unbl /wl /unwl)
// ==========================================================================

async function resolveTarget(msg, arg) {
  // غ±) ط§ع¯ط± ط±ظˆغŒ ظ¾غŒط§ظ…غŒ ط±غŒظ¾ظ„ط§غŒ ط´ط¯ظ‡
  const rep = msg.reply_to_message;
  if (!arg && rep) {
    const fwd = getForwardSource(rep);
    if (fwd && fwd.id) return fwd;
    if (rep.sender_chat)
      return { id: rep.sender_chat.id, name: rep.sender_chat.title || 'ع†طھ', type: rep.sender_chat.type };
    if (rep.from) return { id: rep.from.id, name: fullName(rep.from), type: 'user' };
  }
  if (!arg) return null;

  // غ²) ط¢غŒط¯غŒ ط¹ط¯ط¯غŒ
  if (/^-?\d+$/.test(arg)) {
    const id = Number(arg);
    if (!Number.isSafeInteger(id)) return null;
    return { id, name: `ID ${id}`, type: id < 0 ? 'group' : 'user' };
  }

  // غ³) غŒظˆط²ط±ظ†غŒظ… â€” ظپظ‚ط· ط¨ط±ط§غŒ ع©ط§ظ†ط§ظ„/ع¯ط±ظˆظ‡ غŒط§ ع©ط§ط±ط¨ط±غŒ ع©ظ‡ ط±ط¨ط§طھ ط¯غŒط¯ظ‡ ط§ط³طھ ع©ط§ط± ظ…غŒâ€Œع©ظ†ط¯
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

  // ط«ط¨طھ ع¯ط±ظˆظ‡ â€” ط¨ط§ throttle طھط§ ط¨ط±ط§غŒ ظ‡ط± ظ¾غŒط§ظ… غŒع© ظ†ظˆط´طھظ† ط±ظˆغŒ KV ظ†ط¯ط§ط´طھظ‡ ط¨ط§ط´غŒظ…
  if (isGroup && msg.chat.title) {
    const fresh = await kv(['SET', `grp:touch:${chatId}`, '1', 'NX', 'EX', GROUP_TOUCH_TTL]);
    if (fresh) {
      await entryAdd('grp', { id: chatId, name: msg.chat.title, type: msg.chat.type });
      await kv(['HSET', `grp:meta:${chatId}`, 'username', msg.chat.username || '']);
    }
  }

  // ط­ط°ظپ ظ¾غŒط§ظ…â€Œظ‡ط§غŒ ط³غŒط³طھظ…غŒ ظˆط±ظˆط¯/ط®ط±ظˆط¬
  if (msg.new_chat_members || msg.left_chat_member) {
    await del(chatId, msg.message_id);
    return;
  }

  // ---------------------------------------------------------------
  // غ±) ط¨ظ„ع©â€Œظ„غŒط³طھ ظپظˆط±ظˆط§ط±ط¯ â€” ط¨ط§ظ„ط§طھط±غŒظ† ط§ظˆظ„ظˆغŒطھطŒ ط´ط§ظ…ظ„ ط§ط¯ظ…غŒظ†â€Œظ‡ط§ ظ‡ظ… ظ…غŒâ€Œط´ظˆط¯
  // ---------------------------------------------------------------
  if (isGroup) {
    const src = getForwardSource(msg);
    const senderChat = msg.sender_chat?.id ?? null; // ظ¾غŒط§ظ… ط§ط² ط·ط±ظپ ع©ط§ظ†ط§ظ„

    const [srcBlocked, senderBlocked] = await Promise.all([
      src?.id ? entryHas('bl', src.id) : Promise.resolve(false),
      senderChat && !msg.is_automatic_forward ? entryHas('bl', senderChat) : Promise.resolve(false),
    ]);

    if (srcBlocked || senderBlocked) {
      const who = srcBlocked ? src : { name: msg.sender_chat.title || 'ع©ط§ظ†ط§ظ„', id: senderChat };
      console.log('ًںڑ« BLACKLIST ENFORCED:', who.id, 'admin:', isAdmin);
      await del(chatId, msg.message_id);
      await kvPipe([
        ['INCRBY', 'stat:blocked_forwards', 1],
        ['INCRBY', 'stat:deleted', 1],
      ]);
      await warn(
        chatId,
        isAdmin
          ? `ًںڑ« <b>ط§ط®ط·ط§ط± ط¨ظ‡ ط§ط¯ظ…غŒظ†</b>\n\nآ«${esc(who.name)}آ» ط¯ط± ط¨ظ„ع©â€Œظ„غŒط³طھ ط§ط³طھ.\nâڑ ï¸ڈ ط­طھغŒ ط§ط¯ظ…غŒظ†â€Œظ‡ط§ ظ‡ظ… ظ†ظ…غŒâ€Œطھظˆط§ظ†ظ†ط¯ ط§ط² ظ…ظ†ط§ط¨ط¹ ط¨ظ„ع©â€Œظ„غŒط³طھ ظپظˆط±ظˆط§ط±ط¯ ع©ظ†ظ†ط¯.`
          : `ًںڑ« ظ¾غŒط§ظ… ط­ط°ظپ ط´ط¯\n\nظپظˆط±ظˆط§ط±ط¯ ط§ط² آ«${esc(who.name)}آ» ظ…ظ…ظ†ظˆط¹ ط§ط³طھ.`,
        isAdmin ? 8000 : 5000
      );
      return;
    }
  }

  // ---------------------------------------------------------------
  // غ²) ظ…ط¹ط§ظپغŒطھâ€Œظ‡ط§ (ظپظ‚ط· ط¨ط±ط§غŒ ظپغŒظ„طھط±ظ‡ط§غŒ ط¹ظ…ظˆظ…غŒطŒ ظ†ظ‡ ط¨ظ„ع©â€Œظ„غŒط³طھ)
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
  // غ³) ظپغŒظ„طھط±ظ‡ط§غŒ ط¹ظ…ظˆظ…غŒ
  // ---------------------------------------------------------------
  if (isGroup && !isExempt && text) {
    const bad = hasBadWord(text);
    // ط¯ط³طھظˆط±ظ‡ط§غŒ ط®ظˆط¯ ط±ط¨ط§طھ ظ†ط¨ط§غŒط¯ ظ‚ط±ط¨ط§ظ†غŒ ظپغŒظ„طھط± ظ…ظ†ط´ظ† (@BotName) ط´ظˆظ†ط¯
    const link = !isCommandToBot && hasLink(text, msg);

    if (bad || link) {
      await del(chatId, msg.message_id);
      await statInc('deleted');
      await warn(
        chatId,
        bad ? 'âڑ ï¸ڈ ط§ط³طھظپط§ط¯ظ‡ ط§ط² ع©ظ„ظ…ط§طھ ظ†ط§ظ…ظ†ط§ط³ط¨ ظ…ظ…ظ†ظˆط¹ ط§ط³طھ!' : 'âڑ ï¸ڈ ط§ط±ط³ط§ظ„ ظ„غŒظ†ع© ظˆ طھط¨ظ„غŒط؛ط§طھ ظ…ظ…ظ†ظˆط¹ ط§ط³طھ!',
        6000
      );
      return;
    }

    // ط¶ط¯ ط§ط³ظ¾ظ… â€” ع©ظ„غŒط¯ ط¨ط± ط§ط³ط§ط³ ع©ط§ط±ط¨ط±+ع¯ط±ظˆظ‡ ظˆ ظ‡ط´â€Œط´ط¯ظ‡ (ظ†ظ‡ ظ…طھظ† ط®ط§ظ… ط¯ط§ط®ظ„ URL)
    if (kvReady() && text.length > 10 && !edited) {
      const fp = hashText(`${chatId}:${userId}:${normalizeFa(text).slice(0, 120)}`);
      const fresh = await kv(['SET', `spam:${fp}`, '1', 'NX', 'EX', SPAM_TTL]);
      if (!fresh) {
        await del(chatId, msg.message_id);
        await statInc('deleted');
        await warn(chatId, 'âڑ ï¸ڈ ط§ط±ط³ط§ظ„ ظ¾غŒط§ظ… طھع©ط±ط§ط±غŒ (ط§ط³ظ¾ظ…) ظ…ظ…ظ†ظˆط¹ ط§ط³طھ!', 6000);
        return;
      }
    }
  }

  // ---------------------------------------------------------------
  // غ´) ط¯ط³طھظˆط±ط§طھ ط§ط¯ظ…غŒظ† (ط®طµظˆطµغŒ)
  // ---------------------------------------------------------------
  if (isAdmin && !isGroup) {
    // ظپظˆط±ظˆط§ط±ط¯ ط¯ط± ظ¾غŒظˆغŒ = ط§ظپط²ظˆط¯ظ† ط¨ظ‡ ط¨ظ„ع©â€Œظ„غŒط³طھ
    const src = getForwardSource(msg);
    if (src && !isCommandToBot) {
      if (!src.id) {
        await send(chatId, 'âڑ ï¸ڈ ظپط±ط³طھظ†ط¯ظ‡â€ŒغŒ ط§غŒظ† ظ¾غŒط§ظ… ط­ط³ط§ط¨ ط®ظˆط¯ ط±ط§ ظ…ط®ظپغŒ ع©ط±ط¯ظ‡ ظˆ ط´ظ†ط§ط³ظ‡â€Œط§غŒ ظ†ط¯ط§ط±ط¯ط› ظ†ظ…غŒâ€Œطھظˆط§ظ† ط¨ظ„ع©â€Œظ„غŒط³طھ ع©ط±ط¯.');
        return;
      }
      if (await entryHas('bl', src.id)) {
        await send(
          chatId,
          `âڑ ï¸ڈ ظ‚ط¨ظ„ط§ظ‹ ط¯ط± ط¨ظ„ع©â€Œظ„غŒط³طھ ط§ط³طھ!\n\nًں“Œ ${esc(src.name)}\nًں†” <code>${src.id}</code>`,
          { reply_markup: { inline_keyboard: [[{ text: 'ًں—‘ ط­ط°ظپ ط§ط² ط¨ظ„ع©â€Œظ„غŒط³طھ', callback_data: `bl:del:${src.id}:0` }]] } }
        );
      } else {
        await entryAdd('bl', src);
        await send(
          chatId,
          `âœ… ط¨ظ‡ ط¨ظ„ع©â€Œظ„غŒط³طھ ط§ط¶ط§ظپظ‡ ط´ط¯!\n\nًں“Œ ${esc(src.name)}\nًں†” <code>${src.id}</code>\nًں“‌ ${typeLabel(src.type)}\n\nًںڑ« ط§ط² ط§غŒظ† ظ¾ط³ ظ‡غŒع†â€Œع©ط³ (ط­طھغŒ ط§ط¯ظ…غŒظ†â€Œظ‡ط§) ظ†ظ…غŒâ€Œطھظˆط§ظ†ط¯ ط§ط² ط§غŒظ† ظ…ظ†ط¨ط¹ ظپظˆط±ظˆط§ط±ط¯ ع©ظ†ط¯.`,
          { reply_markup: { inline_keyboard: [[{ text: 'â†©ï¸ڈ ظ„ط؛ظˆ / ط­ط°ظپ ط§ط² ط¨ظ„ع©â€Œظ„غŒط³طھ', callback_data: `bl:yes:${src.id}:0` }]] } }
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
        `â‌Œ <b>ظ‡ط¯ظپ ظ…ط´ط®طµ ظ†ط´ط¯.</b>\n\n<b>ط±ظˆط´â€Œظ‡ط§:</b>\nâ€¢ <code>${base} 123456789</code>\nâ€¢ <code>${base} @username</code>\nâ€¢ ط±غŒظ¾ظ„ط§غŒ ط±ظˆغŒ ظ¾غŒط§ظ… + <code>${base}</code>`
      );
      return;
    }

    if (removing) {
      const ok = await entryRemove(kind, target.id);
      await send(
        chatId,
        ok
          ? `âœ… ط§ط² ${KIND[kind].label} ط­ط°ظپ ط´ط¯.\n\nًں“Œ ${esc(target.name)}\nًں†” <code>${target.id}</code>` +
              (kind === 'bl' ? '\n\nâ™»ï¸ڈ ظپظˆط±ظˆط§ط±ط¯ ط§ط² ط§غŒظ† ظ…ظ†ط¨ط¹ ط¯ظˆط¨ط§ط±ظ‡ ط¢ط²ط§ط¯ ط´ط¯.' : '')
          : `âڑ ï¸ڈ <code>${target.id}</code> ط¯ط± ${KIND[kind].label} ظ†ط¨ظˆط¯.`
      );
    } else {
      if (await entryHas(kind, target.id)) {
        await send(chatId, `âڑ ï¸ڈ <code>${target.id}</code> ط§ط² ظ‚ط¨ظ„ ط¯ط± ${KIND[kind].label} ط§ط³طھ.`);
      } else {
        await entryAdd(kind, target);
        await send(
          chatId,
          `âœ… ط¨ظ‡ ${KIND[kind].label} ط§ط¶ط§ظپظ‡ ط´ط¯.\n\nًں“Œ ${esc(target.name)}\nًں†” <code>${target.id}</code>\nًں“‌ ${typeLabel(target.type)}` +
            (kind === 'wl' ? '\n\nًں’، ظ…ط¹ط§ظپ ط§ط²: ظ„غŒظ†ع©طŒ ع©ظ„ظ…ط§طھ ط±ع©غŒع©طŒ ط§ط³ظ¾ظ…\nâڑ ï¸ڈ ط؛غŒط±ظ…ط¹ط§ظپ ط§ط²: ط¨ظ„ع©â€Œظ„غŒط³طھ' : ''),
          { reply_markup: { inline_keyboard: [[{ text: `ًں—‘ ط­ط°ظپ ط§ط² ${KIND[kind].label}`, callback_data: `${kind}:del:${target.id}:0` }]] } }
        );
      }
    }
    return;
  }

  if (isAdmin && base === '/id') {
    const t = await resolveTarget(msg, arg);
    await send(
      chatId,
      `ًں†” ع†طھ ظپط¹ظ„غŒ: <code>${chatId}</code>\nًں‘¤ ط´ظ…ط§: <code>${userId}</code>` +
        (t ? `\nًںژ¯ ظ‡ط¯ظپ: <code>${t.id}</code> (${esc(t.name)})` : '')
    );
    return;
  }

  if (isAdmin && !isGroup && base === '/migrate') {
    const n = await migrateLegacy();
    await send(chatId, `â™»ï¸ڈ ط§ظ†طھظ‚ط§ظ„ ط¯ط§ط¯ظ‡â€Œظ‡ط§غŒ ظ‚ط¯غŒظ…غŒ ط§ظ†ط¬ط§ظ… ط´ط¯.\nًں“¦ ${n} ط¢غŒطھظ… ظ…ظ†طھظ‚ظ„/ط¨ظ‡â€Œط±ظˆط²ط±ط³ط§ظ†غŒ ط´ط¯.`);
    return;
  }

  // ---------------------------------------------------------------
  // غµ) ط¯ط³طھظˆط±ط§طھ ط¹ظ…ظˆظ…غŒ
  // ---------------------------------------------------------------
  if (base === '/start') {
    if (isGroup) await del(chatId, msg.message_id);
    let t = 'ًں‘‹ <b>ط®ظˆط´ ط¢ظ…ط¯غŒط¯!</b>\n\n';
    if (isAdmin) {
      t +=
        'ًں”‘ ط´ظ…ط§ ط§ط¯ظ…غŒظ† ظ‡ط³طھغŒط¯.\n\n<b>ط±ط§ظ‡ظ†ظ…ط§غŒ ط³ط±غŒط¹:</b>\n' +
        'â€¢ ظپظˆط±ظˆط§ط±ط¯ غŒع© ظ¾غŒط§ظ… ط¯ط± ظ¾غŒظˆغŒ â†گ ط§ظپط²ظˆط¯ظ† ط¨ظ‡ ط¨ظ„ع©â€Œظ„غŒط³طھ\n' +
        'â€¢ <code>/bl ط¢غŒط¯غŒ|@username</code> â†گ ط§ظپط²ظˆط¯ظ† ط¨ظ‡ ط¨ظ„ع©â€Œظ„غŒط³طھ\n' +
        'â€¢ <code>/unbl ط¢غŒط¯غŒ|@username</code> â†گ ط­ط°ظپ ط§ط² ط¨ظ„ع©â€Œظ„غŒط³طھ\n' +
        'â€¢ <code>/wl</code> ظˆ <code>/unwl</code> â†گ ظˆط§غŒطھâ€Œظ„غŒط³طھ\n' +
        'â€¢ ط±غŒظ¾ظ„ط§غŒ ط±ظˆغŒ ظ¾غŒط§ظ… + <code>/bl</code> ط¯ط± ع¯ط±ظˆظ‡\n' +
        'â€¢ <code>/id</code> â†گ ظ†ظ…ط§غŒط´ ط´ظ†ط§ط³ظ‡â€Œظ‡ط§\n\n' +
        'âڑ ï¸ڈ ط¨ظ„ع©â€Œظ„غŒط³طھ ط¨ط±ط§غŒ ظ‡ظ…ظ‡ ط§ط¹ظ…ط§ظ„ ظ…غŒâ€Œط´ظˆط¯ (ط­طھغŒ ط§ط¯ظ…غŒظ†â€Œظ‡ط§).\n\n';
    }
    t += 'ط§ط² ط¯ع©ظ…ظ‡â€Œظ‡ط§غŒ ط²غŒط± ط§ط³طھظپط§ط¯ظ‡ ع©ظ†غŒط¯:';
    await send(chatId, t, {
      reply_markup: {
        keyboard: isAdmin ? [[{ text: 'ًں“‹ ظ…ظ†ظˆ' }], [{ text: 'âڑ™ï¸ڈ ظ…ط¯غŒط±غŒطھ' }]] : [[{ text: 'ًں“‹ ظ…ظ†ظˆ' }]],
        resize_keyboard: true,
      },
    });
    return;
  }

  if (base === '/menu' || cmd === 'ظ…ظ†ظˆ' || cmd === 'ًں“‹ ظ…ظ†ظˆ') {
    if (isGroup) await del(chatId, msg.message_id);
    const m = mainMenu(isAdmin);
    await send(chatId, m.text, { reply_markup: m.keyboard });
    return;
  }

  if ((base === '/admin' || cmd === 'âڑ™ï¸ڈ ظ…ط¯غŒط±غŒطھ') && isAdmin && !isGroup) {
    await send(chatId, ADMIN_MENU.text, { reply_markup: ADMIN_MENU.keyboard });
    return;
  }
}

/** ظ‡ط´ ع©ظˆطھط§ظ‡ ظˆ ظ¾ط§غŒط¯ط§ط± (FNV-1a) ط¨ط±ط§غŒ ع©ظ„غŒط¯ظ‡ط§غŒ ط§ط³ظ¾ظ… */
function hashText(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

// ==========================================================================
//  ط±ط¨ط§طھ ط§ط² ع¯ط±ظˆظ‡ ط§ط¶ط§ظپظ‡/ط­ط°ظپ ط´ط¯
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

  // ًں”’ ظپظ‚ط· طھظ„ع¯ط±ط§ظ… ط§ط¬ط§ط²ظ‡â€ŒغŒ ظپط±ط§ط®ظˆط§ظ†غŒ ط¯ط§ط±ط¯
  if (WEBHOOK_SECRET) {
    const got = req.headers['x-telegram-bot-api-secret-token'];
    if (got !== WEBHOOK_SECRET) {
      console.warn('â›”ï¸ڈ secret token ظ†ط§ظ…ط¹طھط¨ط±');
      return res.status(401).send('unauthorized');
    }
  }

  const update = req.body;
  if (!update || typeof update !== 'object') return res.status(200).send('OK');

  try {
    // ط¬ظ„ظˆع¯غŒط±غŒ ط§ط² ظ¾ط±ط¯ط§ط²ط´ ط¯ظˆط¨ط§ط±ظ‡â€ŒغŒ غŒع© ط¢ظ¾ط¯غŒطھ (retry طھظ„ع¯ط±ط§ظ…)
    if (update.update_id !== undefined && kvReady()) {
      const fresh = await kv(['SET', `upd:${update.update_id}`, '1', 'NX', 'EX', DEDUP_TTL]);
      if (!fresh) {
        console.log('â†©ï¸ڈ duplicate update skipped', update.update_id);
        return res.status(200).send('OK');
      }
    }

    if (update.callback_query) await handleCallback(update.callback_query);
    else if (update.my_chat_member) await handleMyChatMember(update.my_chat_member);
    else if (update.message) await handleMessage(update.message);
    else if (update.edited_message) await handleMessage(update.edited_message, { edited: true });
  } catch (e) {
    // ظ‡ط±ع¯ط² 500 ط¨ط±ظ†ع¯ط±ط¯ط§ظ†غŒط¯ط› ظˆع¯ط±ظ†ظ‡ طھظ„ع¯ط±ط§ظ… ظ‡ظ…ط§ظ† ط¢ظ¾ط¯غŒطھ ط±ط§ ط¨غŒâ€Œظ†ظ‡ط§غŒطھ ط¨ط§ط± ظ…غŒâ€Œظپط±ط³طھط¯
    console.error('ًں’¥ handler error:', e);
  }

  return res.status(200).send('OK');
}

// ط¨ط±ط§غŒ طھط³طھ ظ…ط­ظ„غŒ
module.exports.__test = {
  hasBadWord,
  hasLink,
  normalizeFa,
  getForwardSource,
  extractText,
  buildListView,
  hashText,
};
