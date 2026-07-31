export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('Bot is running on Vercel!');
  
  const BOT_TOKEN = process.env.BOT_TOKEN;
  
  const tgApi = async (method, body) => {
    return await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  };

  // ==========================================
  // 🎛️ بخش اول: دکمه‌های شیشه‌ای
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
          [{ text: "عکس و استیکر اندیشه پهلویسم", url: "https://t.me/pic_gifpahlavi" }],
          [{ text: "اندیشه پهلویسم", url: "https://t.me/andishepahlavism" }],
          [{ text: "فروپاشی", url: "https://t.me/froopashee2" }],
          [{ text: "الفبای سیاست", url: "https://t.me/Allephba" }],
          [{ text: "🔙 بازگشت", callback_data: "main_menu" }]
        ]
      };
    }
    else if (data === "menu_groups") {
      newText = "👥 **لیست گروه‌های ما:**";
      newMarkup = {
        inline_keyboard: [
          [{ text: "گفتگوی اندیشه پهلویسم", url: "https://t.me/goftemanazadAp" }],
          [{ text: "گفتگوی فروپاشی", url: "https://t.me/+6nIM1oBqTaVjNzYy" }],
          [{ text: "تلنگر", url: "https://t.me/+Vad19Bh1UAxmYTYy" }],
          [{ text: "گپ شبانه", url: "https://t.me/+j9Xnb05ntcVmM2Ni" }],
          [{ text: "عکس و استیکر اندیشه پهلویسم", url: "https://t.me/pic_gifpahlavi_r" }],
          [{ text: "🔙 بازگشت", callback_data: "main_menu" }]
        ]
      };
    }
    else if (data === "menu_contact") {
      newText = "📞 **گروه‌های ارتباط:**";
      newMarkup = {
        inline_keyboard: [
          [{ text: "ارتباط اندیشه پهلویسم", url: "https://t.me/+aaJQcUU7ZIMyZWQ8" }],
          [{ text: "ارتباط فرو پاشی", url: "https://t.me/+GZOW85iRkX45ODJi" }],
          [{ text: "🔙 بازگشت", callback_data: "main_menu" }]
        ]
      };
    }
    else if (data === "menu_rules") {
      newText = "📜 **قوانین و مقررات:**\n\n۱. استفاده از کلمات رکیک و توهین ممنوع است.\n۲. ارسال هرگونه لینک و تبلیغات اکیداً ممنوع است.\n۳. سیستم به صورت خودکار پیام‌های تکراری و لینک‌ها را حذف می‌کند.\n۴. لطفاً نظم گروه را رعایت کنید.";
      newMarkup = {
        inline_keyboard: [
          [{ text: "🔙 بازگشت", callback_data: "main_menu" }]
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
  // 🛡️ بخش دوم: دریافت پیام‌های متنی
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

  // --- ۱. احضار منوی شیشه‌ای ---
  if (text === "/start") {
    if (isGroup) await tgApi('deleteMessage', { chat_id: chatId, message_id: messageId });
    await tgApi('sendMessage', {
      chat_id: chatId,
      text: "👋 دکمه‌ی دسترسی سریع به منو، به قسمت پایین اضافه شد. 👇",
      reply_markup: { keyboard: [[{ text: "📋 منوی اصلی" }]], resize_keyboard: true }
    });
    return res.status(200).send('OK');
  }

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

  // --- ۲. سیستم امنیت ---
  if (!isExempt && isGroup) {
    const KV_URL = process.env.KV_REST_API_URL;
    const KV_TOKEN = process.env.KV_REST_API_TOKEN;
    
    if (KV_URL && KV_TOKEN && text.length > 15) {
        const uniqueKey = "text_" + text.substring(0, 50).replace(/\s/g, '');
        const checkRes = await fetch(`${KV_URL}/get/${encodeURIComponent(uniqueKey)}`, { headers: { Authorization: `Bearer ${KV_TOKEN}` } });
        const checkData = await checkRes.json();
        if (checkData.result !== null) {
          await tgApi('deleteMessage', { chat_id: chatId, message_id: messageId });
          return res.status(200).send('OK');
        } else {
          await fetch(`${KV_URL}/set/${encodeURIComponent(uniqueKey)}/1/EX/86400`, { headers: { Authorization: `Bearer ${KV_TOKEN}` } });
        }
    }

    const badWordsRaw = ["گوه نخور", "جنده", "کونی", "شاشزاده", "کون", "کص", "سس خرسی", "تام مورلی", "کسکش", "کوسکش", "کوصکش", "کصکش", "کیر", "کوس"];
    const hasBadWord = badWordsRaw.some(w => text.includes(w));
    const linkRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-zA-Z0-9-]+\.[a-zA-Z]{2,})|(@[a-zA-Z0-9_]+)/i;

    if (hasBadWord || linkRegex.test(text)) {
      await tgApi('deleteMessage', { chat_id: chatId, message_id: messageId });
      return res.status(200).send('OK');
    }
  }

  // ==========================================
  // 🧠 بخش سوم: هوش مصنوعی جمینای (Gemini AI)
  // ==========================================
  if (text.startsWith("رباتی")) {
    const userPrompt = text.replace("رباتی", "").trim();
    
    if (userPrompt.length > 0) {
      let waitRes = await tgApi('sendMessage', { 
        chat_id: chatId, 
        text: "🧠 در حال تفکر...", 
        reply_to_message_id: messageId 
      });
      let waitData = await waitRes.json();
      let waitMsgId = waitData.ok ? waitData.result.message_id : null;

      try {
        const geminiKey = process.env.GEMINI_API_KEY;
        // تغییر ورژن به 1.5-flash (نسخه پایدار و فعلی گوگل)
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;
        
        const aiResponse = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: userPrompt }] }]
          })
        });

        const aiData = await aiResponse.json();
        let finalAnswer = "";

        // بررسی اینکه آیا گوگل ارور داده یا جواب
        if (aiData.error) {
          finalAnswer = `❌ خطای گوگل: ${aiData.error.message}`;
        } else if (aiData.candidates && aiData.candidates.length > 0) {
          finalAnswer = aiData.candidates[0].content.parts[0].text;
          finalAnswer = finalAnswer.replace(/\*\*/g, ""); // پاک کردن بولدهای اضافه
        } else {
          finalAnswer = "متاسفانه گوگل جواب درستی نداد.";
        }

        if (waitMsgId) {
          await tgApi('editMessageText', { chat_id: chatId, message_id: waitMsgId, text: finalAnswer });
        } else {
          await tgApi('sendMessage', { chat_id: chatId, text: finalAnswer, reply_to_message_id: messageId });
        }

      } catch (error) {
        if (waitMsgId) {
          await tgApi('editMessageText', { chat_id: chatId, message_id: waitMsgId, text: "❌ ارتباط با سرور گوگل قطع شد." });
        }
      }
      return res.status(200).send('OK');
    }
  }

  res.status(200).send('OK');
}
