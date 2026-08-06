export default async function handler(req, res) {
  // تست GET
  if (req.method === 'GET') {
    return res.status(200).json({ 
      status: 'online', 
      time: new Date().toISOString() 
    });
  }

  if (req.method !== 'POST') {
    return res.status(200).send('OK');
  }

  if (!req.body) {
    return res.status(200).send('OK');
  }

  const BOT_TOKEN = process.env.BOT_TOKEN;
  const ADMIN_IDS = process.env.ADMIN_IDS 
    ? process.env.ADMIN_IDS.split(',').map(id => parseInt(id.trim())) 
    : [];

  console.log('📨 Update:', JSON.stringify(req.body, null, 2));

  const tgApi = async (method, body) => {
    try {
      const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await response.json();
      console.log(`✅ ${method}:`, data.ok ? 'OK' : data);
      return data;
    } catch (e) {
      console.error(`❌ ${method}:`, e);
      return null;
    }
  };

  // Callback Handler
  if (req.body.callback_query) {
    const cb = req.body.callback_query;
    const chatId = cb.message.chat.id;
    const msgId = cb.message.message_id;
    const data = cb.data;
    const userId = cb.from.id;
    const isAdmin = ADMIN_IDS.includes(userId);

    console.log('🔘 Callback:', data, 'from user:', userId);

    let text = "";
    let keyboard = {};

    switch(data) {
      case "main_menu":
        text = "📌 *منوی اصلی*\n\nیکی از گزینه‌ها را انتخاب کنید:";
        keyboard = {
          inline_keyboard: [
            [{ text: "📢 کانال‌ها", callback_data: "channels" }],
            [{ text: "👥 گروه‌ها", callback_data: "groups" }],
            [{ text: "📞 ارتباط", callback_data: "contact" }],
            [{ text: "📜 قوانین", callback_data: "rules" }],
            ...(isAdmin ? [[{ text: "⚙️ مدیریت", callback_data: "admin" }]] : [])
          ]
        };
        break;

      case "channels":
        text = "📢 *کانال‌های ما:*";
        keyboard = {
          inline_keyboard: [
            [{ text: "اندیشه پهلویسم", url: "https://t.me/andishepahlavism" }],
            [{ text: "فروپاشی", url: "https://t.me/froopashee2" }],
            [{ text: "🔙 بازگشت", callback_data: "main_menu" }]
          ]
        };
        break;

      case "groups":
        text = "👥 *گروه‌های ما:*";
        keyboard = {
          inline_keyboard: [
            [{ text: "گفتگوی اندیشه پهلویسم", url: "https://t.me/goftemanazadAp" }],
            [{ text: "🔙 بازگشت", callback_data: "main_menu" }]
          ]
        };
        break;

      case "contact":
        text = "📞 *ارتباط با ما:*";
        keyboard = {
          inline_keyboard: [
            [{ text: "ارتباط اندیشه", url: "https://t.me/+aaJQcUU7ZIMyZWQ8" }],
            [{ text: "🔙 بازگشت", callback_data: "main_menu" }]
          ]
        };
        break;

      case "rules":
        text = "📜 *قوانین:*\n\n۱. توهین ممنوع است.\n۲. ارسال لینک ممنوع است.\n۳. اسپم ممنوع است.\n۴. نظم را رعایت کنید.";
        keyboard = {
          inline_keyboard: [[{ text: "🔙 بازگشت", callback_data: "main_menu" }]]
        };
        break;

      case "admin":
        if (!isAdmin) {
          await tgApi('answerCallbackQuery', { 
            callback_query_id: cb.id, 
            text: "⛔️ دسترسی ندارید!", 
            show_alert: true 
          });
          return res.status(200).send('OK');
        }
        text = "⚙️ *پنل مدیریت*\n\nگزینه را انتخاب کنید:";
        keyboard = {
          inline_keyboard: [
            [{ text: "📊 آمار", callback_data: "stats" }],
            [{ text: "🔙 بازگشت", callback_data: "main_menu" }]
          ]
        };
        break;

      case "stats":
        if (!isAdmin) {
          await tgApi('answerCallbackQuery', { 
            callback_query_id: cb.id, 
            text: "⛔️ دسترسی ندارید!", 
            show_alert: true 
          });
          return res.status(200).send('OK');
        }
        text = "📊 *آمار ربات*\n\nربات فعال است!";
        keyboard = {
          inline_keyboard: [[{ text: "🔙 بازگشت", callback_data: "admin" }]]
        };
        break;

      default:
        text = "❓ گزینه نامشخص";
        keyboard = {
          inline_keyboard: [[{ text: "🔙 منو", callback_data: "main_menu" }]]
        };
    }

    if (text) {
      await tgApi('editMessageText', {
        chat_id: chatId,
        message_id: msgId,
        text: text,
        parse_mode: "Markdown",
        reply_markup: keyboard
      });
    }

    await tgApi('answerCallbackQuery', { callback_query_id: cb.id });
    return res.status(200).send('OK');
  }

  // Message Handler
  const msg = req.body.message;
  if (!msg) {
    return res.status(200).send('OK');
  }

  const chatId = msg.chat.id;
  const text = msg.text || "";
  const userId = msg.from?.id;
  const isAdmin = ADMIN_IDS.includes(userId);

  console.log('💬 Message:', text, 'from:', userId);

  // حذف join/leave
  if (msg.new_chat_members || msg.left_chat_member) {
    await tgApi('deleteMessage', { chat_id: chatId, message_id: msg.message_id });
    return res.status(200).send('OK');
  }

  // /start
  if (text === '/start' || text.startsWith('/start@')) {
    const keyboard = isAdmin 
      ? [[{ text: "📋 منو" }], [{ text: "⚙️ مدیریت" }]]
      : [[{ text: "📋 منو" }]];

    await tgApi('sendMessage', {
      chat_id: chatId,
      text: `👋 *خوش آمدید!*\n\n${isAdmin ? '🔑 شما ادمین هستید.\n\n' : ''}از دکمه زیر استفاده کنید:`,
      parse_mode: "Markdown",
      reply_markup: { keyboard, resize_keyboard: true }
    });
    return res.status(200).send('OK');
  }

  // /menu
  if (text === '/menu' || text === 'منو' || text === '📋 منو') {
    const adminBtn = isAdmin ? [[{ text: "⚙️ مدیریت", callback_data: "admin" }]] : [];

    await tgApi('sendMessage', {
      chat_id: chatId,
      text: "📌 *منوی اصلی*\n\nگزینه را انتخاب کنید:",
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "📢 کانال‌ها", callback_data: "channels" }],
          [{ text: "👥 گروه‌ها", callback_data: "groups" }],
          [{ text: "📞 ارتباط", callback_data: "contact" }],
          [{ text: "📜 قوانین", callback_data: "rules" }],
          ...adminBtn
        ]
      }
    });
    return res.status(200).send('OK');
  }

  res.status(200).send('OK');
}
