export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('Bot is running on Vercel!');
  const message = req.body.message || req.body.channel_post;
  if (!message) return res.status(200).send('OK');

  const chatId = message.chat.id;
  const messageId = message.message_id;
  const text = message.text;
  const BOT_TOKEN = process.env.BOT_TOKEN;

  if (!text) return res.status(200).send('OK');

  const WHITELIST_IDS = [1001977073229, 1922419923, 6990025961, 96431648, -1001678007720, 5443017337, 8097212518, 6604010059, 7452439235, 8108599040, 6491888510, 7738331590, -1002103959267, -1002080075722, -1002425222777];
  const userId = message.from ? message.from.id : null;
  const isExempt = WHITELIST_IDS.includes(userId) || req.body.channel_post;
  const isGroup = message.chat.type !== 'private';

  const tgApi = async (method, body) => {
    return await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  };

  // ==========================================
  // ۱. جواب به سلام و استارت
  // ==========================================
  if (text === "/start") {
    await tgApi('sendMessage', { chat_id: chatId, text: "سلام! من با قدرت روی ورسل فعال هستم. 🚀" });
    return res.status(200).send('OK');
  }
  if (text === "سلام" || text === "درود") {
    await tgApi('sendMessage', { chat_id: chatId, text: `درود بر شما ${message.from.first_name || ""}! 🌹` });
    return res.status(200).send('OK');
  }

  // ==========================================
  // ۲. دانلودر سریع (با سیستم دکمه شیشه‌ای)
  // ==========================================
  const mediaRegex = /(https?:\/\/(?:www\.)?(?:instagram\.com|x\.com|twitter\.com)\/[^\s]+)/i;
  const match = text.match(mediaRegex);

  if (match) {
    // پاک کردن لینک از گروه
    if (!isExempt && isGroup) await tgApi('deleteMessage', { chat_id: chatId, message_id: messageId });

    let waitRes = await tgApi('sendMessage', { chat_id: chatId, text: "📥 پردازش ویدیو..." });
    let waitData = await waitRes.json();
    let waitMsgId = waitData.ok ? waitData.result.message_id : null;

    try {
      const cobaltRes = await fetch("https://api.cobalt.tools/api/json", {
        method: "POST",
        headers: { "Accept": "application/json", "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
        body: JSON.stringify({ url: match[0], videoQuality: "480" })
      });
      const cobaltData = await cobaltRes.json();

      if (cobaltData.url) {
        // تلاش برای آپلود مستقیم
        const sendVidRes = await tgApi('sendVideo', {
          chat_id: chatId,
          video: cobaltData.url,
          caption: `🎬 درخواست: ${message.from.first_name || "کاربر"}`
        });
        const sendVidData = await sendVidRes.json();

        if (sendVidData.ok) {
          if (waitMsgId) await tgApi('deleteMessage', { chat_id: chatId, message_id: waitMsgId });
        } else {
          // اگر آپلود نشد، دکمه شیشه‌ای بفرست
          if (waitMsgId) {
            await tgApi('editMessageText', {
              chat_id: chatId,
              message_id: waitMsgId,
              text: `🎥 ویدیو آماده است (حجم بالا).\n👤 درخواست: ${message.from.first_name || "کاربر"}`,
              reply_markup: { inline_keyboard: [[{ text: "📥 تماشای مستقیم ویدیو", url: cobaltData.url }]] }
            });
          }
        }
      } else {
         if (waitMsgId) await tgApi('editMessageText', { chat_id: chatId, message_id: waitMsgId, text: "❌ ویدیو پیدا نشد." });
      }
    } catch (e) {
       if (waitMsgId) await tgApi('editMessageText', { chat_id: chatId, message_id: waitMsgId, text: "❌ خطا در سرور." });
    }
    return res.status(200).send('OK');
  }

  // ==========================================
  // ۳. امنیت: ضد تکرار، لینک و فحش (فقط برای اعضا)
  // ==========================================
  if (!isExempt && isGroup) {
    const KV_URL = process.env.KV_REST_API_URL;
    const KV_TOKEN = process.env.KV_REST_API_TOKEN;
    
    // الف) سیستم ضد تکرار دیتابیس
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

    // ب) فیلتر کلمات و لینک
    const badWordsRaw = ["احمق", "کونی", "گوه نخور", "شاشزاده", "کون", "کص", "سس خرسی", "تام مورلی", "کسکش", "کوسکش", "کوصکش", "کصکش", "کیر", "کوس"];
    const hasBadWord = badWordsRaw.some(w => text.includes(w));
    const linkRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-zA-Z0-9-]+\.[a-zA-Z]{2,})|(@[a-zA-Z0-9_]+)/i;

    if (hasBadWord || linkRegex.test(text)) {
      await tgApi('deleteMessage', { chat_id: chatId, message_id: messageId });
      return res.status(200).send('OK');
    }
  }

  // ==========================================
  // ۴. فونت ماشینی تلگرام
  // ==========================================
  if (text.startsWith("/font")) {
    let userText = text.replace("/font", "").trim();
    if (userText.length > 0) {
      await tgApi('sendMessage', { 
        chat_id: chatId, 
        text: `<code>${userText}</code>\n\n👤 ${message.from.first_name || "کاربر"}`, 
        parse_mode: "HTML" 
      });
      if (isGroup) await tgApi('deleteMessage', { chat_id: chatId, message_id: messageId });
    }
  }

  res.status(200).send('OK');
}
