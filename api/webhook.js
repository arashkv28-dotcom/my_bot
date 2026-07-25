export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('Bot is running!');
  const message = req.body.message;
  if (!message || !message.text) return res.status(200).send('OK');

  const chatId = message.chat.id;
  const text = message.text.trim();
  const BOT_TOKEN = process.env.BOT_TOKEN; 
  let replyText = "";

  if (text === "سلام" || text === "درود") {
    replyText = "درود بر شما! به گروه ما خوش آمدید. 🌹";
  } else if (text.includes("قوانین")) {
    replyText = "📜 قوانین گروه:\n1️⃣ توهین ممنوع\n2️⃣ تبلیغات ممنوع\n3️⃣ چت فقط در مورد موضوع گروه.";
  }

  if (replyText !== "") {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: replyText })
    });
  }
  res.status(200).send('OK');
}
