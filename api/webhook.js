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

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // ==========================================
  // 🎬 بخش ویژه: دانلودر (با سیستم دکمه شیشه‌ای جایگزین)
  // ==========================================
  if (message.text) {
    const text = message.text;
    const mediaRegex = /(https?:\/\/(?:www\.)?(?:instagram\.com|x\.com|twitter\.com)\/[^\s]+)/i;
    const match = text.match(mediaRegex);

    if (match) {
      const mediaUrl = match[0];

      // حذف لینک کاربر برای حفظ امنیت گروه
      if (!isExempt) {
        await tgApi('deleteMessage', { chat_id: chatId, message_id: messageId });
      }

      let waitMsgRes = await tgApi('sendMessage', { 
        chat_id: chatId, 
        text: `📥 در حال پردازش ویدیو...`
      });
      let waitMsgData = await waitMsgRes.json();
      let waitMsgId = waitMsgData.ok ? waitMsgData.result.message_id : null;

      try {
        // استفاده از سرور قدرتمندتر با هدرهای استاندارد برای جلوگیری از بلاک شدن
        const cobaltRes = await fetch("https://api.cobalt.tools/api/json", {
          method: "POST",
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            "Origin": "https://cobalt.tools"
          },
          body: JSON.stringify({ url: mediaUrl, videoQuality: "480" })
        });

        const cobaltData = await cobaltRes.json();

        if (cobaltData.status === "stream" || cobaltData.status === "redirect" || cobaltData.url) {
          
          // نقشه اول: تلاش برای آپلود مستقیم ویدیو در تلگرام
          const sendVidRes = await tgApi('sendVideo', {
            chat_id: chatId,
            video: cobaltData.url,
            caption: `👤 درخواست کننده: ${message.from.first_name || "کاربر"}`
          });
          const sendVidData = await sendVidRes.json();

          if (sendVidData.ok) {
            if (waitMsgId) await tgApi('deleteMessage', { chat_id: chatId, message_id: waitMsgId });
            return res.status(200).send('OK');
          } else {
            // نقشه دوم (سپر دفاعی): اگر تلگرام ویدیو را آپلود نکرد، دکمه شیشه‌ای بفرست
            if (waitMsgId) {
              await tgApi('editMessageText', {
                chat_id: chatId,
                message_id: waitMsgId,
                text: `🎥 تلگرام نتوانست این ویدیو را مستقیم آپلود کند (حجم بالا).\n\n👤 درخواست کننده: ${message.from.first_name || "کاربر"}\n👇 برای تماشای ویدیو روی دکمه زیر کلیک کنید:`,
                reply_markup: {
                  inline_keyboard: [[{ text: "📥 تماشای مستقیم ویدیو", url: cobaltData.url }]]
                }
              });
              // این پیام دکمه‌دار را پاک نمی‌کنیم تا کاربر بتواند ویدیو را ببیند
            }
            return res.status(200).send('OK');
          }
        }
        
        // اگر کلاً ویدیو پیدا نشد
        if (waitMsgId) {
          await tgApi('editMessageText', { chat_id: chatId, message_id: waitMsgId, text: `❌ ویدیو پیدا نشد (پیج پرایوت است).` });
          await sleep(3000);
          await tgApi('deleteMessage', { chat_id: chatId, message_id: waitMsgId });
        }
        return res.status(200).send('OK');

      } catch (error) {
        if (waitMsgId) {
          await tgApi('editMessageText', { chat_id: chatId, message_id: waitMsgId, text: `❌ سرور موقتاً در دسترس نیست.` });
          await sleep(3000);
          await tgApi('deleteMessage', { chat_id: chatId, message_id: waitMsgId });
        }
        return res.status(200).send('OK');
      }
    }
  }

  // ==========================================
  // بخش 1: بررسی کلمات ممنوعه
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
  // ⌨️ بخش 3: فونت ماشینی تلگرام
  // ==========================================
  if (message.text && message.text.startsWith("/font")) {
    let userText = message.text.replace("/font", "").trim();
    if (userText.length > 0) {
      const formattedText = `<code>${userText}</code>\n\n👤 ${message.from.first_name || "کاربر"}`;
      const sendRes = await tgApi('sendMessage', {
        chat_id: chatId,
        text: formattedText,
        parse_mode: "HTML"
      });
      const responseData = await sendRes.json();
      if (responseData.ok) {
        await tgApi('deleteMessage', { chat_id: chatId, message_id: messageId });
      }
      return res.status(200).send('OK');
    }
  }

  res.status(200).send('OK');
}
