export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('Bot is running!');
  const message = req.body.message;
  if (!message || !message.text) return res.status(200).send('OK');

  const chatId = message.chat.id;
  const messageId = message.message_id;
  const text = message.text;
  const BOT_TOKEN = process.env.BOT_TOKEN; 

  // یک تابع کوچک برای ارسال درخواست‌ها به تلگرام
  const tgApi = async (method, body) => {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  };

  // 🔴 بخش 1: شناسایی کلمات ممنوعه
  // کلمات ممنوعه خود را داخل این کروشه بنویسید (با علامت نقل قول و کاما)
  const badWords = ["احمق", "بیشعور", "کلاهبرداری"]; 
  const hasBadWord = badWords.some(word => text.includes(word));

  // 🔴 بخش 2: شناسایی لینک (سایت، تلگرام و...)
  // این فرمول ریاضی تمام لینک‌ها (http, www, .com, .ir, @username) را پیدا می‌کند
  const linkRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-zA-Z0-9-]+\.[a-zA-Z]{2,})|(@[a-zA-Z0-9_]+)/i;
  const hasLink = linkRegex.test(text);

  // اگر پیام لینک یا کلمه ممنوعه داشت:
  if (hasBadWord || hasLink) {
    // اول: پیام کاربر را پاک کن
    await tgApi('deleteMessage', { chat_id: chatId, message_id: messageId });
    
    // دوم: دلیل پاک شدن را پیدا کن
    let reason = hasLink ? "ارسال لینک یا آیدی" : "استفاده از کلمات ممنوعه";
    
    // سوم: به کاربر اخطار بده
    let warningText = `⚠️ **هشدار!**\nکاربر عزیز، پیام شما به دلیل «${reason}» پاک شد.\nلطفاً قوانین گروه را رعایت کنید.`;
    await tgApi('sendMessage', { chat_id: chatId, text: warningText });
    
    // عملیات را همینجا تمام کن تا کدهای پایین‌تر (مثل سلام کردن) اجرا نشوند
    return res.status(200).send('OK');
  }

  // 🟢 بخش 3: کدهای قبلی (جواب دادن به سلام و قوانین)
  let replyText = "";
  if (text === "سلام" || text === "درود") {
    replyText = "درود بر شما! به گروه ما خوش آمدید. 🌹";
  } else if (text.includes("قوانین")) {
    replyText = "📜 قوانین گروه:\n1️⃣ توهین ممنوع\n2️⃣ تبلیغات ممنوع\n3️⃣ چت فقط در مورد موضوع گروه.";
  }

  if (replyText !== "") {
    await tgApi('sendMessage', { chat_id: chatId, text: replyText });
  }

  res.status(200).send('OK');
}
