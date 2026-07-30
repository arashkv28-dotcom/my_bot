export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('Bot is running on Vercel!');
  
  const BOT_TOKEN = process.env.BOT_TOKEN;
  
  // تابع ارسال درخواست به تلگرام
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
    const data = callbackQuery.data; // داده‌ای که دکمه می‌فرستد

    let newText = "";
    let newMarkup = {};

    // 1. منوی اصلی
    if (data === "main_menu") {
      newText = "📌 **منوی اصلی مجموعه‌ها**\nلطفاً یکی از دسته‌بندی‌های زیر را انتخاب کنید:";
      newMarkup = {
        inline_keyboard: [
          [{ text: "📢 کانال های ما", callback_data: "menu_channels" }],
          [{ text: "👥 گروه های ما", callback_data: "menu_groups" }],
          [{ text: "📞 گروه های ارتباط", callback_data: "menu_contact" }]
        ]
      };
    }
    // 2. منوی کانال‌ها
    else if (data === "menu_channels") {
      newText = "📢 **لیست کانال‌های ما:**\nبرای ورود روی دکمه‌های زیر کلیک کنید:";
      newMarkup = {
        inline_keyboard: [
          [{ text: "کانال Pic/Gif Pahlavi", url: "https://t.me/pic_gifpahlavi" }],
          [{ text: "کانال اندیشه پهلویسم", url: "https://t.me/andishepahlavism" }],
          [{ text: "کانال فروپاشی 2", url: "https://t.me/froopashee2" }],
          [{ text: "کانال الفبا", url: "https://t.me/Allephba" }],
          [{ text: "🔙 بازگشت به منوی اصلی", callback_data: "main_menu" }]
        ]
      };
    }
    // 3. منوی گروه‌ها
    else if (data === "menu_groups") {
      newText = "👥 **لیست گروه‌های ما:**\nبرای ورود روی دکمه‌های زیر کلیک کنید:";
      newMarkup = {
        inline_keyboard: [
          [{ text: "گروه گفتمان آزاد", url: "https://t.me/goftemanazadAp" }],
          [{ text: "گروه شماره ۲", url: "https://t.me/+6nIM1oBqTaVjNzYy" }],
          [{ text: "گروه شماره ۳", url: "https://t.me/+Vad19Bh1UAxmYTYy" }],
          [{ text: "گروه شماره ۴", url: "https://t.me/+j9Xnb05ntcVmM2Ni" }],
          [{ text: "گروه Pic/Gif Pahlavi", url: "https://t.me/pic_gifpahlavi_r" }],
          [{ text: "🔙 بازگشت به منوی اصلی", callback_data: "main_menu" }]
        ]
      };
    }
    // 4. منوی ارتباط
    else if (data === "menu_contact") {
      newText = "📞 **گروه‌های ارتباط با ما:**\nبرای ورود روی دکمه‌های زیر کلیک کنید:";
      newMarkup = {
        inline_keyboard: [
          [{ text: "گروه ارتباط ۱", url: "https://t.me/+aaJQcUU7ZIMyZWQ8" }],
          [{ text: "گروه ارتباط ۲", url: "https://t.me/+GZOW85iRkX45ODJi" }],
          [{ text: "🔙 بازگشت به منوی اصلی", callback_data: "main_menu" }]
        ]
      };
    }

    // ویرایش پیام قبلی با دکمه‌ها و متن جدید
    if (newText !== "") {
      await tgApi('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text: newText,
        parse_mode: "Markdown",
        reply_markup: newMarkup
      });
    }

    // بستن حالت لودینگ (چرخیدن) دکمه تلگرام
    await tgApi('answerCallbackQuery', { callback_query_id: callbackQuery.id });
    
    return res.status(200).send('OK');
  }

  // ==========================================
  // 🛡️ بخش دوم: مدیریت پیام‌های متنی (امنیت)
  // ==========================================
  const message = req.body.message || req.body.channel_post;
  if (!message || !message.text) return res.status(200).send('OK');

  const chatId = message.chat.id;
  const messageId = message.message_id;
  const text = message.text;

  // لیست سفید ادمین‌ها
  const WHITELIST_IDS = [1001977073229, 1922419923, 6990025961, 96431648, -1001678007720, 5443017337, 8097212518, 6604010059, 7452439235, 8108599040, 6491888510, 7738331590, -1002103959267, -1002080075722, -1002425222777];
  const userId = message.from ? message.from.id : null;
  const isExempt = WHITELIST_IDS.includes(userId) || req.body.channel_post;
  const isGroup = message.chat.type !== 'private';

  // --- احضار منوی شیشه‌ای با دستور ---
  if (text === "/start" || text === "/menu" || text === "منو") {
    // پاک کردن کلمه /menu که کاربر فرستاده (برای تمیزی گروه)
    if (isGroup) await tgApi('deleteMessage', { chat_id: chatId, message_id: messageId });

    await tgApi('sendMessage', {
      chat_id: chatId,
      text: "📌 **منوی اصلی مجموعه‌ها**\nلطفاً یکی از دسته‌بندی‌های زیر را انتخاب کنید:",
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "📢 کانال های ما", callback_data: "menu_channels" }],
          [{ text: "👥 گروه های ما", callback_data: "menu_groups" }],
          [{ text: "📞 گروه های ارتباط", callback_data: "menu_contact" }]
        ]
      }
    });
    return res.status(200).send('OK');
  }

  // --- سیستم امنیت (فقط برای کاربران عادی) ---
  if (!isExempt && isGroup) {
    const KV_URL = process.env.KV_REST_API_URL;
    const KV_TOKEN = process.env.KV_REST_API_TOKEN;
    
    // ۱. سیستم ضد تکرار
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

    // ۲. فیلتر کلمات و لینک
    const badWordsRaw = ["جاکش", "گوه نخور", "کونی", "شاشزاده", "کون", "کص", "سس خرسی", "تام مورلی", "کسکش", "کوسکش", "کوصکش", "کصکش", "کیر", "کوس"];
    const hasBadWord = badWordsRaw.some(w => text.includes(w));
    const linkRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-zA-Z0-9-]+\.[a-zA-Z]{2,})|(@[a-zA-Z0-9_]+)/i;

    if (hasBadWord || linkRegex.test(text)) {
      await tgApi('deleteMessage', { chat_id: chatId, message_id: messageId });
      return res.status(200).send('OK');
    }
  }

  res.status(200).send('OK');
}
