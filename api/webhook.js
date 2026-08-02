export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('Bot is running on Vercel!');
  if (!req.body) return res.status(200).send('OK');
  
  const BOT_TOKEN = process.env.BOT_TOKEN;

  const FAQ_ANSWERS = {
    faq_1: "🔹 *مجموعه شما چیست؟*\n\n*ما مجموعه‌ای شامل چند کانال و گروه هستیم که حول محور اندیشه پهلویسم، مسائل روز، اخبار، و مباحث مرتبط سیاسی فعالیت می‌کنند. از طریق منوی اصلی می‌تونید به همه‌ی کانال‌ها و گروه‌های ما دسترسی داشته باشید.*",
    faq_2: "🔹 *کانال‌ها کدام‌اند؟*\n\n*برای دیدن لیست کامل کانال‌های ما به بخش «📢 کانال های ما» در منوی اصلی مراجعه کنید.*",
    faq_3: "🔹 *گروه‌ها کدام‌اند؟*\n\n*برای دیدن لیست کامل گروه‌های ما به بخش «👥 گروه های ما» در منوی اصلی مراجعه کنید.*",
    faq_4: "🔹 *چطور ارتباط بگیرم؟*\n\n*می‌تونید از بخش «📞 گروه های ارتباط» در منوی اصلی استفاده کنید، یا از همین قسمت گزینه‌ی «📩 ارتباط با ما» رو انتخاب کنید.*",
    faq_5: "🔹 *قوانین چیست؟*\n\n*۱. استفاده از کلمات رکیک و توهین ممنوع است.\n۲. ارسال هرگونه لینک و تبلیغات اکیداً ممنوع است.\n۳. سیستم به صورت خودکار پیام‌های تکراری و لینک‌ها را حذف می‌کند.\n۴. لطفاً نظم گروه را رعایت کنید.*"
  };

  const tgApi = async (method, body) => {
    try {
      return await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    } catch (e) { return null; }
  };

  // تابع ارسال پیام موقت (بعد از 5 ثانیه خودکار پاک می‌شود)
  const sendTempMessage = async (chatId, text) => {
    const res = await tgApi('sendMessage', { chat_id: chatId, text });
    const data = await res.json();
    if (data.ok) {
      const tempMsgId = data.result.message_id;
      await new Promise(r => setTimeout(r, 5000)); // 5 ثانیه صبر
      await tgApi('deleteMessage', { chat_id: chatId, message_id: tempMsgId });
    }
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
      newText = "📌 *منوی اصلی مجموعه‌ها*\nلطفاً یکی از گزینه‌های زیر را انتخاب کنید:";
      newMarkup = {
        inline_keyboard: [
          [{ text: "📢 کانال های ما", callback_data: "menu_channels" }],
          [{ text: "👥 گروه های ما", callback_data: "menu_groups" }],
          [{ text: "📞 گروه های ارتباط", callback_data: "menu_contact" }],
          [{ text: "📜 قوانین", callback_data: "menu_rules" }],
          [{ text: "💬 گفت‌وگو با ربات", callback_data: "menu_chat" }]
        ]
      };
    }
    else if (data === "menu_channels") {
      newText = "📢 *لیست کانال‌های ما:*";
      newMarkup = {
        inline_keyboard: [
          [{ text: "آرشیو جاویدنامان دیماه", url: "https://t.me/javidnam10_1404" }],
          [{ text: "عکس و استیکر اندیشه پهلویسم", url: "https://t.me/pic_gifpahlavi" }],
          [{ text: "اندیشه پهلویسم", url: "https://t.me/andishepahlavism" }],
          [{ text: "فروپاشی", url: "https://t.me/froopashee2" }],
          [{ text: "الفبای سیاست", url: "https://t.me/Allephba" }],
          [{ text: "🔙 بازگشت", callback_data: "main_menu" }]
        ]
      };
    }
    else if (data === "menu_groups") {
      newText = "👥 *لیست گروه‌های ما:*";
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
      newText = "📞 *گروه‌های ارتباط:*";
      newMarkup = {
        inline_keyboard: [
          [{ text: "ارتباط اندیشه پهلویسم", url: "https://t.me/+aaJQcUU7ZIMyZWQ8" }],
          [{ text: "ارتباط فرو پاشی", url: "https://t.me/+GZOW85iRkX45ODJi" }],
          [{ text: "🔙 بازگشت", callback_data: "main_menu" }]
        ]
      };
    }
    else if (data === "menu_rules") {
      newText = "📜 *قوانین و مقررات:*\n\n*۱. استفاده از کلمات رکیک و توهین ممنوع است.\n۲. ارسال هرگونه لینک و تبلیغات اکیداً ممنوع است.\n۳. سیستم به صورت خودکار پیام‌های تکراری و لینک‌ها را حذف می‌کند.\n۴. لطفاً نظم گروه را رعایت کنید.*";
      newMarkup = { inline_keyboard: [[{ text: "🔙 بازگشت", callback_data: "main_menu" }]] };
    }
    else if (data === "menu_chat") {
      newText = "💬 *گفت‌وگو با ربات*\nچطور می‌تونم کمکتون کنم؟";
      newMarkup = {
        inline_keyboard: [
          [{ text: "❓ سوالات متداول", callback_data: "menu_faq" }],
          [{ text: "📩 ارتباط با ما", callback_data: "menu_contactus" }],
          [{ text: "🔙 بازگشت", callback_data: "main_menu" }]
        ]
      };
    }
    else if (data === "menu_faq") {
      newText = "❓ *سوالات متداول*\nیکی از سوالات زیر رو انتخاب کنید:";
      newMarkup = {
        inline_keyboard: [
          [{ text: "مجموعه شما چیست؟", callback_data: "faq_1" }],
          [{ text: "کانال‌ها کدام‌اند؟", callback_data: "faq_2" }],
          [{ text: "گروه‌ها کدام‌اند؟", callback_data: "faq_3" }],
          [{ text: "چطور ارتباط بگیرم؟", callback_data: "faq_4" }],
          [{ text: "قوانین چیست؟", callback_data: "faq_5" }],
          [{ text: "🔙 بازگشت", callback_data: "menu_chat" }]
        ]
      };
    }
    else if (FAQ_ANSWERS[data]) {
      newText = FAQ_ANSWERS[data];
      newMarkup = { inline_keyboard: [[{ text: "🔙 بازگشت", callback_data: "menu_faq" }]] };
    }
    else if (data === "menu_contactus") {
      newText = "📩 *ارتباط با ما*\n\n*برای ارتباط با ادمین‌ها و مدیریت مجموعه، لطفاً روی یکی از دکمه‌های زیر کلیک کنید و در گروه مربوطه پیام خود را مطرح کنید:*";
      newMarkup = {
        inline_keyboard: [
          [{ text: "ارتباط اندیشه پهلویسم", url: "https://t.me/+aaJQcUU7ZIMyZWQ8" }],
          [{ text: "ارتباط فرو پاشی", url: "https://t.me/+GZOW85iRkX45ODJi" }],
          [{ text: "🔙 بازگشت", callback_data: "menu_chat" }]
        ]
      };
    }

    if (newText !== "") {
      await tgApi('editMessageText', { chat_id: chatId, message_id: messageId, text: newText, parse_mode: "Markdown", reply_markup: newMarkup });
    }
    await tgApi('answerCallbackQuery', { callback_query_id: callbackQuery.id });
    return res.status(200).send('OK');
  }

  // ==========================================
  // 🛡️ بخش دوم: دریافت پیام‌های متنی
  // ==========================================
  const message = req.body.message || req.body.channel_post;
  if (!message) return res.status(200).send('OK');

  const chatId = message.chat.id;
  const messageId = message.message_id;
  const text = message.text || "";

  const WHITELIST_IDS = [
    1001977073229, 1922419923, 6990025961, 96431648,
    -1001678007720, 8934796975, 5443017337, 8097212518, 6604010059,
    7452439235, 8108599040, 6491888510, 7738331590,
    -1002103959267, -1002080075722, -1002425222777,
    1528824508
  ];

  const userId = message.from ? message.from.id : null;
  const senderChatId = message.sender_chat ? message.sender_chat.id : null;

  const isExempt =
    WHITELIST_IDS.includes(userId) ||
    WHITELIST_IDS.includes(senderChatId) ||
    userId === 777000 ||
    message.is_automatic_forward ||
    req.body.channel_post;

  const isGroup = message.chat.type !== 'private';

  // --- منو ---
  if (text === "/start") {
    if (isGroup) await tgApi('deleteMessage', { chat_id: chatId, message_id: messageId });
    await tgApi('sendMessage', { chat_id: chatId, text: "👋 دکمه‌ی دسترسی سریع به منو اضافه شد. 👇", reply_markup: { keyboard: [[{ text: "📋 منوی اصلی" }]], resize_keyboard: true } });
    return res.status(200).send('OK');
  }

  if (text === "/menu" || text === "منو" || text === "📋 منوی اصلی") {
    if (isGroup) await tgApi('deleteMessage', { chat_id: chatId, message_id: messageId });
    await tgApi('sendMessage', {
      chat_id: chatId, text: "📌 *منوی اصلی مجموعه‌ها*\nلطفاً یکی از گزینه‌های زیر را انتخاب کنید:", parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "📢 کانال های ما", callback_data: "menu_channels" }],
          [{ text: "👥 گروه های ما", callback_data: "menu_groups" }],
          [{ text: "📞 گروه های ارتباط", callback_data: "menu_contact" }],
          [{ text: "📜 قوانین", callback_data: "menu_rules" }],
          [{ text: "💬 گفت‌وگو با ربات", callback_data: "menu_chat" }]
        ]
      }
    });
    return res.status(200).send('OK');
  }

  // ==========================================
  // 🚨 بخش سوم: سیستم امنیتی پیشرفته
  // ==========================================
  if (!isExempt && isGroup) {
    const KV_URL = process.env.KV_REST_API_URL;
    const KV_TOKEN = process.env.KV_REST_API_TOKEN;

    // --- ۱. سیستم ضد اسپم (Anti-Flood) ---
    // اگر کاربر در 60 ثانیه بیشتر از 5 پیام فرستاد، اخراج می‌شود
    if (KV_URL && KV_TOKEN && userId) {
      try {
        const floodKey = `flood_${chatId}_${userId}`;
        const floodRes = await fetch(`${KV_URL}/get/${floodKey}`, { headers: { Authorization: `Bearer ${KV_TOKEN}` } });
        const floodData = await floodRes.json();
        const msgCount = floodData.result ? parseInt(floodData.result) + 1 : 1;

        if (msgCount >= 5) {
          // اخراج کاربر
          await tgApi('banChatMember', { chat_id: chatId, user_id: userId, until_date: Math.floor(Date.now() / 1000) + 60 });
          await tgApi('deleteMessage', { chat_id: chatId, message_id: messageId });
          // پیام اخطار موقت (5 ثانیه)
          await sendTempMessage(chatId, `🚨 کاربر به دلیل ارسال پیام بیش از حد (اسپم) به مدت ۱ دقیقه محدود شد.`);
          // ریست کردن شمارنده
          await fetch(`${KV_URL}/del/${floodKey}`, { headers: { Authorization: `Bearer ${KV_TOKEN}` } });
          return res.status(200).send('OK');
        } else {
          // اضافه کردن به شمارنده (با انقضای 60 ثانیه)
          await fetch(`${KV_URL}/set/${floodKey}/${msgCount}/EX/60`, { headers: { Authorization: `Bearer ${KV_TOKEN}` } });
        }
      } catch (e) { }
    }

    // --- ۲. بررسی کلمات ممنوعه و لینک ---
    if (text) {
      const badWordsRaw = ["جاکش", "گوه نخور", "کونی", "شاشزاده", "کون", "کص", "سس خرسی", "تام مورلی", "کسکش", "کوسکش", "کوصکش", "کصکش", "کیر", "کوس"];
      const hasBadWord = badWordsRaw.some(w => text.includes(w));
      const linkRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-zA-Z0-9-]+\.[a-zA-Z]{2,})|(@[a-zA-Z0-9_]+)/i;

      if (hasBadWord || linkRegex.test(text)) {
        await tgApi('deleteMessage', { chat_id: chatId, message_id: messageId });
        return res.status(200).send('OK');
      }
    }

    // --- ۳. سیستم ضد تکرار (متن، عکس، ویدیو، فایل) ---
    if (KV_URL && KV_TOKEN) {
      let uniqueKey = null;

      if (text && text.length > 15) {
        uniqueKey = "dup_text_" + text.substring(0, 50).replace(/\s/g, '');
      } else if (message.photo) {
        uniqueKey = "dup_" + message.photo[message.photo.length - 1].file_unique_id;
      } else if (message.video) {
        uniqueKey = "dup_" + message.video.file_unique_id;
      } else if (message.document) {
        uniqueKey = "dup_" + message.document.file_unique_id;
      } else if (message.sticker) {
        uniqueKey = "dup_" + message.sticker.file_unique_id;
      }

      if (uniqueKey) {
        try {
          const checkRes = await fetch(`${KV_URL}/get/${encodeURIComponent(uniqueKey)}`, { headers: { Authorization: `Bearer ${KV_TOKEN}` } });
          const checkData = await checkRes.json();

          if (checkData.result !== null) {
            // پیام تکراری است - پاک کن
            await tgApi('deleteMessage', { chat_id: chatId, message_id: messageId });
            return res.status(200).send('OK');
          } else {
            // جدید است - ثبت کن (24 ساعت)
            await fetch(`${KV_URL}/set/${encodeURIComponent(uniqueKey)}/1/EX/86400`, { headers: { Authorization: `Bearer ${KV_TOKEN}` } });
          }
        } catch (e) { }
      }
    }
  }

  res.status(200).send('OK');
}
