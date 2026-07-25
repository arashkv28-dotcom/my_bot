export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('Bot is running!');
  const message = req.body.message || req.body.channel_post; // پشتیبانی از گروه و کانال
  if (!message) return res.status(200).send('OK');

  const chatId = message.chat.id;
  const messageId = message.message_id;
  const BOT_TOKEN = process.env.BOT_TOKEN; 
  
  // اطلاعات اتصال به دیتابیس (ورسل خودش اینها را می‌سازد)
  const KV_URL = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;

  const tgApi = async (method, body) => {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  };

  // ----------------------------------------------------
  // بخش 1: حذف لینک و کلمات ممنوعه (فقط برای پیام‌های متنی)
  // ----------------------------------------------------
  if (message.text) {
    const text = message.text;
    const badWords = ["احمق", "بیشعور", "کلاهبرداری"]; 
    const hasBadWord = badWords.some(word => text.includes(word));
    const linkRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-zA-Z0-9-]+\.[a-zA-Z]{2,})|(@[a-zA-Z0-9_]+)/i;
    const hasLink = linkRegex.test(text);

    if (hasBadWord || hasLink) {
      await tgApi('deleteMessage', { chat_id: chatId, message_id: messageId });
      let reason = hasLink ? "ارسال لینک/آیدی" : "کلمات ممنوعه";
      await tgApi('sendMessage', { 
        chat_id: chatId, 
        text: `⚠️ پیام به دلیل «${reason}» پاک شد.` 
      });
      return res.status(200).send('OK');
    }
  }

  // ----------------------------------------------------
  // بخش 2: سیستم ضد تکرار (Anti-Duplicate) با دیتابیس
  // ----------------------------------------------------
  if (KV_URL && KV_TOKEN) {
    let uniqueKey = null;

    // تشخیص نوع پیام برای ساخت شناسه یکتا
    if (message.text) {
      // برای متن: 50 حرف اول پیام را به عنوان شناسه در نظر می‌گیریم
      uniqueKey = "text_" + message.text.substring(0, 50).replace(/\s/g, '');
    } else if (message.photo) {
      uniqueKey = "media_" + message.photo[message.photo.length - 1].file_unique_id;
    } else if (message.video) {
      uniqueKey = "media_" + message.video.file_unique_id;
    } else if (message.document) {
      uniqueKey = "media_" + message.document.file_unique_id;
    }

    if (uniqueKey) {
      // 1. آیا این شناسه در دیتابیس هست؟
      const checkRes = await fetch(`${KV_URL}/get/${encodeURIComponent(uniqueKey)}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
      });
      const checkData = await checkRes.json();

      if (checkData.result !== null) {
        // پیام تکراری است! پاکش کن.
        await tgApi('deleteMessage', { chat_id: chatId, message_id: messageId });
        
        // (اختیاری) ارسال اخطار برای پیام تکراری
        // await tgApi('sendMessage', { chat_id: chatId, text: `♻️ پیام تکراری شما پاک شد.` });
        
        return res.status(200).send('OK');
      } else {
        // پیام جدید است. آن را در دیتابیس ذخیره کن.
        // عدد 86400 یعنی پیام بعد از 24 ساعت از حافظه پاک شود (تا دیتابیس پر نشود)
        await fetch(`${KV_URL}/set/${encodeURIComponent(uniqueKey)}/1/EX/86400`, {
          headers: { Authorization: `Bearer ${KV_TOKEN}` }
        });
      }
    }
  }

  res.status(200).send('OK');
                  }
