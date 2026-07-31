export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('ربات روی Vercel اجرا می‌شود!');
  
  const body = req.body;
  const message = body.message || body.channel_post;
  const callbackQuery = body.callback_query;

  const BOT_TOKEN = process.env.BOT_TOKEN;

  const tgApi = async (method, params) => {
    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    return r.json();
  };

  // ----------------------------------------------------
  // دکمه‌های شیشه‌ای منو اصلی
  // ----------------------------------------------------
  const mainMenu = {
    inline_keyboard: [
      [
        { text: '📢 کانال‌های ما', callback_data: 'channels' },
        { text: '👥 گروه‌های ما', callback_data: 'groups' }
      ],
      [
        { text: '💬 گروه‌های ارتباط', callback_data: 'contact_groups' }
      ],
      [
        { text: '📜 قوانین گروه', callback_data: 'rules' }
      ]
    ]
  };

  // ----------------------------------------------------
  // دکمه‌های کانال‌ها
  // ----------------------------------------------------
  const channelsMenu = {
    inline_keyboard: [
      [{ text: '🖼 عکس و استیکر اندیشه پهلویسم', url: 'https://t.me/pic_gifpahlavi' }],
      [{ text: '💡 اندیشه پهلویسم', url: 'https://t.me/andishepahlavism' }],
      [{ text: '🔻 فروپاشی', url: 'https://t.me/froopashee2' }],
      [{ text: '📖 الفبای سیاست', url: 'https://t.me/Allephba' }],
      [{ text: '🔙 بازگشت', callback_data: 'back_main' }]
    ]
  };

  // ----------------------------------------------------
  // دکمه‌های گروه‌ها
  // ----------------------------------------------------
  const groupsMenu = {
    inline_keyboard: [
      [{ text: '💬 گفتگوی اندیشه پهلویسم', url: 'https://t.me/goftemanazadAp' }],
      [{ text: '💬 گفتگوی فروپاشی', url: 'https://t.me/+6nIM1oBqTaVjNzYy' }],
      [{ text: '💬 تلنگر', url: 'https://t.me/+Vad19Bh1UAxmYTYy' }],
      [{ text: '💬 گپ شبانه', url: 'https://t.me/+j9Xnb05ntcVmM2Ni' }],
      [{ text: '🖼 گروه عکس و استیکر اندیشه پهلویسم', url: 'https://t.me/pic_gifpahlavi_r' }],
      [{ text: '🔙 بازگشت', callback_data: 'back_main' }]
    ]
  };

  // ----------------------------------------------------
  // دکمه‌های گروه‌های ارتباط
  // ----------------------------------------------------
  const contactGroupsMenu = {
    inline_keyboard: [
      [{ text: '📩 گروه ارتباط اندیشه پهلویسم', url: 'https://t.me/+aaJQcUU7ZIMyZWQ8' }],
      [{ text: '📩 گروه ارتباط فروپاشی', url: 'https://t.me/+GZOW85iRkX45ODJi' }],
      [{ text: '🔙 بازگشت', callback_data: 'back_main' }]
    ]
  };

  // ----------------------------------------------------
  // هندل کردن Callback Query (وقتی روی دکمه می‌زنند)
  // ----------------------------------------------------
  if (callbackQuery) {
    const callbackChatId = callbackQuery.message.chat.id;
    const callbackMessageId = callbackQuery.message.message_id;
    const data = callbackQuery.data;

    if (data === 'channels') {
      await tgApi('editMessageText', {
        chat_id: callbackChatId,
        message_id: callbackMessageId,
        text: '📢 *کانال‌های ما*\nیکی از کانال‌ها را انتخاب کنید:',
        parse_mode: 'Markdown',
        reply_markup: channelsMenu
      });
    }

    else if (data === 'groups') {
      await tgApi('editMessageText', {
        chat_id: callbackChatId,
        message_id: callbackMessageId,
        text: '👥 *گروه‌های ما*\nیکی از گروه‌ها را انتخاب کنید:',
        parse_mode: 'Markdown',
        reply_markup: groupsMenu
      });
    }

    else if (data === 'contact_groups') {
      await tgApi('editMessageText', {
        chat_id: callbackChatId,
        message_id: callbackMessageId,
        text: '💬 *گروه‌های ارتباط*\nبرای ارتباط با ما به یکی از گروه‌های زیر بپیوندید:',
        parse_mode: 'Markdown',
        reply_markup: contactGroupsMenu
      });
    }

    else if (data === 'rules') {
      await tgApi('editMessageText', {
        chat_id: callbackChatId,
        message_id: callbackMessageId,
        text: '📜 *قوانین گروه*\n\n1️⃣ توهین و بی‌احترامی ممنوع\n2️⃣ ارسال لینک و تبلیغات ممنوع\n3️⃣ لطفاً فقط در چارچوب موضوع گروه چت کنید.',
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 بازگشت', callback_data: 'back_main' }]
          ]
        }
      });
    }

    else if (data === 'back_main') {
      await tgApi('editMessageText', {
        chat_id: callbackChatId,
        message_id: callbackMessageId,
        text: '🌟 *منوی اصلی*\nیکی از گزینه‌های زیر را انتخاب کنید:',
        parse_mode: 'Markdown',
        reply_markup: mainMenu
      });
    }

    await tgApi('answerCallbackQuery', { callback_query_id: callbackQuery.id });
    return res.status(200).send('OK');
  }

  if (!message) return res.status(200).send('OK');

  const chatId = message.chat.id;
  const messageId = message.message_id;

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

  const sendAutoDeleteMessage = async (chatId, text, seconds = 5) => {
    const sent = await tgApi('sendMessage', { chat_id: chatId, text: text });
    if (sent && sent.result) {
      const warningMessageId = sent.result.message_id;
      await new Promise(resolve => setTimeout(resolve, seconds * 1000));
      await tgApi('deleteMessage', { chat_id: chatId, message_id: warningMessageId });
    }
  };

  const KV_URL = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;

  // ----------------------------------------------------
  // بخش 1: دستور /start و /menu
  // ----------------------------------------------------
  if (message.text === '/start' || message.text === '/menu') {
    await tgApi('sendMessage', {
      chat_id: chatId,
      text: '🌟 *به ربات ما خوش آمدید!*\nیکی از گزینه‌های زیر را انتخاب کنید:',
      parse_mode: 'Markdown',
      reply_markup: mainMenu
    });
    return res.status(200).send('OK');
  }

  // ----------------------------------------------------
  // بخش 2: فیلتر کلمات ممنوعه و لینک
  // ----------------------------------------------------
  if (message.text && !isAdmin) {
    const text = message.text;

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
  // بخش 3: فیلتر کپشن عکس و ویدیو
  // ----------------------------------------------------
  if (message.caption && !isAdmin) {
    const caption = message.caption;
    const badWords = [
      "گوه نخور", "جاکش", "کونی",
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
  // بخش 4: سیستم ضد تکرار
  // ----------------------------------------------------
  if (KV_URL && KV_TOKEN && !isAdmin) {
    let uniqueKey = null;

    if (message.text && message.text.length > 10) {
      uniqueKey = "text_" + message.text.substring(0, 50).replace(/\s/g, '');
    } else if (message.photo) {
      uniqueKey = "media_" + message.photo[message.photo.length - 1].file_unique_id;
    } else if (message.video) {
      uniqueKey = "media_" + message.video.file_unique_id;
    } else if (message.document) {
      uniqueKey = "media_" + message.document.file_unique_id;
    }

    if (uniqueKey) {
      const checkRes = await fetch(`${KV_URL}/get/${encodeURIComponent(uniqueKey)}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
      });
      const checkData = await checkRes.json();

      if (checkData.result !== null) {
        await tgApi('deleteMessage', { chat_id: chatId, message_id: messageId });
        await sendAutoDeleteMessage(chatId, '♻️ این پیام قبلاً ارسال شده و تکراری است.');
        return res.status(200).send('OK');
      } else {
        await fetch(`${KV_URL}/set/${encodeURIComponent(uniqueKey)}/1/EX/86400`, {
          headers: { Authorization: `Bearer ${KV_TOKEN}` }
        });
      }
    }
  }

  // ----------------------------------------------------
  // بخش 5: جواب به سلام و قوانین
  // ----------------------------------------------------
  if (message.text) {
    const text = message.text.trim();

    if (["سلام", "درود", "سلام!", "درود!"].includes(text)) {
      await tgApi('sendMessage', {
        chat_id: chatId,
        text: "درود بر شما! به گروه ما خوش آمدید. 🌹\nبرای مشاهده منو /menu را بزنید."
      });
      return res.status(200).send('OK');
    }

    if (text.includes("قوانین")) {
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
