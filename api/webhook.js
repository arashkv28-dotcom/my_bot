export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('Bot is running!');
  
  const body = req.body;
  const message = body.message || body.channel_post;
  if (!message) return res.status(200).send('OK');

  const chatId = message.chat.id;
  const messageId = message.message_id;
  const BOT_TOKEN = process.env.BOT_TOKEN;

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

  const tgApi = async (method, params) => {
    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    return r.json();
  };

  const KV_URL = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;

  //  // ----------------------------------------------------
  // بخش 1: قابلیت نستعلیق
  // ----------------------------------------------------
  if (message.text && message.text.startsWith('نستعلیق ')) {
    const persianText = message.text.replace('نستعلیق ', '').trim();

    if (persianText.length === 0) {
      await tgApi('sendMessage', {
        chat_id: chatId,
        text: '⚠️ لطفاً بعد از کلمه "نستعلیق" متن خود را بنویسید.\nمثال: نستعلیق سلام دوستان'
      });
      return res.status(200).send('OK');
    }

    try {
      // ساخت عکس از سرور خودمان (بدون API خارجی)
      const encodedText = encodeURIComponent(persianText);
      const imageUrl = `https://my-bot-topaz-seven.vercel.app/api/image?text=${encodedText}`;

      const formData = new FormData();
      formData.append('chat_id', chatId.toString());
      formData.append('caption', `✍️ ${persianText}`);
      formData.append('photo', imageUrl);

      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
        method: 'POST',
        body: formData
      });

    } catch (e) {
      await tgApi('sendMessage', {
        chat_id: chatId,
        text: `✍️ *${persianText}*`,
        parse_mode: 'Markdown'
      });
    }

    return res.status(200).send('OK');
  }
  

  // ----------------------------------------------------
  // بخش 2: فیلتر کلمات ممنوعه و لینک (فقط برای اعضای معمولی)
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
    const linkRegex = /((https?:\/\/)|(www\.))[^\s]+|t\.me\/[^\s]+|@[a-zA-Z][a-zA-Z0-9_]{4,}/i;
    const hasLink = linkRegex.test(text);

    if (hasBadWord || hasLink) {
      await tgApi('deleteMessage', {
        chat_id: chatId,
        message_id: messageId
      });
      const reason = hasBadWord ? "استفاده از کلمات ممنوعه" : "ارسال لینک یا آیدی";
      await tgApi('sendMessage', {
        chat_id: chatId,
        text: `⚠️ کاربر عزیز، پیام شما به دلیل «${reason}» پاک شد.\nلطفاً قوانین گروه را رعایت کنید.`
      });
      return res.status(200).send('OK');
    }
  }

  // ----------------------------------------------------
  // بخش 3: سیستم ضد تکرار
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
        await tgApi('sendMessage', {
          chat_id: chatId,
          text: '♻️ این پیام قبلاً در گروه ارسال شده و تکراری است.'
        });
        return res.status(200).send('OK');
      } else {
        await fetch(`${KV_URL}/set/${encodeURIComponent(uniqueKey)}/1/EX/86400`, {
          headers: { Authorization: `Bearer ${KV_TOKEN}` }
        });
      }
    }
  }

  // ----------------------------------------------------
  // بخش 4: جواب به سلام و قوانین
  // ----------------------------------------------------
  if (message.text) {
    const text = message.text.trim();
    let replyText = "";

    if (["سلام", "درود", "سلام!", "درود!"].includes(text)) {
      replyText = "درود بر شما! به گروه ما خوش آمدید. 🌹";
    } else if (text.includes("قوانین")) {
      replyText = "📜 قوانین گروه:\n1️⃣ توهین و بی‌احترامی ممنوع\n2️⃣ ارسال لینک و تبلیغات ممنوع\n3️⃣ لطفاً فقط در چارچوب موضوع گروه چت کنید.";
    }

    if (replyText) {
      await tgApi('sendMessage', { chat_id: chatId, text: replyText });
    }
  }

  res.status(200).send('OK');
}
