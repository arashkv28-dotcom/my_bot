export default async function handler(req, res) {
  // تست ساده
  if (req.method === 'GET') {
    return res.status(200).json({ 
      status: 'Bot is running!', 
      timestamp: new Date().toISOString() 
    });
  }

  if (req.method !== 'POST') {
    return res.status(200).send('Bot webhook is ready!');
  }

  const BOT_TOKEN = process.env.BOT_TOKEN;

  console.log('Update received:', JSON.stringify(req.body, null, 2));

  const tgApi = async (method, body) => {
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return response.json();
  };

  // Handle messages
  const message = req.body.message;
  if (message) {
    const chatId = message.chat.id;
    const text = message.text || '';

    console.log('Message received:', text);

    if (text === '/start' || text === '/menu') {
      await tgApi('sendMessage', {
        chat_id: chatId,
        text: '✅ ربات کار می‌کند!\n\nاین یک تست ساده است.',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📋 منوی اصلی', callback_data: 'main_menu' }]
          ]
        }
      });
    }
  }

  // Handle callbacks
  if (req.body.callback_query) {
    const callbackQuery = req.body.callback_query;
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;

    console.log('Callback received:', callbackQuery.data);

    if (callbackQuery.data === 'main_menu') {
      await tgApi('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text: '📌 منوی اصلی\n\nگزینه‌ای را انتخاب کنید:',
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ تست موفق!', callback_data: 'test_ok' }]
          ]
        }
      });
    }

    await tgApi('answerCallbackQuery', { 
      callback_query_id: callbackQuery.id 
    });
  }

  res.status(200).send('OK');
}
