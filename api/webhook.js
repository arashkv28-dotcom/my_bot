export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('ربات روی Vercel اجرا می‌شود!');
  
  const body = req.body;
  const message = body.message || body.channel_post;
  const callbackQuery = body.callback_query;

  const BOT_TOKEN = process.env.BOT_TOKEN;
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const KV_URL = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;

  const tgApi = async (method, params) => {
    try {
      const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      return r.json();
    } catch (e) {
      console.error('tgApi error:', e.message);
      return null;
    }
  };

  const sendAutoDeleteMessage = async (chatId, text, seconds = 5) => {
    try {
      const sent = await tgApi('sendMessage', { chat_id: chatId, text });
      if (sent && sent.result) {
        await new Promise(resolve => setTimeout(resolve, seconds * 1000));
        await tgApi('deleteMessage', { chat_id: chatId, message_id: sent.result.message_id });
      }
    } catch (e) {}
  };

  const mainMenu = {
    inline_keyboard: [
      [
        { text: '📢 کانال‌های ما', callback_data: 'channels' },
        { text: '👥 گروه‌های ما', callback_data: 'groups' }
      ],
      [{ text: '💬 گروه‌های ارتباط', callback_data: 'contact_groups' }],
      [{ text: '📜 قوانین گروه', callback_data: 'rules' }]
    ]
  };

  const channelsMenu = {
    inline_keyboard: [
      [{ text: '🖼 عکس و استیکر اندیشه پهلویسم', url: 'https://t.me/pic_gifpahlavi' }],
      [{ text: '💡 اندیشه پهلویسم', url: 'https://t.me/andishepahlavism' }],
      [{ text: '🔻 فروپاشی', url: 'https://t.me/froopashee2' }],
      [{ text: '📖 الفبای سیاست', url: 'https://t.me/Allephba' }],
      [{ text: '🔙 بازگشت', callback_data: 'back_main' }]
    ]
  };

  const groupsMenu = {
    inline_keyboard: [
      [{ text: '💬 گفتگوی اندیشه پهلویسم', url: 'https://t.me/goftemanazadAp' }],
      [{ text: '💬 گفتگوی فروپاشی', url: 'https://t.me/+6nIM1oBqTaVjNzYy' }],
      [{ text: '💬 تلنگر', url: 'https://t.me/+Vad19Bh1UAxmYTYy' }],
      [{ text: '💬 گپ شبانه', url: 'https://t.me/+j9Xnb05ntcVmM2Ni' }],
      [{ text: '🖼 عکس و استیکر اندیشه پهلویسم', url: 'https://t.me/pic_gifpahlavi_r' }],
      [{ text: '🔙 بازگشت', callback_data: 'back_main' }]
    ]
  };

  const contactGroupsMenu = {
    inline_keyboard: [
      [{ text: '📩 ارتباط اندیشه پهلویسم', url: 'https://t.me/+aaJQcUU7ZIMyZWQ8' }],
      [{ text: '📩 ارتباط فروپاشی', url: 'https://t.me/+GZOW85iRkX45ODJi' }],
      [{ text: '🔙 بازگشت', callback_data: 'back_main' }]
    ]
  };

  // ----------------------------------------------------
  // هندل کردن Callback Query
  // ----------------------------------------------------
  if (callbackQuery) {
    const cbChatId = callbackQuery.message.chat.id;
    const cbMsgId = callbackQuery.message.message_id;
    const data = callbackQuery.data;

    const editMsg = async (text, keyboard) => {
      await tgApi('editMessageText', {
        chat_id: cbChatId,
        message_id: cbMsgId,
        text,
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
    };

    if (data === 'channels') {
      await editMsg('📢 *کانال‌های ما*\nیکی از کانال‌ها را انتخاب کنید:', channelsMenu);
    } else if (data === 'groups') {
      await editMsg('👥 *گروه‌های ما*\nیکی از گروه‌ها را انتخاب کنید:', groupsMenu);
    } else if (data === 'contact_groups') {
      await editMsg('💬 *گروه‌های ارتباط*\nبرای ارتباط با ما:', contactGroupsMenu);
    } else if (data === 'rules') {
      await editMsg(
        '📜 *قوانین گروه*\n\n1️⃣ توهین و بی‌احترامی ممنوع\n2️⃣ ارسال لینک و تبلیغات ممنوع\n3️⃣ لطفاً فقط در چارچوب موضوع گروه چت کنید.',
        { inline_keyboard: [[{ text: '🔙 بازگشت', callback_data: 'back_main' }]] }
      );
    } else if (data === 'back_main') {
      await editMsg('🌟 *منوی اصلی*\nیکی از گزینه‌های زیر را انتخاب کنید:', mainMenu);
    }

    await tgApi('answerCallbackQuery', { callback_query_id: callbackQuery.id });
    return res.status(200).send('OK');
  }

  if (!message) return res.status(200).send('OK');

  const chatId = message.chat.id;
  const messageId = message.message_id;
  const text = message.text || '';

  const ADMIN_IDS = [
    1001977073229, 1922419923, 6990025961, 96431648,
    -1001678007720, 5443017337, 8097212518, 6604010059,
    7452439235, 8108599040, 6491888510, 7738331590,
    -1002103959267, -1002080075722, -1002425222777
  ];

  const userId = message.from ? message.from.id : null;
  const senderChatId = message.sender_chat ? message.sender_chat.id : null;
  const isAdmin =
    ADMIN_IDS.includes(userId) ||
    ADMIN_IDS.includes(chatId) ||
    ADMIN_IDS.includes(senderChatId) ||
    Boolean(body.channel_post);

  // ----------------------------------------------------
  // بخش 1: دستورات /start و /menu و /rules
  // ----------------------------------------------------
  if (text === '/start' || text === '/menu') {
    await tgApi('sendMessage', {
      chat_id: chatId,
      text: '🌟 *به ربات ما خوش آمدید!*\nیکی از گزینه‌های زیر را انتخاب کنید:',
      parse_mode: 'Markdown',
      reply_markup: mainMenu
    });
    return res.status(200).send('OK');
  }

  if (text === '/rules') {
    await tgApi('sendMessage', {
      chat_id: chatId,
      text: '📜 *قوانین گروه:*\n\n1️⃣ توهین و بی‌احترامی ممنوع\n2️⃣ ارسال لینک و تبلیغات ممنوع\n3️⃣ لطفاً فقط در چارچوب موضوع گروه چت کنید.',
      parse_mode: 'Markdown'
    });
    return res.status(200).send('OK');
  }

  // ----------------------------------------------------
  // بخش 2: هوش مصنوعی Gemini
  // ----------------------------------------------------
  if (text.startsWith('رباتی')) {
    const userQuestion = text.replace('رباتی', '').trim();

    if (!userQuestion) {
      await tgApi('sendMessage', {
        chat_id: chatId,
        reply_to_message_id: messageId,
        text: '❓ سوال خود را بعد از کلمه "رباتی" بنویسید.\nمثال: رباتی پایتخت ایران کجاست؟'
      });
      return res.status(200).send('OK');
    }

    await tgApi('sendChatAction', { chat_id: chatId, action: 'typing' });

    try {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-001:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: `تو یک دستیار هوشمند فارسی‌زبان هستی. لطفاً به سوال زیر به زبان فارسی و به صورت کوتاه و مفید پاسخ بده:\n\n${userQuestion}`
              }]
            }],
            generationConfig: {
              maxOutputTokens: 500,
              temperature: 0.7
            }
          })
        }
      );

      const geminiData = await geminiRes.json();
      console.log('Gemini response:', JSON.stringify(geminiData));

      if (geminiData.candidates && geminiData.candidates[0] && geminiData.candidates[0].content) {
        const answer = geminiData.candidates[0].content.parts[0].text;
        await tgApi('sendMessage', {
          chat_id: chatId,
          reply_to_message_id: messageId,
          text: `🤖 ${answer}`
        });
      } else if (geminiData.error) {
        console.error('Gemini error:', geminiData.error.message);
        await tgApi('sendMessage', {
          chat_id: chatId,
          reply_to_message_id: messageId,
          text: `❌ خطای گوگل: ${geminiData.error.message}`
        });
      } else {
        console.error('Unexpected response:', JSON.stringify(geminiData));
        await tgApi('sendMessage', {
          chat_id: chatId,
          reply_to_message_id: messageId,
          text: '❌ پاسخی دریافت نشد. دوباره امتحان کنید.'
        });
      }
    } catch (e) {
      console.error('Gemini fetch error:', e.message);
      await tgApi('sendMessage', {
        chat_id: chatId,
        reply_to_message_id: messageId,
        text: `❌ خطا: ${e.message}`
      });
    }

    return res.status(200).send('OK');
  }

  // ----------------------------------------------------
  // بخش 3: فیلتر کلمات ممنوعه و لینک
  // ----------------------------------------------------
  if (text && !isAdmin) {
    const badWords = [
      "احمق", "بیشعور", "کلاهبرداری",
      "شاشزاده", "خرسی", "تام مورلی",
      "کسکش", "کوسکش", "کوصکش", "کصکش",
      "کیر", "کوس", "کص", "کوص", "سس"
    ];
    const hasBadWord = badWords.some(word => text.includes(word));
    const linkPatterns = [
      /https?:\/\/[^\s]+/i,
      /www\.[^\s]+/i,
      /t\.me\/[^\s]+/i,
      /instagram\.com\/[^\s]*/i,
      /instagr\.am\/[^\s]*/i,
      /twitter\.com\/[^\s]*/i,
      /x\.com\/[^\s]*/i,
      /youtube\.com\/[^\s]*/i,
      /youtu\.be\/[^\s]*/i,
      /tiktok\.com\/[^\s]*/i,
      /whatsapp\.com\/[^\s]*/i,
      /wa\.me\/[^\s]*/i,
      /telegra\.ph\/[^\s]*/i,
      /@[a-zA-Z][a-zA-Z0-9_]{4,}/
    ];
    const hasLink = linkPatterns.some(pattern => pattern.test(text));

    if (hasBadWord || hasLink) {
      await tgApi('deleteMessage', { chat_id: chatId, message_id: messageId });
      const reason = hasBadWord ? "استفاده از کلمات ممنوعه" : "ارسال لینک یا آیدی";
      await sendAutoDeleteMessage(chatId, `⚠️ پیام شما به دلیل «${reason}» پاک شد.\nلطفاً قوانین گروه را رعایت کنید.`);
      return res.status(200).send('OK');
    }
  }

  // ----------------------------------------------------
  // بخش 4: فیلتر کپشن
  // ----------------------------------------------------
  if (message.caption && !isAdmin) {
    const caption = message.caption;
    const badWords = [
      "احمق", "بیشعور", "کلاهبرداری",
      "شاشزاده", "خرسی", "تام مورلی",
      "کسکش", "کوسکش", "کوصکش", "کصکش",
      "کیر", "کوس", "کص", "کوص", "سس"
    ];
    const hasBadWord = badWords.some(word => caption.includes(word));
    const linkPatterns = [
      /https?:\/\/[^\s]+/i,
      /www\.[^\s]+/i,
      /t\.me\/[^\s]+/i,
      /instagram\.com\/[^\s]*/i,
      /twitter\.com\/[^\s]*/i,
      /x\.com\/[^\s]*/i,
      /youtube\.com\/[^\s]*/i,
      /youtu\.be\/[^\s]*/i,
      /tiktok\.com\/[^\s]*/i,
      /@[a-zA-Z][a-zA-Z0-9_]{4,}/
    ];
    const hasLink = linkPatterns.some(pattern => pattern.test(caption));

    if (hasBadWord || hasLink) {
      await tgApi('deleteMessage', { chat_id: chatId, message_id: messageId });
      const reason = hasBadWord ? "استفاده از کلمات ممنوعه" : "ارسال لینک یا آیدی در کپشن";
      await sendAutoDeleteMessage(chatId, `⚠️ پیام شما به دلیل «${reason}» پاک شد.\nلطفاً قوانین گروه را رعایت کنید.`);
      return res.status(200).send('OK');
    }
  }

  // ----------------------------------------------------
  // بخش 5: سیستم ضد تکرار
  // ----------------------------------------------------
  if (KV_URL && KV_TOKEN && !isAdmin) {
    try {
      let uniqueKey = null;

      if (text && text.length > 10) {
        // تبدیل متن به base64 برای جلوگیری از خطای URI
        const safeKey = btoa(unescape(encodeURIComponent(text.substring(0, 30)))).replace(/[^a-zA-Z0-9]/g, '');
        uniqueKey = "text_" + safeKey;
      } else if (message.photo) {
        uniqueKey = "photo_" + message.photo[message.photo.length - 1].file_unique_id;
      } else if (message.video) {
        uniqueKey = "video_" + message.video.file_unique_id;
      } else if (message.document) {
        uniqueKey = "doc_" + message.document.file_unique_id;
      }

      if (uniqueKey) {
        const checkRes = await fetch(`${KV_URL}/get/${uniqueKey}`, {
          headers: { Authorization: `Bearer ${KV_TOKEN}` }
        });
        const checkData = await checkRes.json();

        if (checkData.result !== null) {
          await tgApi('deleteMessage', { chat_id: chatId, message_id: messageId });
          await sendAutoDeleteMessage(chatId, '♻️ این پیام قبلاً ارسال شده و تکراری است.');
          return res.status(200).send('OK');
        } else {
          await fetch(`${KV_URL}/set/${uniqueKey}/1/EX/86400`, {
            headers: { Authorization: `Bearer ${KV_TOKEN}` }
          });
        }
      }
    } catch (e) {
      console.error('KV error:', e.message);
    }
  }

  // ----------------------------------------------------
  // بخش 6: جواب به سلام و قوانین
  // ----------------------------------------------------
  if (text) {
    const trimmed = text.trim();

    if (["سلام", "درود", "سلام!", "درود!"].includes(trimmed)) {
      await tgApi('sendMessage', {
        chat_id: chatId,
        text: "درود بر شما! به گروه ما خوش آمدید. 🌹\nبرای مشاهده منو /menu را بزنید."
      });
      return res.status(200).send('OK');
    }

    if (trimmed.includes("قوانین")) {
      await tgApi('sendMessage', {
        chat_id: chatId,
        text: "📜 *قوانین گروه:*\n\n1️⃣ توهین و بی‌احترامی ممنوع\n2️⃣ ارسال لینک و تبلیغات ممنوع\n3️⃣ لطفاً فقط در چارچوب موضوع گروه چت کنید.",
        parse_mode: 'Markdown'
      });
      return res.status(200).send('OK');
    }
  }

  res.status(200).send('OK');
}
