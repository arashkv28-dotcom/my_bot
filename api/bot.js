
// ==========================================================================
//  Telegram Guard Bot — نسخه بازنویسی و اصلاح‌شده
//  Runtime: Vercel Serverless Function (Node.js 18+)  |  DB: Upstash Redis REST
//
//  متغیرهای محیطی لازم:
//    BOT_TOKEN            توکن ربات
//    ADMIN_IDS            آیدی عددی ادمین‌ها با کاما  (مثال: 111,222)
//    KV_REST_API_URL      آدرس Upstash Redis REST
//    KV_REST_API_TOKEN    توکن Upstash
//    WEBHOOK_SECRET       (اختیاری ولی اکیداً توصیه‌شده) همان مقداری که هنگام
//                         setWebhook در پارامتر secret_token دادید
// ==========================================================================

const BOT_TOKEN = process.env.BOT_TOKEN;
const KV_URL = (process.env.KV_REST_API_URL || '').replace(/\/+$/, '');
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';

const ADMIN_IDS = (process.env.ADMIN_IDS || '')
  .split(',')
  .map((id) => parseInt(id.trim(), 10))
  .filter((id) => Number.isFinite(id));

const PAGE_SIZE = 8;          // تعداد آیتم در هر صفحه‌ی لیست‌ها
const WARN_TTL_MS = 5000;     // مدت نمایش پیام اخطار
const DEDUP_TTL = 300;        // ثانیه — جلوگیری از پردازش دوباره‌ی یک آپدیت
const SPAM_TTL = 3600;        // ثانیه — پنجره‌ی تشخیص پیام تکراری
const GROUP_TOUCH_TTL = 21600;// ثانیه — هر ۶ ساعت یک‌بار اطلاعات گروه را می‌نویسیم

// ==========================================================================
//  ابزارهای پایه
// ==========================================================================

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** فرار دادن کاراکترهای HTML — چون parse_mode را HTML گذاشته‌ایم */
const esc = (s = '') =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function tgApi(method, body) {
  if (!BOT_TOKEN) {
    console.error('BOT_TOKEN تعریف نشده است');
    return null;
  }
  try {
    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!j.ok) console.warn(`⚠️ ${method}: ${j.description}`);
    return j;
  } catch (e) {
    console.error(`❌ ${method}:`, e);
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

/** اخطار موقت: می‌فرستد، صبر می‌کند، پاک می‌کند */
async function warn(chatId, text, ttl = WARN_TTL_MS) {
  const w = await send(chatId, text);
  if (w?.ok && w.result) {
    await sleep(ttl);
    await del(chatId, w.result.message_id);
  }
}

// ==========================================================================
//  لایه‌ی دیتابیس (Upstash REST — با POST و پایپ‌لاین، نه URL-path)
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

// --- کلیدها ---------------------------------------------------------------
const KIND = {
  bl: { key: (id) => `bl:${id}`, index: 'bl:index', label: 'بلک‌لیست' },
  wl: { key: (id) => `wl:${id}`, index: 'wl:index', label: 'وایت‌لیست' },
  grp: { key: (id) => `grp:${id}`, index: 'grp:index', label: 'گروه‌ها' },
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
  // فقط وقتی true که واقعاً چیزی حذف شده باشد
  return Number(res[0] || 0) > 0 || Number(res[1] || 0) > 0;
}

async function entryHas(kind, id) {
  if (id === null || id === undefined) return false;
  const r = await kv(['EXISTS', KIND[kind].key(id)]);
  return Number(r) === 1;   // fail-closed نسبت به خطا (null → false)
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

/** همه‌ی آیتم‌ها با یک SMEMBERS + یک MGET (به‌جای N درخواست) */
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
  if (orphans.length) await kv(['SREM', K.index, ...orphans]); // پاکسازی ایندکس
  return out.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
}

const statInc = (key, by = 1) => kv(['INCRBY', `stat:${key}`, by]);
async function statGet(key) {
  const v = await kv(['GET', `stat:${key}`]);
  return parseInt(v, 10) || 0;
}

/** انتقال داده‌های ساختار قدیمی (blacklist_* / whitelist_* / group_*) */
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
      } catch { /* مقدار خراب */ }
      if (!obj || obj.id === undefined) continue;
      await entryAdd(kind, { id: obj.id, name: obj.name || obj.title, type: obj.type || 'unknown' });
      moved++;
    }
  }
  return moved;
}

