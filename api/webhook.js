export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('Bot is running!');
  const message = req.body.message || req.body.channel_post;
  if (!message) return res.status(200).send('OK');

  const chatId = message.chat.id;
  const messageId = message.message_id;
  const BOT_TOKEN = process.env.BOT_TOKEN; 

  const WHITELIST_IDS = [
    1001977073229, 1922419923, 6990025961, 96431648,  
    -1001678007720, 5443017337, 8097212518, 6604010059, 
    7452439235, 8108599040, 6491888510, 7738331590, 
    -1002103959267, -1002080075722, -1002425222777
  ];

  const userId = message.from ? message.from.id : null;
  const senderChatId = message.sender_chat ? message.sender_chat.id : null;
  const isExempt = WHITELIST_IDS.includes(userId) || WHITELIST_IDS.includes(senderChatId) || req.body.channel_post;

  const tgApi = async (method, body) => {
    return await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  };

  const KV_URL = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;

  // ==========================================
  // بخش 1: بررسی کلمات ممنوعه و لینک
  // ==========================================
  if (message.text && !isExempt) {
    const text = message.text;
    const badWordsRaw = [
      "احمق", "بیشعور", "کلاهبرداری", "شاشزاده", "کون", "کص", 
      "سس خرسی", "تام مورلی", "کسکش", "کوسکش", "کوصکش", "کصکش", 
      "کیر", "کوس"
    ]; 
    const badWords = badWordsRaw.filter(w => w.trim().length > 1);
    const hasBadWord = badWords.some(word => text.includes(word.trim()));
    const linkRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-zA-Z0-9-]+\.[a-zA-Z]{2,})|(@[a-zA-Z0-9_]+)/i;
    const hasLink = linkRegex.test(text);

    if (hasBadWord || hasLink) {
      await tgApi('deleteMessage', { chat_id: chatId, message_id: messageId });
      return res.status(200).send('OK');
    }
  }

  // ==========================================
  // بخش 2: سیستم ضد تکرار
  // ==========================================
  if (KV_URL && KV_TOKEN && !isExempt) {
    let uniqueKey = null;

    if (message.text) {
      if (message.text.length > 15) {
        uniqueKey = "text_" + message.text.substring(0, 50).replace(/\s/g, '');
      }
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
        return res.status(200).send('OK');
      } else {
        await fetch(`${KV_URL}/set/${encodeURIComponent(uniqueKey)}/1/EX/86400`, {
          headers: { Authorization: `Bearer ${KV_TOKEN}` }
        });
      }
    }
  }

  // ==========================================
  // 🎨 بخش 3: مبدل عکس (با سرور بین‌المللی)
  // ==========================================
  if (message.text && message.text.startsWith("/font")) {
    let userText = message.text.replace("/font", "").trim();
    
    if (userText.length > 0) {
      // استفاده از سرور Placehold با فونت زیبای Amiri (کلاسیک) و پس زمینه سرمه‌ای تاریک
      const photoUrl = `https://placehold.co/800x400/1e293b/ffffff.png?text=${encodeURIComponent(userText)}&font=Amiri`;
      
      try {
        const sendRes = await tgApi('sendPhoto', {
          chat_id: chatId,
          photo: photoUrl,
          caption: `🎨 ساخته شده برای: ${message.from.first_name || "کاربر"}`
        });

        const responseData = await sendRes.json();

        // اگر آپلود موفق بود، پیام اصلی را پاک کن
        if (responseData.ok) {
          await tgApi('deleteMessage', { chat_id: chatId, message_id: messageId });
        }
      } catch (error) {
        await tgApi('sendMessage', { chat_id: chatId, text: "❌ خطا در ساخت عکس." });
      }
      return res.status(200).send('OK');
    }
  }

  res.status(200).send('OK');
}
