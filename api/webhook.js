export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('Bot is running!');
  
  const BOT_TOKEN = process.env.BOT_TOKEN;
  
  const tgApi = async (method, body) => {
    return await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  };

  // ==========================================
  // 🎛️ بخش اول: مدیریت کلیک روی دکمه‌های شیشه‌ای
  // ==========================================
  if (req.body.callback_query) {
    const callbackQuery = req.body.callback_query;
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const data = callbackQuery.data;

    let newText = "";
    let newMarkup = {};

    if (data === "main_menu") {
      newText = "📌 **منوی اصلی مجموعه‌ها**\nلطفاً یکی از گزینه‌های زیر را انتخاب کنید:";
      newMarkup = {
        inline_keyboard: [
          [{ text: "📢 کانال های ما", callback_data: "menu_channels" }],
          [{ text: "👥 گروه های ما", callback_data: "menu_groups" }],
          [{ text: "📞 گروه های ارتباط", callback_data: "menu_contact" }],
          [{ text: "📜 قوانین", callback_data: "menu_rules" }]
        ]
      };
    }
    else if (data === "menu_channels") {
      newText = "📢 **لیست کانال‌های ما:**";
      newMarkup = {
        inline_keyboard: [
          [{ text: "کانال 1 عکس و استیکر اندیشه پهلویسم", url: "https://t.me/pic_gifpahlavi" }],
          [{ text: "کانال 2 اندیشه پهلویسم", url: "https://t.me/andishepahlavism" }],
          [{ text: "کانال 3 فروپاشی", url: "https://t.me/froopashee2" }],
          [{ text: "کانال 4 الفبای سیاست", url: "https://t.me/Allephba" }],
          [{ text: "🔙 بازگشت به منوی اصلی", callback_data: "main_menu" }]
        ]
      };
    }
    else if (data === "menu_groups") {
      newText = "👥 **لیست گروه‌های ما:**";
      newMarkup = {
        inline_keyboard: [
          [{ text: "گروه اول گفتگوی اندیشه پهلویسم", url: "https://t.me/goftemanazadAp" }],
          [{ text: "گروه 2 گفتگوی فروپاشی", url: "https://t.me/+6nIM1oBqTaVjNzYy" }],
          [{ text: "گروه 3 تلنگر", url: "https://t.me/+Vad19Bh1UAxmYTYy" }],
          [{ text: "گروه 4 گپ شبانه", url: "https://t.me/+j9Xnb05ntcVmM2Ni" }],
          [{ text: "گروه 5 گروه عکس و استیکر اندیشه پهلویسم", url: "https://t.me/pic_gifpahlavi_r" }],
          [{ text: "🔙 بازگشت به منوی اصلی", callback_data: "main_menu" }]
        ]
      };
    }
    else if (data === "menu_contact") {
      newText = "📞 **گروه‌های ارتباط:**";
      newMarkup = {
        inline_keyboard: [
          [{ text: "گروه ارتباط اندیشه پهلویسم", url: "https://t.me/+aaJQcUU7ZIMyZWQ8" }],
          [{ text: "گروه ارتباط فرو پاشی", url: "https://t.me/+GZOW85iRkX45ODJi" }],
          [{ text: "🔙 بازگشت به منوی اصلی", callback_data: "main_menu" }]
        ]
      };
    }
    else if (data === "menu_rules") {
      newText = "📜 **قوانین و مقررات:**\n\n۱. استفاده از کلمات رکیک و توهین ممنوع است.\n۲. ارسال هرگونه لینک و تبلیغات اکیداً ممنوع است.\n۳. سیستم به صورت خودکار پیام‌های تکراری و لینک‌ها را حذف می‌کند.\n۴. لطفاً نظم گروه را رعایت کنید.";
      newMarkup = {
        inline_keyboard: [
          [{ text: "🔙 بازگشت به منوی اصلی", callback_data: "main_menu" }]
        ]
      };
    }

    if (newText !== "") {
      await tgApi('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text: newText,
        parse_mode: "Markdown",
        reply_markup: newMarkup
      });
    }

    await tgApi('answerCallbackQuery', { callback_query_id: callbackQuery.id });
    return res.status(200).send('OK');
  }

  // ==========================================
  // 🛡️ بخش دوم: مدیریت پیام‌های متنی (امنیت و کیبورد)
  // ==========================================
  const message = req.body.message || req.body.channel_post;
  if (!message || !message.text) return res.status(200).send('OK');

  const chatId = message.chat.id;
  const messageId = message.message_id;
  const text = message.text;

  const WHITELIST_IDS = [1001977073229, 1922419923, 6990025961, 96431648, -1001678007720, 5443017337, 8097212518, 6604010059, 7452439235, 8108599040, 6491888510, 7738331590, -1002103959267, -1002080075722, -1002425222777];
  const userId = message.from ? message.from.id : null;
  const isExempt = WHITELIST_IDS.includes(userId) || req.body.channel_post;
  const isGroup = message.chat.type !== 'private';

  // --- ۱. نصب دکمه‌ی ثابت در قسمت تایپ (با دستور /start) ---
  if (text === "/start") {
    if (isGroup) await tgApi('deleteMessage', { chat_id: chatId, message_id: messageId });
    await tgApi('sendMessage', {
      chat_id: chatId,
      text: "👋 دکمه‌ی دسترسی سریع به منو، به قسمت پایین (بخش تایپ) اضافه شد. 👇",
      reply_markup: {
        keyboard: [[{ text: "📋 منوی اصلی" }]], // این دکمه همیشه پایین می‌ماند
        resize_keyboard: true // برای اینکه دکمه اندازه مناسبی داشته باشد
      }
    });
    return res.status(200).send('OK');
  }

  // --- ۲. احضار منوی شیشه‌ای ---
  if (text === "/menu" || text === "منو" || text === "📋 منوی اصلی") {
    if (isGroup) await tgApi('deleteMessage', { chat_id: chatId, message_id: messageId });

    await tgApi('sendMessage', {
      chat_id: chatId,
      text: "📌 **منوی اصلی مجموعه‌ها**\nلطفاً یکی از گزینه‌های زیر را انتخاب کنید:",
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "📢 کانال های ما", callback_data: "menu_channels" }],
          [{ text: "👥 گروه های ما", callback_data: "menu_groups" }],
          [{ text: "📞 گروه های ارتباط", callback_data: "menu_contact" }],
          [{ text: "📜 قوانین", callback_data: "menu_rules" }]
        ]
      }
    });
    return res.status(200).send('OK');
  }

  // --- ۳. سیستم امنیت ---
  if (!isExempt && isGroup) {
    const KV_URL = process.env.KV_REST_API_URL;
    const KV_TOKEN = process.env.KV_REST_API_TOKEN;
    
    // ضد تکرار
    if (KV_URL && KV_TOKEN && text.length > 15) {
        const uniqueKey = "text_" + text.substring(0, 50).replace(/\s/g, '');
        const checkRes = await fetch(`${KV_URL}/get/${encodeURIComponent(uniqueKey)}`, {
          headers: { Authorization: `Bearer ${KV_TOKEN}` }
        });
        const checkData = await checkRes.json();
        
        if (checkData.result !== null) {
          await tgApi('deleteMessage', { chat_id: chatId, message_id: messageId });
          return res.status(200).send('OK');
        } else {
          await fetch(`${KV_URL}/set/${encodeURIComponent(uniqueKey)}/1/EX/86400`, {
            headers: { Authorization: `Bearer ${KV_TOKEN}` }
          });
        }
    }

    // فیلتر کلمات و لینک
    const badWordsRaw = ["چاکش", "گوه نخور", "کونی", "شاشزاده", "کون", "کص", "سس خرسی", "تام مورلی", "کسکش", "کوسکش", "کوصکش", "کصکش", "کیر", "کوس"];
    const hasBadWord = badWordsRaw.some(w => text.includes(w));
    const linkRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-zA-Z0-9-]+\.[a-zA-Z]{2,})|(@[a-zA-Z0-9_]+)/i;

    if (hasBadWord || linkRegex.test(text)) {
      await tgApi('deleteMessage', { chat_id: chatId, message_id: messageId });
      return res.status(200).send('OK');
    }
  }

  res.status(200).send('OK');
}