// ==========================================================================
//  استخراج اطلاعات پیام
// ==========================================================================

const fullName = (u) =>
  [u?.first_name, u?.last_name].filter(Boolean).join(' ').trim() ||
  (u?.username ? '@' + u.username : '') ||
  'کاربر';

/**
 * منبع فوروارد را از هر دو ساختار برمی‌گرداند:
 *  - forward_origin  (Bot API 7.0 به بعد — ساختار فعلی)
 *  - forward_from / forward_from_chat  (قدیمی، برای سازگاری)
 */
function getForwardSource(msg) {
  const o = msg.forward_origin;
  if (o) {
    if (o.type === 'user' && o.sender_user)
      return { id: o.sender_user.id, name: fullName(o.sender_user), type: 'user' };
    if (o.type === 'chat' && o.sender_chat)
      return { id: o.sender_chat.id, name: o.sender_chat.title || o.sender_chat.username || 'گروه', type: o.sender_chat.type };
    if (o.type === 'channel' && o.chat)
      return { id: o.chat.id, name: o.chat.title || o.chat.username || 'کانال', type: 'channel' };
    if (o.type === 'hidden_user')
      return { id: null, name: o.sender_user_name || 'کاربر مخفی', type: 'hidden_user' };
  }
  if (msg.forward_from_chat)
    return {
      id: msg.forward_from_chat.id,
      name: msg.forward_from_chat.title || msg.forward_from_chat.username || 'کانال',
      type: msg.forward_from_chat.type,
    };
  if (msg.forward_from)
    return { id: msg.forward_from.id, name: fullName(msg.forward_from), type: 'user' };
  return null;
}

/** متن + کپشن + آدرس‌های مخفی داخل entityها (text_link) */
function extractText(msg) {
  const parts = [];
  if (msg.text) parts.push(msg.text);
  if (msg.caption) parts.push(msg.caption);
  for (const e of [...(msg.entities || []), ...(msg.caption_entities || [])]) {
    if (e.type === 'text_link' && e.url) parts.push(e.url);
  }
  return parts.join('\n');
}

// --- فیلترها ---------------------------------------------------------------

const BAD_WORDS = [
  'کونی', 'جاکش', 'جنده', 'چاهزاده', 'شاشزاده',
  'کون', 'کص', 'کس کش', 'کسکش', 'کوسکش', 'کوصکش', 'کصکش',
  'کیر', 'کوس', 'گوه',
];

/** یکسان‌سازی حروف عربی/فارسی، حذف نیم‌فاصله و اعراب و کشیده */
function normalizeFa(s = '') {
  return String(s)
    .toLowerCase()
    .replace(/[\u200c\u200f\u200e\u061c]/g, '')      // ZWNJ و کاراکترهای جهت
    .replace(/[\u064B-\u0652\u0640]/g, '')           // اعراب و کشیده
    .replace(/[يﻱﯼﯽ]/g, 'ی')
    .replace(/[كﻙ]/g, 'ک')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[۰-۹]/g, (d) => '0123456789'['۰۱۲۳۴۵۶۷۸۹'.indexOf(d)])
    .replace(/[^\p{L}\p{N}\s@._/:-]/gu, ' ')         // نشانه‌گذاری → فاصله
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
//  کیبوردها و متن‌های ثابت
// ==========================================================================

const backBtn = (cb) => [{ text: '🔙 بازگشت', callback_data: cb }];

function mainMenu(isAdmin) {
  return {
    text: '📌 <b>منوی اصلی</b>\n\nیکی از گزینه‌ها را انتخاب کنید:',
    keyboard: {
      inline_keyboard: [
        [{ text: '📢 کانال‌ها', callback_data: 'menu:channels' }],
        [{ text: '👥 گروه‌ها', callback_data: 'menu:groups' }],
        [{ text: '📞 ارتباط', callback_data: 'menu:contact' }],
        [{ text: '📜 قوانین', callback_data: 'menu:rules' }],
        ...(isAdmin ? [[{ text: '⚙️ مدیریت', callback_data: 'adm:home' }]] : []),
      ],
    },
  };
}

const ADMIN_MENU = {
  text: '⚙️ <b>پنل مدیریت</b>\n\nگزینه را انتخاب کنید:',
  keyboard: {
    inline_keyboard: [
      [{ text: '📊 آمار', callback_data: 'adm:stats' }],
      [{ text: '📋 گروه‌ها', callback_data: 'grp:list:0' }],
      [{ text: '🚫 بلک‌لیست', callback_data: 'bl:list:0' }],
      [{ text: '✅ وایت‌لیست', callback_data: 'wl:list:0' }],
      backBtn('menu:main'),
    ],
  },
};

const typeIcon = (t) =>
  t === 'user' || t === 'private' ? '👤' : t === 'channel' ? '📢' : t === 'hidden_user' ? '🕶' : '👥';

const typeLabel = (t) =>
  ({ user: 'کاربر', private: 'کاربر', channel: 'کانال', group: 'گروه', supergroup: 'سوپرگروه' }[t] || t || 'نامشخص');

/** ساخت لیست صفحه‌بندی‌شده برای bl / wl / grp */
function buildListView(kind, items, page) {
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const p = Math.min(Math.max(0, page), pages - 1);
  const slice = items.slice(p * PAGE_SIZE, p * PAGE_SIZE + PAGE_SIZE);

  const rows = slice.map((it) => [
    {
      text: `${typeIcon(it.type)} ${String(it.name || it.title || it.id).slice(0, 28)}`,
      callback_data: `${kind}:view:${it.id}:${p}`,
    },
    { text: '🗑', callback_data: `${kind}:del:${it.id}:${p}` },
  ]);

  const nav = [];
  if (p > 0) nav.push({ text: '◀️ قبلی', callback_data: `${kind}:list:${p - 1}` });
  if (pages > 1) nav.push({ text: `${p + 1}/${pages}`, callback_data: 'nop' });
  if (p < pages - 1) nav.push({ text: 'بعدی ▶️', callback_data: `${kind}:list:${p + 1}` });

  const counts = {
    users: items.filter((i) => i.type === 'user' || i.type === 'private').length,
    channels: items.filter((i) => i.type === 'channel').length,
    groups: items.filter((i) => i.type === 'group' || i.type === 'supergroup').length,
  };

  const head =
    kind === 'bl'
      ? '🚫 <b>بلک‌لیست</b>'
      : kind === 'wl'
      ? '✅ <b>وایت‌لیست</b>'
      : '📋 <b>گروه‌های ربات</b>';

  let text = `${head}\n\n👤 کاربران: ${counts.users}\n📢 کانال‌ها: ${counts.channels}\n👥 گروه‌ها: ${counts.groups}\n📊 مجموع: ${items.length}\n\n`;
  text += kind === 'bl'
    ? '⚠️ فوروارد از این منابع برای <b>همه</b> ممنوع است (حتی ادمین‌ها).\n\n🗑 = حذف سریع از لیست'
    : kind === 'wl'
    ? '💡 معاف از فیلتر لینک/کلمات/اسپم — ولی نه از بلک‌لیست.\n\n🗑 = حذف سریع از لیست'
    : '🗑 = خروج ربات از گروه';

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

  // 🔧 باگ اصلی نسخه قبل: startsWith("bl_") قبل از "bl_remove_" چک می‌شد و
  //     دکمه حذف هیچ‌وقت کار نمی‌کرد. حالا روتینگ بر اساس بخش‌های جدا از هم است.
  const [ns, action, arg1, arg2] = data.split(':');

  const adminOnly = ['adm', 'bl', 'wl', 'grp'].includes(ns);
  if (adminOnly && !isAdmin) {
    await ack('⛔️ دسترسی ندارید!', true);
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
      text = '📢 <b>کانال‌های ما:</b>';
      keyboard = {
        inline_keyboard: [
          [{ text: 'اندیشه پهلویسم', url: 'https://t.me/andishepahlavism' }],
          [{ text: 'فروپاشی', url: 'https://t.me/froopashee2' }],
          [{ text: 'الفبای سیاست', url: 'https://t.me/Allephba' }],
          backBtn('menu:main'),
        ],
      };
    } else if (action === 'groups') {
      text = '👥 <b>گروه‌های ما:</b>';
      keyboard = {
        inline_keyboard: [
          [{ text: 'گفتگوی اندیشه پهلویسم', url: 'https://t.me/goftemanazadAp' }],
          [{ text: 'گفتگوی فروپاشی', url: 'https://t.me/+6nIM1oBqTaVjNzYy' }],
          backBtn('menu:main'),
        ],
      };
    } else if (action === 'contact') {
      text = '📞 <b>ارتباط با ما:</b>';
      keyboard = {
        inline_keyboard: [
          [{ text: 'ارتباط اندیشه', url: 'https://t.me/+aaJQcUU7ZIMyZWQ8' }],
          [{ text: 'ارتباط فروپاشی', url: 'https://t.me/+GZOW85iRkX45ODJi' }],
          backBtn('menu:main'),
        ],
      };
    } else if (action === 'rules') {
      text =
        '📜 <b>قوانین:</b>\n\n۱. توهین و کلمات رکیک ممنوع.\n۲. ارسال لینک و تبلیغات ممنوع.\n۳. پیام تکراری (اسپم) ممنوع.\n۴. فوروارد از منابع بلک‌لیست ممنوع.\n۵. نظم گروه را رعایت کنید.';
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
        `📊 <b>آمار ربات</b>\n\n` +
        `📨 کل پیام‌ها: ${messages}\n` +
        `🗑 حذف‌شده: ${deleted}\n` +
        `🚫 فوروارد بلاک‌شده: ${blocked}\n\n` +
        `📋 گروه‌های فعال: ${groups.length}\n` +
        `🚫 بلک‌لیست: ${bl.length}\n` +
        `✅ وایت‌لیست: ${wl.length}`;
      keyboard = { inline_keyboard: [backBtn('adm:home')] };
    }
  } else if (ns === 'bl' || ns === 'wl' || ns === 'grp') {
    const items = await entryList(ns);

    if (action === 'list') {
      if (items.length === 0) {
        text =
          ns === 'bl'
            ? '🚫 <b>بلک‌لیست</b>\n\n❌ لیست خالی است.\n\n<b>افزودن:</b>\n• یک پیام از آن کاربر/کانال را برایم فوروارد کنید\n• یا <code>/bl آیدی</code> — <code>/bl @username</code>\n\n<b>حذف:</b> <code>/unbl آیدی</code>'
            : ns === 'wl'
            ? '✅ <b>وایت‌لیست</b>\n\n❌ لیست خالی است.\n\n<b>افزودن:</b> <code>/wl آیدی</code> یا <code>/wl @username</code>\n<b>حذف:</b> <code>/unwl آیدی</code>'
            : '📋 <b>گروه‌ها</b>\n\n❌ هیچ گروهی ثبت نشده.';
        keyboard = { inline_keyboard: [backBtn('adm:home')] };
      } else {
        ({ text, keyboard } = buildListView(ns, items, parseInt(arg1, 10) || 0));
      }
    } else if (action === 'view') {
      const item = items.find((i) => String(i.id) === String(arg1));
      if (!item) {
        text = '❌ آیتم یافت نشد (شاید قبلاً حذف شده).';
        keyboard = { inline_keyboard: [backBtn(`${ns}:list:0`)] };
      } else {
        text =
          `${typeIcon(item.type)} <b>جزئیات ${KIND[ns].label}</b>\n\n` +
          `📌 نام: ${esc(item.name || item.title)}\n` +
          `🆔 شناسه: <code>${item.id}</code>\n` +
          `📝 نوع: ${typeLabel(item.type)}\n` +
          (item.username ? `👤 یوزرنیم: @${esc(item.username)}\n` : '') +
          (item.addedAt ? `🕓 تاریخ: ${new Date(item.addedAt).toLocaleString('fa-IR')}\n` : '');
        keyboard = {
          inline_keyboard: [
            [
              {
                text: ns === 'grp' ? '🚪 خروج از گروه' : `🗑 حذف از ${KIND[ns].label}`,
                callback_data: `${ns}:del:${item.id}:${arg2 || 0}`,
              },
            ],
            backBtn(`${ns}:list:${arg2 || 0}`),
          ],
        };
      }
    } else if (action === 'del') {
      // مرحله‌ی تأیید — جلوگیری از حذف تصادفی
      const item = items.find((i) => String(i.id) === String(arg1));
      const name = item ? esc(item.name || item.title || item.id) : arg1;
      text =
        ns === 'grp'
          ? `❓ <b>تأیید خروج</b>\n\nربات از گروه «${name}» خارج شود؟`
          : `❓ <b>تأیید حذف</b>\n\n«${name}» از ${KIND[ns].label} حذف شود؟` +
            (ns === 'bl' ? '\n\n♻️ بعد از حذف، فوروارد از این منبع دوباره آزاد می‌شود.' : '');
      keyboard = {
        inline_keyboard: [
          [
            { text: '✅ بله، حذف کن', callback_data: `${ns}:yes:${arg1}:${arg2 || 0}` },
            { text: '❌ انصراف', callback_data: `${ns}:list:${arg2 || 0}` },
          ],
        ],
      };
    } else if (action === 'yes') {
      let ok;
      if (ns === 'grp') {
        const left = await tgApi('leaveChat', { chat_id: arg1 });
        await entryRemove('grp', arg1);
        ok = Boolean(left?.ok);
        await ack(ok ? '✅ ربات خارج شد' : '⚠️ خروج ناموفق بود، اما از لیست پاک شد');
      } else {
        ok = await entryRemove(ns, arg1);
        await ack(ok ? `✅ از ${KIND[ns].label} حذف شد` : '⚠️ در لیست نبود');
      }
      const fresh = await entryList(ns);
      if (fresh.length === 0) {
        text = `✅ انجام شد.\n\n${KIND[ns].label} اکنون خالی است.`;
        keyboard = { inline_keyboard: [backBtn('adm:home')] };
      } else {
        const v = buildListView(ns, fresh, parseInt(arg2, 10) || 0);
        text = `✅ انجام شد.\n\n${v.text}`;
        keyboard = v.keyboard;
      }
      // ack قبلاً داده شده
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
  // اگر پیام قابل ویرایش نبود (خیلی قدیمی/حذف‌شده) یک پیام تازه بفرست
  if (r && !r.ok && !/message is not modified/i.test(r.description || '')) {
    await send(chatId, text, { reply_markup: keyboard });
  }
}

// ==========================================================================
//  ابزار شناسایی هدف برای دستورات (/bl /unbl /wl /unwl)
// ==========================================================================

async function resolveTarget(msg, arg) {
  // ۱) اگر روی پیامی ریپلای شده
  const rep = msg.reply_to_message;
  if (!arg && rep) {
    const fwd = getForwardSource(rep);
    if (fwd && fwd.id) return fwd;
    if (rep.sender_chat)
      return { id: rep.sender_chat.id, name: rep.sender_chat.title || 'چت', type: rep.sender_chat.type };
    if (rep.from) return { id: rep.from.id, name: fullName(rep.from), type: 'user' };
  }
  if (!arg) return null;

  // ۲) آیدی عددی
  if (/^-?\d+$/.test(arg)) {
    const id = Number(arg);
    if (!Number.isSafeInteger(id)) return null;
    return { id, name: `ID ${id}`, type: id < 0 ? 'group' : 'user' };
  }

  // ۳) یوزرنیم — فقط برای کانال/گروه یا کاربری که ربات دیده است کار می‌کند
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

  // ثبت گروه — با throttle تا برای هر پیام یک نوشتن روی KV نداشته باشیم
  if (isGroup && msg.chat.title) {
    const fresh = await kv(['SET', `grp:touch:${chatId}`, '1', 'NX', 'EX', GROUP_TOUCH_TTL]);
    if (fresh) {
      await entryAdd('grp', { id: chatId, name: msg.chat.title, type: msg.chat.type });
      await kv(['HSET', `grp:meta:${chatId}`, 'username', msg.chat.username || '']);
    }
  }

  // حذف پیام‌های سیستمی ورود/خروج
  if (msg.new_chat_members || msg.left_chat_member) {
    await del(chatId, msg.message_id);
    return;
  }

  // ---------------------------------------------------------------
  // ۱) بلک‌لیست فوروارد — بالاترین اولویت، شامل ادمین‌ها هم می‌شود
  // ---------------------------------------------------------------
  if (isGroup) {
    const src = getForwardSource(msg);
    const senderChat = msg.sender_chat?.id ?? null; // پیام از طرف کانال

    const [srcBlocked, senderBlocked] = await Promise.all([
      src?.id ? entryHas('bl', src.id) : Promise.resolve(false),
      senderChat && !msg.is_automatic_forward ? entryHas('bl', senderChat) : Promise.resolve(false),
    ]);

    if (srcBlocked || senderBlocked) {
      const who = srcBlocked ? src : { name: msg.sender_chat.title || 'کانال', id: senderChat };
      console.log('🚫 BLACKLIST ENFORCED:', who.id, 'admin:', isAdmin);
      await del(chatId, msg.message_id);
      await kvPipe([
        ['INCRBY', 'stat:blocked_forwards', 1],
        ['INCRBY', 'stat:deleted', 1],
      ]);
      await warn(
        chatId,
        isAdmin
          ? `🚫 <b>اخطار به ادمین</b>\n\n«${esc(who.name)}» در بلک‌لیست است.\n⚠️ حتی ادمین‌ها هم نمی‌توانند از منابع بلک‌لیست فوروارد کنند.`
          : `🚫 پیام حذف شد\n\nفوروارد از «${esc(who.name)}» ممنوع است.`,
        isAdmin ? 8000 : 5000
      );
      return;
    }
  }

  // ---------------------------------------------------------------
  // ۲) معافیت‌ها (فقط برای فیلترهای عمومی، نه بلک‌لیست)
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
  // ۳) فیلترهای عمومی
  // ---------------------------------------------------------------
  if (isGroup && !isExempt && text) {
    const bad = hasBadWord(text);
    // دستورهای خود ربات نباید قربانی فیلتر منشن (@BotName) شوند
    const link = !isCommandToBot && hasLink(text, msg);

    if (bad || link) {
      await del(chatId, msg.message_id);
      await statInc('deleted');
      await warn(
        chatId,
        bad ? '⚠️ استفاده از کلمات نامناسب ممنوع است!' : '⚠️ ارسال لینک و تبلیغات ممنوع است!',
        6000
      );
      return;
    }

    // ضد اسپم — کلید بر اساس کاربر+گروه و هش‌شده (نه متن خام داخل URL)
    if (kvReady() && text.length > 10 && !edited) {
      const fp = hashText(`${chatId}:${userId}:${normalizeFa(text).slice(0, 120)}`);
      const fresh = await kv(['SET', `spam:${fp}`, '1', 'NX', 'EX', SPAM_TTL]);
      if (!fresh) {
        await del(chatId, msg.message_id);
        await statInc('deleted');
        await warn(chatId, '⚠️ ارسال پیام تکراری (اسپم) ممنوع است!', 6000);
        return;
      }
    }
  }

  // ---------------------------------------------------------------
  // ۴) دستورات ادمین (خصوصی)
  // ---------------------------------------------------------------
  if (isAdmin && !isGroup) {
    // فوروارد در پیوی = افزودن به بلک‌لیست
    const src = getForwardSource(msg);
    if (src && !isCommandToBot) {
      if (!src.id) {
        await send(chatId, '⚠️ فرستنده‌ی این پیام حساب خود را مخفی کرده و شناسه‌ای ندارد؛ نمی‌توان بلک‌لیست کرد.');
        return;
      }
      if (await entryHas('bl', src.id)) {
        await send(
          chatId,
          `⚠️ قبلاً در بلک‌لیست است!\n\n📌 ${esc(src.name)}\n🆔 <code>${src.id}</code>`,
          { reply_markup: { inline_keyboard: [[{ text: '🗑 حذف از بلک‌لیست', callback_data: `bl:del:${src.id}:0` }]] } }
        );
      } else {
        await entryAdd('bl', src);
        await send(
          chatId,
          `✅ به بلک‌لیست اضافه شد!\n\n📌 ${esc(src.name)}\n🆔 <code>${src.id}</code>\n📝 ${typeLabel(src.type)}\n\n🚫 از این پس هیچ‌کس (حتی ادمین‌ها) نمی‌تواند از این منبع فوروارد کند.`,
          { reply_markup: { inline_keyboard: [[{ text: '↩️ لغو / حذف از بلک‌لیست', callback_data: `bl:yes:${src.id}:0` }]] } }
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
        `❌ <b>هدف مشخص نشد.</b>\n\n<b>روش‌ها:</b>\n• <code>${base} 123456789</code>\n• <code>${base} @username</code>\n• ریپلای روی پیام + <code>${base}</code>`
      );
      return;
    }

    if (removing) {
      const ok = await entryRemove(kind, target.id);
      await send(
        chatId,
        ok
          ? `✅ از ${KIND[kind].label} حذف شد.\n\n📌 ${esc(target.name)}\n🆔 <code>${target.id}</code>` +
              (kind === 'bl' ? '\n\n♻️ فوروارد از این منبع دوباره آزاد شد.' : '')
          : `⚠️ <code>${target.id}</code> در ${KIND[kind].label} نبود.`
      );
    } else {
      if (await entryHas(kind, target.id)) {
        await send(chatId, `⚠️ <code>${target.id}</code> از قبل در ${KIND[kind].label} است.`);
      } else {
        await entryAdd(kind, target);
        await send(
          chatId,
          `✅ به ${KIND[kind].label} اضافه شد.\n\n📌 ${esc(target.name)}\n🆔 <code>${target.id}</code>\n📝 ${typeLabel(target.type)}` +
            (kind === 'wl' ? '\n\n💡 معاف از: لینک، کلمات رکیک، اسپم\n⚠️ غیرمعاف از: بلک‌لیست' : ''),
          { reply_markup: { inline_keyboard: [[{ text: `🗑 حذف از ${KIND[kind].label}`, callback_data: `${kind}:del:${target.id}:0` }]] } }
        );
      }
    }
    return;
  }

  if (isAdmin && base === '/id') {
    const t = await resolveTarget(msg, arg);
    await send(
      chatId,
      `🆔 چت فعلی: <code>${chatId}</code>\n👤 شما: <code>${userId}</code>` +
        (t ? `\n🎯 هدف: <code>${t.id}</code> (${esc(t.name)})` : '')
    );
    return;
  }

  if (isAdmin && !isGroup && base === '/migrate') {
    const n = await migrateLegacy();
    await send(chatId, `♻️ انتقال داده‌های قدیمی انجام شد.\n📦 ${n} آیتم منتقل/به‌روزرسانی شد.`);
    return;
  }

  // ---------------------------------------------------------------
  // ۵) دستورات عمومی
  // ---------------------------------------------------------------
  if (base === '/start') {
    if (isGroup) await del(chatId, msg.message_id);
    let t = '👋 <b>خوش آمدید!</b>\n\n';
    if (isAdmin) {
      t +=
        '🔑 شما ادمین هستید.\n\n<b>راهنمای سریع:</b>\n' +
        '• فوروارد یک پیام در پیوی ← افزودن به بلک‌لیست\n' +
        '• <code>/bl آیدی|@username</code> ← افزودن به بلک‌لیست\n' +
        '• <code>/unbl آیدی|@username</code> ← حذف از بلک‌لیست\n' +
        '• <code>/wl</code> و <code>/unwl</code> ← وایت‌لیست\n' +
        '• ریپلای روی پیام + <code>/bl</code> در گروه\n' +
        '• <code>/id</code> ← نمایش شناسه‌ها\n\n' +
        '⚠️ بلک‌لیست برای همه اعمال می‌شود (حتی ادمین‌ها).\n\n';
    }
    t += 'از دکمه‌های زیر استفاده کنید:';
    await send(chatId, t, {
      reply_markup: {
        keyboard: isAdmin ? [[{ text: '📋 منو' }], [{ text: '⚙️ مدیریت' }]] : [[{ text: '📋 منو' }]],
        resize_keyboard: true,
      },
    });
    return;
  }

  if (base === '/menu' || cmd === 'منو' || cmd === '📋 منو') {
    if (isGroup) await del(chatId, msg.message_id);
    const m = mainMenu(isAdmin);
    await send(chatId, m.text, { reply_markup: m.keyboard });
    return;
  }

  if ((base === '/admin' || cmd === '⚙️ مدیریت') && isAdmin && !isGroup) {
    await send(chatId, ADMIN_MENU.text, { reply_markup: ADMIN_MENU.keyboard });
    return;
  }
}

/** هش کوتاه و پایدار (FNV-1a) برای کلیدهای اسپم */
function hashText(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

// ==========================================================================
//  ربات از گروه اضافه/حذف شد
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

export default async function handler(req, res) {
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

  // 🔒 فقط تلگرام اجازه‌ی فراخوانی دارد
  if (WEBHOOK_SECRET) {
    const got = req.headers['x-telegram-bot-api-secret-token'];
    if (got !== WEBHOOK_SECRET) {
      console.warn('⛔️ secret token نامعتبر');
      return res.status(401).send('unauthorized');
    }
  }

  const update = req.body;
  if (!update || typeof update !== 'object') return res.status(200).send('OK');

  try {
    // جلوگیری از پردازش دوباره‌ی یک آپدیت (retry تلگرام)
    if (update.update_id !== undefined && kvReady()) {
      const fresh = await kv(['SET', `upd:${update.update_id}`, '1', 'NX', 'EX', DEDUP_TTL]);
      if (!fresh) {
        console.log('↩️ duplicate update skipped', update.update_id);
        return res.status(200).send('OK');
      }
    }

    if (update.callback_query) await handleCallback(update.callback_query);
    else if (update.my_chat_member) await handleMyChatMember(update.my_chat_member);
    else if (update.message) await handleMessage(update.message);
    else if (update.edited_message) await handleMessage(update.edited_message, { edited: true });
  } catch (e) {
    // هرگز 500 برنگردانید؛ وگرنه تلگرام همان آپدیت را بی‌نهایت بار می‌فرستد
    console.error('💥 handler error:', e);
  }

  return res.status(200).send('OK');
}

// برای تست محلی
export const __test = {
  hasBadWord,
  hasLink,
  normalizeFa,
  getForwardSource,
  extractText,
  buildListView,
  hashText,
};
