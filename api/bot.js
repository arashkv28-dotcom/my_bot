export default async function handler(req, res) {
  // تست GET
  if (req.method === 'GET') {
    return res.status(200).json({ 
      status: 'online', 
      time: new Date().toISOString() 
    });
  }

  if (req.method !== 'POST') return res.status(200).send('OK');
  if (!req.body) return res.status(200).send('OK');

  const BOT_TOKEN = process.env.BOT_TOKEN;
  const ADMIN_IDS = process.env.ADMIN_IDS 
    ? process.env.ADMIN_IDS.split(',').map(id => parseInt(id.trim())) 
    : [];

  const KV_URL = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;

  console.log('📨 Update received');

  // ==========================================
  // توابع کمکی
  // ==========================================

  const tgApi = async (method, body) => {
    try {
      const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      return await response.json();
    } catch (e) {
      console.error(`❌ ${method}:`, e);
      return null;
    }
  };

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // ==========================================
  // KV Database - بلک‌لیست
  // ==========================================

  const addToBlacklist = async (id, name, type) => {
    if (!KV_URL || !KV_TOKEN) return false;
    try {
      const data = JSON.stringify({ id, name, type, addedAt: Date.now() });
      await fetch(`${KV_URL}/set/blacklist_${id}/${encodeURIComponent(data)}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
      });
      return true;
    } catch (e) {
      return false;
    }
  };

  const removeFromBlacklist = async (id) => {
    if (!KV_URL || !KV_TOKEN) return false;
    try {
      await fetch(`${KV_URL}/del/blacklist_${id}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
      });
      return true;
    } catch (e) {
      return false;
    }
  };

  const isInBlacklist = async (id) => {
    if (!KV_URL || !KV_TOKEN) return false;
    try {
      const res = await fetch(`${KV_URL}/get/blacklist_${id}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
      });
      const data = await res.json();
      return data.result !== null;
    } catch (e) {
      return false;
    }
  };

  const getAllBlacklist = async () => {
    if (!KV_URL || !KV_TOKEN) return [];
    try {
      const keysRes = await fetch(`${KV_URL}/keys/blacklist_*`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
      });
      const keysData = await keysRes.json();
      
      if (!keysData.result || keysData.result.length === 0) return [];
      
      const list = [];
      for (const key of keysData.result) {
        const valueRes = await fetch(`${KV_URL}/get/${key}`, {
          headers: { Authorization: `Bearer ${KV_TOKEN}` }
        });
        const valueData = await valueRes.json();
        if (valueData.result) {
          try {
            list.push(JSON.parse(valueData.result));
          } catch (e) {}
        }
      }
      return list;
    } catch (e) {
      return [];
    }
  };

  // ==========================================
  // KV Database - وایت‌لیست
  // ==========================================

  const addToWhitelist = async (id, name, type) => {
    if (!KV_URL || !KV_TOKEN) return false;
    try {
      const data = JSON.stringify({ id, name, type, addedAt: Date.now() });
      await fetch(`${KV_URL}/set/whitelist_${id}/${encodeURIComponent(data)}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
      });
      return true;
    } catch (e) {
      return false;
    }
  };

  const removeFromWhitelist = async (id) => {
    if (!KV_URL || !KV_TOKEN) return false;
    try {
      await fetch(`${KV_URL}/del/whitelist_${id}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
      });
      return true;
    } catch (e) {
      return false;
    }
  };

  const isInWhitelist = async (id) => {
    if (!KV_URL || !KV_TOKEN) return false;
    try {
      const res = await fetch(`${KV_URL}/get/whitelist_${id}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
      });
      const data = await res.json();
      return data.result !== null;
    } catch (e) {
      return false;
    }
  };

  const getAllWhitelist = async () => {
    if (!KV_URL || !KV_TOKEN) return [];
    try {
      const keysRes = await fetch(`${KV_URL}/keys/whitelist_*`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
      });
      const keysData = await keysRes.json();
      
      if (!keysData.result || keysData.result.length === 0) return [];
      
      const list = [];
      for (const key of keysData.result) {
        const valueRes = await fetch(`${KV_URL}/get/${key}`, {
          headers: { Authorization: `Bearer ${KV_TOKEN}` }
        });
        const valueData = await valueRes.json();
        if (valueData.result) {
          try {
            list.push(JSON.parse(valueData.result));
          } catch (e) {}
        }
      }
      return list;
    } catch (e) {
      return [];
    }
  };

  // ==========================================
  // KV Database - گروه‌ها
  // ==========================================

  const saveGroup = async (chatId, title, username) => {
    if (!KV_URL || !KV_TOKEN) return;
    try {
      const data = JSON.stringify({ id: chatId, title, username, joinedAt: Date.now() });
      await fetch(`${KV_URL}/set/group_${chatId}/${encodeURIComponent(data)}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
      });
    } catch (e) {}
  };

  const removeGroup = async (chatId) => {
    if (!KV_URL || !KV_TOKEN) return;
    try {
      await fetch(`${KV_URL}/del/group_${chatId}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
      });
    } catch (e) {}
  };

  const getAllGroups = async () => {
    if (!KV_URL || !KV_TOKEN) return [];
    try {
      const keysRes = await fetch(`${KV_URL}/keys/group_*`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
      });
      const keysData = await keysRes.json();
      
      if (!keysData.result || keysData.result.length === 0) return [];
      
      const list = [];
      for (const key of keysData.result) {
        const valueRes = await fetch(`${KV_URL}/get/${key}`, {
          headers: { Authorization: `Bearer ${KV_TOKEN}` }
        });
        const valueData = await valueRes.json();
        if (valueData.result) {
          try {
            list.push(JSON.parse(valueData.result));
          } catch (e) {}
        }
      }
      return list;
    } catch (e) {
      return [];
    }
  };

  // ==========================================
  // KV Database - آمار
  // ==========================================

  const incrementStat = async (key) => {
    if (!KV_URL || !KV_TOKEN) return;
    try {
      await fetch(`${KV_URL}/incr/stat_${key}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
      });
    } catch (e) {}
  };

  const getStat = async (key) => {
    if (!KV_URL || !KV_TOKEN) return 0;
    try {
      const res = await fetch(`${KV_URL}/get/stat_${key}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
      });
      const data = await res.json();
      return parseInt(data.result) || 0;
    } catch (e) {
      return 0;
    }
  };

  const getUserInfo = async (username) => {
    try {
      const data = await tgApi('getChat', { chat_id: username });
      if (data && data.ok) {
        return {
          id: data.result.id,
          name: data.result.first_name || data.result.title || username,
          type: data.result.type
        };
      }
      return null;
    } catch (e) {
      return null;
    }
  };

  // ==========================================
  // Callback Query Handler
  // ==========================================

  if (req.body.callback_query) {
    const cb = req.body.callback_query;
    const chatId = cb.message.chat.id;
    const msgId = cb.message.message_id;
    const data = cb.data;
    const userId = cb.from.id;
    const isAdmin = ADMIN_IDS.includes(userId);

    let text = "";
    let keyboard = {};

    if (data === "main_menu") {
      text = "📌 *منوی اصلی*\n\nیکی از گزینه‌ها را انتخاب کنید:";
      keyboard = {
        inline_keyboard: [
          [{ text: "📢 کانال‌ها", callback_data: "channels" }],
          [{ text: "👥 گروه‌ها", callback_data: "groups" }],
          [{ text: "📞 ارتباط", callback_data: "contact" }],
          [{ text: "📜 قوانین", callback_data: "rules" }],
          ...(isAdmin ? [[{ text: "⚙️ مدیریت", callback_data: "admin" }]] : [])
        ]
      };
    }
    else if (data === "channels") {
      text = "📢 *کانال‌های ما:*";
      keyboard = {
        inline_keyboard: [
          [{ text: "اندیشه پهلویسم", url: "https://t.me/andishepahlavism" }],
          [{ text: "فروپاشی", url: "https://t.me/froopashee2" }],
          [{ text: "الفبای سیاست", url: "https://t.me/Allephba" }],
          [{ text: "🔙 بازگشت", callback_data: "main_menu" }]
        ]
      };
    }
    else if (data === "groups") {
      text = "👥 *گروه‌های ما:*";
      keyboard = {
        inline_keyboard: [
          [{ text: "گفتگوی اندیشه پهلویسم", url: "https://t.me/goftemanazadAp" }],
          [{ text: "گفتگوی فروپاشی", url: "https://t.me/+6nIM1oBqTaVjNzYy" }],
          [{ text: "🔙 بازگشت", callback_data: "main_menu" }]
        ]
      };
    }
    else if (data === "contact") {
      text = "📞 *ارتباط با ما:*";
      keyboard = {
        inline_keyboard: [
          [{ text: "ارتباط اندیشه", url: "https://t.me/+aaJQcUU7ZIMyZWQ8" }],
          [{ text: "ارتباط فروپاشی", url: "https://t.me/+GZOW85iRkX45ODJi" }],
          [{ text: "🔙 بازگشت", callback_data: "main_menu" }]
        ]
      };
    }
    else if (data === "rules") {
      text = "📜 *قوانین:*\n\n۱. استفاده از کلمات رکیک و توهین ممنوع است.\n۲. ارسال هرگونه لینک و تبلیغات ممنوع است.\n۳. ارسال پیام‌های تکراری (اسپم) ممنوع است.\n۴. لطفاً نظم گروه را رعایت کنید.";
      keyboard = {
        inline_keyboard: [[{ text: "🔙 بازگشت", callback_data: "main_menu" }]]
      };
    }
    else if (data === "admin") {
      if (!isAdmin) {
        await tgApi('answerCallbackQuery', { 
          callback_query_id: cb.id, 
          text: "⛔️ دسترسی ندارید!", 
          show_alert: true 
        });
        return res.status(200).send('OK');
      }
      text = "⚙️ *پنل مدیریت*\n\nگزینه را انتخاب کنید:";
      keyboard = {
        inline_keyboard: [
          [{ text: "📊 آمار", callback_data: "stats" }],
          [{ text: "📋 گروه‌ها", callback_data: "manage_groups" }],
          [{ text: "🚫 بلک‌لیست", callback_data: "manage_blacklist" }],
          [{ text: "✅ وایت‌لیست", callback_data: "manage_whitelist" }],
          [{ text: "🔙 بازگشت", callback_data: "main_menu" }]
        ]
      };
    }
    else if (data === "stats") {
      if (!isAdmin) {
        await tgApi('answerCallbackQuery', { 
          callback_query_id: cb.id, 
          text: "⛔️ دسترسی ندارید!", 
          show_alert: true 
        });
        return res.status(200).send('OK');
      }

      const totalMessages = await getStat('messages');
      const deletedMessages = await getStat('deleted');
      const blockedForwards = await getStat('blocked_forwards');
      const groups = await getAllGroups();
      const blacklist = await getAllBlacklist();
      const whitelist = await getAllWhitelist();

      text = `📊 *آمار ربات*\n\n`;
      text += `📨 کل پیام‌ها: ${totalMessages}\n`;
      text += `🗑 پیام‌های حذف شده: ${deletedMessages}\n`;
      text += `🚫 فوروارد بلاک شده: ${blockedForwards}\n\n`;
      text += `📋 گروه‌های فعال: ${groups.length}\n`;
      text += `🚫 بلک‌لیست: ${blacklist.length}\n`;
      text += `✅ وایت‌لیست: ${whitelist.length}`;

      keyboard = {
        inline_keyboard: [[{ text: "🔙 بازگشت", callback_data: "admin" }]]
      };
    }
    else if (data === "manage_groups") {
      if (!isAdmin) {
        await tgApi('answerCallbackQuery', { 
          callback_query_id: cb.id, 
          text: "⛔️ دسترسی ندارید!", 
          show_alert: true 
        });
        return res.status(200).send('OK');
      }

      const groups = await getAllGroups();

      if (groups.length === 0) {
        text = "📋 *مدیریت گروه‌ها*\n\n❌ هیچ گروهی ثبت نشده.";
        keyboard = {
          inline_keyboard: [[{ text: "🔙 بازگشت", callback_data: "admin" }]]
        };
      } else {
        text = `📋 *مدیریت گروه‌ها*\n\n✅ تعداد: ${groups.length}\n\nروی گروه کلیک کنید:`;
        
        const groupButtons = groups.slice(0, 10).map(g => [{
          text: `📍 ${g.title}`,
          callback_data: `group_${g.id}`
        }]);

        keyboard = {
          inline_keyboard: [
            ...groupButtons,
            [{ text: "🔙 بازگشت", callback_data: "admin" }]
          ]
        };
      }
    }
    else if (data.startsWith("group_")) {
      if (!isAdmin) {
        await tgApi('answerCallbackQuery', { 
          callback_query_id: cb.id, 
          text: "⛔️ دسترسی ندارید!", 
          show_alert: true 
        });
        return res.status(200).send('OK');
      }

      const groupId = data.replace("group_", "");
      const groups = await getAllGroups();
      const group = groups.find(g => g.id.toString() === groupId);

      if (!group) {
        text = "❌ گروه یافت نشد!";
        keyboard = {
          inline_keyboard: [[{ text: "🔙 بازگشت", callback_data: "manage_groups" }]]
        };
      } else {
        text = `📊 *جزئیات گروه*\n\n📌 نام: ${group.title}\n🆔 شناسه: \`${group.id}\`\n👤 یوزرنیم: ${group.username ? '@' + group.username : '❌'}`;
        
        keyboard = {
          inline_keyboard: [
            [{ text: "🚪 خروج از گروه", callback_data: `leave_${groupId}` }],
            [{ text: "🔙 بازگشت", callback_data: "manage_groups" }]
          ]
        };
      }
    }
    else if (data.startsWith("leave_")) {
      if (!isAdmin) {
        await tgApi('answerCallbackQuery', { 
          callback_query_id: cb.id, 
          text: "⛔️ دسترسی ندارید!", 
          show_alert: true 
        });
        return res.status(200).send('OK');
      }

      const groupId = data.replace("leave_", "");
      
      const leaveResult = await tgApi('leaveChat', { chat_id: parseInt(groupId) });
      
      if (leaveResult && leaveResult.ok) {
        await removeGroup(groupId);
        text = "✅ ربات از گروه خارج شد.";
      } else {
        text = `❌ خطا: ${leaveResult?.description || 'نامشخص'}`;
        await removeGroup(groupId);
      }
      
      keyboard = {
        inline_keyboard: [[{ text: "🔙 بازگشت", callback_data: "manage_groups" }]]
      };
    }
    else if (data === "manage_blacklist") {
      if (!isAdmin) {
        await tgApi('answerCallbackQuery', { 
          callback_query_id: cb.id, 
          text: "⛔️ دسترسی ندارید!", 
          show_alert: true 
        });
        return res.status(200).send('OK');
      }

      const blacklist = await getAllBlacklist();

      if (blacklist.length === 0) {
        text = "🚫 *بلک‌لیست*\n\n❌ لیست خالی است.\n\n*راهنما:*\nپیام فوروارد شده را برام بفرست تا به بلک‌لیست اضافه شود.";
        keyboard = {
          inline_keyboard: [[{ text: "🔙 بازگشت", callback_data: "admin" }]]
        };
      } else {
        const users = blacklist.filter(i => i.type === 'user' || i.type === 'private');
        const channels = blacklist.filter(i => i.type === 'channel');
        const groups = blacklist.filter(i => i.type === 'group' || i.type === 'supergroup');

        text = `🚫 *بلک‌لیست*\n\n👤 کاربران: ${users.length}\n📢 کانال‌ها: ${channels.length}\n👥 گروه‌ها: ${groups.length}\n📊 مجموع: ${blacklist.length}`;
        
        const buttons = blacklist.slice(0, 10).map(item => [{
          text: `${item.type === 'user' ? '👤' : item.type === 'channel' ? '📢' : '👥'} ${item.name}`,
          callback_data: `bl_${item.id}`
        }]);

        keyboard = {
          inline_keyboard: [
            ...buttons,
            [{ text: "🔙 بازگشت", callback_data: "admin" }]
          ]
        };
      }
    }
    else if (data.startsWith("bl_")) {
      if (!isAdmin) {
        await tgApi('answerCallbackQuery', { 
          callback_query_id: cb.id, 
          text: "⛔️ دسترسی ندارید!", 
          show_alert: true 
        });
        return res.status(200).send('OK');
      }

      const itemId = data.replace("bl_", "");
      const blacklist = await getAllBlacklist();
      const item = blacklist.find(i => i.id.toString() === itemId);

      if (!item) {
        text = "❌ آیتم یافت نشد!";
        keyboard = {
          inline_keyboard: [[{ text: "🔙 بازگشت", callback_data: "manage_blacklist" }]]
        };
      } else {
        text = `🚫 *جزئیات*\n\n📌 نام: ${item.name}\n🆔 شناسه: \`${item.id}\`\n📝 نوع: ${item.type}`;
        
        keyboard = {
          inline_keyboard: [
            [{ text: "🗑 حذف از بلک‌لیست", callback_data: `bl_remove_${itemId}` }],
            [{ text: "🔙 بازگشت", callback_data: "manage_blacklist" }]
          ]
        };
      }
    }
    else if (data.startsWith("bl_remove_")) {
      if (!isAdmin) {
        await tgApi('answerCallbackQuery', { 
          callback_query_id: cb.id, 
          text: "⛔️ دسترسی ندارید!", 
          show_alert: true 
        });
        return res.status(200).send('OK');
      }

      const itemId = data.replace("bl_remove_", "");
      const success = await removeFromBlacklist(itemId);
      
      text = success ? "✅ از بلک‌لیست حذف شد." : "❌ خطا!";
      keyboard = {
        inline_keyboard: [[{ text: "🔙 بازگشت", callback_data: "manage_blacklist" }]]
      };
    }
    else if (data === "manage_whitelist") {
      if (!isAdmin) {
        await tgApi('answerCallbackQuery', { 
          callback_query_id: cb.id, 
          text: "⛔️ دسترسی ندارید!", 
          show_alert: true 
        });
        return res.status(200).send('OK');
      }

      const whitelist = await getAllWhitelist();

      if (whitelist.length === 0) {
        text = "✅ *وایت‌لیست*\n\n❌ لیست خالی است.\n\n*راهنما:*\nدستور `/wl آیدی_عددی` یا `/wl @username` را بفرستید.";
        keyboard = {
          inline_keyboard: [[{ text: "🔙 بازگشت", callback_data: "admin" }]]
        };
      } else {
        const users = whitelist.filter(i => i.type === 'user' || i.type === 'private');
        const channels = whitelist.filter(i => i.type === 'channel');
        const groups = whitelist.filter(i => i.type === 'group' || i.type === 'supergroup');

        text = `✅ *وایت‌لیست*\n\n👤 کاربران: ${users.length}\n📢 کانال‌ها: ${channels.length}\n👥 گروه‌ها: ${groups.length}\n📊 مجموع: ${whitelist.length}`;
        
        const buttons = whitelist.slice(0, 10).map(item => [{
          text: `${item.type === 'user' ? '👤' : item.type === 'channel' ? '📢' : '👥'} ${item.name}`,
          callback_data: `wl_${item.id}`
        }]);

        keyboard = {
          inline_keyboard: [
            ...buttons,
            [{ text: "🔙 بازگشت", callback_data: "admin" }]
          ]
        };
      }
    }
    else if (data.startsWith("wl_")) {
      if (!isAdmin) {
        await tgApi('answerCallbackQuery', { 
          callback_query_id: cb.id, 
          text: "⛔️ دسترسی ندارید!", 
          show_alert: true 
        });
        return res.status(200).send('OK');
      }

      const itemId = data.replace("wl_", "");
      const whitelist = await getAllWhitelist();
      const item = whitelist.find(i => i.id.toString() === itemId);

      if (!item) {
        text = "❌ آیتم یافت نشد!";
        keyboard = {
          inline_keyboard: [[{ text: "🔙 بازگشت", callback_data: "manage_whitelist" }]]
        };
      } else {
        text = `✅ *جزئیات*\n\n📌 نام: ${item.name}\n🆔 شناسه: \`${item.id}\`\n📝 نوع: ${item.type}`;
        
        keyboard = {
          inline_keyboard: [
            [{ text: "🗑 حذف از وایت‌لیست", callback_data: `wl_remove_${itemId}` }],
            [{ text: "🔙 بازگشت", callback_data: "manage_whitelist" }]
          ]
        };
      }
    }
    else if (data.startsWith("wl_remove_")) {
      if (!isAdmin) {
        await tgApi('answerCallbackQuery', { 
          callback_query_id: cb.id, 
          text: "⛔️ دسترسی ندارید!", 
          show_alert: true 
        });
        return res.status(200).send('OK');
      }

      const itemId = data.replace("wl_remove_", "");
      const success = await removeFromWhitelist(itemId);
      
      text = success ? "✅ از وایت‌لیست حذف شد." : "❌ خطا!";
      keyboard = {
        inline_keyboard: [[{ text: "🔙 بازگشت", callback_data: "manage_whitelist" }]]
      };
    }

    if (text) {
      await tgApi('editMessageText', {
        chat_id: chatId,
        message_id: msgId,
        text: text,
        parse_mode: "Markdown",
        reply_markup: keyboard
      });
    }

    await tgApi('answerCallbackQuery', { callback_query_id: cb.id });
    return res.status(200).send('OK');
  }

  // ==========================================
  // Message Handler
  // ==========================================

  const msg = req.body.message;
  if (!msg) return res.status(200).send('OK');

  const chatId = msg.chat.id;
  const text = msg.text || "";
  const userId = msg.from?.id;
  const isAdmin = ADMIN_IDS.includes(userId);
  const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';

  // آمار
  await incrementStat('messages');

  // ذخیره گروه
  if (isGroup && msg.chat.title) {
    await saveGroup(chatId, msg.chat.title, msg.chat.username);
  }

  // حذف join/leave
  if (msg.new_chat_members || msg.left_chat_member) {
    await tgApi('deleteMessage', { chat_id: chatId, message_id: msg.message_id });
    return res.status(200).send('OK');
  }

  // بررسی معافیت
  const senderChatId = msg.sender_chat ? msg.sender_chat.id : null;
  
  const isUserWhitelisted = userId ? await isInWhitelist(userId) : false;
  const isSenderWhitelisted = senderChatId ? await isInWhitelist(senderChatId) : false;
  const isChatWhitelisted = chatId ? await isInWhitelist(chatId) : false;
  
  const isExempt = 
    isAdmin ||
    isUserWhitelisted || 
    isSenderWhitelisted ||
    isChatWhitelisted || 
    userId === 777000 ||
    msg.is_automatic_forward;

  // فیلترهای امنیتی (فقط برای افراد غیر معاف در گروه)
  if (isGroup && !isExempt) {
    // بررسی بلک‌لیست فوروارد
    if (msg.forward_from_chat) {
      const forwardId = msg.forward_from_chat.id;
      const isBlocked = await isInBlacklist(forwardId);
      
      if (isBlocked) {
        await tgApi('deleteMessage', { chat_id: chatId, message_id: msg.message_id });
        await incrementStat('blocked_forwards');
        await incrementStat('deleted');
        
        const warn = await tgApi('sendMessage', { 
          chat_id: chatId, 
          text: `🚫 پیام حذف شد - فوروارد از منبع بلک‌لیست شده`
        });
        
        if (warn && warn.result) {
          await sleep(5000);
          await tgApi('deleteMessage', { chat_id: chatId, message_id: warn.result.message_id });
        }
        
        return res.status(200).send('OK');
      }
    }

    if (msg.forward_from) {
      const forwardId = msg.forward_from.id;
      const isBlocked = await isInBlacklist(forwardId);
      
      if (isBlocked) {
        await tgApi('deleteMessage', { chat_id: chatId, message_id: msg.message_id });
        await incrementStat('blocked_forwards');
        await incrementStat('deleted');
        
        const warn = await tgApi('sendMessage', { 
          chat_id: chatId, 
          text: `🚫 پیام حذف شد - فوروارد از کاربر بلک‌لیست شده`
        });
        
        if (warn && warn.result) {
          await sleep(5000);
          await tgApi('deleteMessage', { chat_id: chatId, message_id: warn.result.message_id });
        }
        
        return res.status(200).send('OK');
      }
    }

    // فیلتر کلمات رکیک
    const badWords = [
      "کونی", "جاکش", "جنده", "شاشزاده", 
      "کون", "کص", "کسکش", "کوسکش", "کوصکش", "کصکش", 
      "کیر", "کوس", "گوه"
    ];
    
    const normalizedText = text.toLowerCase().replace(/[.,،؛!؟?\s]/g, ' ');
    const words = normalizedText.split(/\s+/).filter(w => w.length > 0);
    const hasBadWord = badWords.some(badWord => words.includes(badWord.toLowerCase()));

    // فیلتر لینک
    const linkRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-zA-Z0-9-]+\.(com|org|ir|net|me|info))|(@[a-zA-Z0-9_]{5,})/i;
    const hasLink = linkRegex.test(text);

    if (hasBadWord || hasLink) {
      await tgApi('deleteMessage', { chat_id: chatId, message_id: msg.message_id });
      await incrementStat('deleted');
      
      const warnText = hasBadWord 
        ? "⚠️ استفاده از کلمات نامناسب ممنوع است!" 
        : "⚠️ ارسال لینک و تبلیغات ممنوع است!";
      
      const warn = await tgApi('sendMessage', { chat_id: chatId, text: warnText });
      
      if (warn && warn.result) {
        await sleep(7000);
        await tgApi('deleteMessage', { chat_id: chatId, message_id: warn.result.message_id });
      }
      
      return res.status(200).send('OK');
    }

    // ضد اسپم
    if (KV_URL && KV_TOKEN && text.length > 10) {
      const spamKey = `spam_${text.substring(0, 50).replace(/\s/g, '')}`;
      
      try {
        const spamCheck = await fetch(`${KV_URL}/get/${spamKey}`, {
          headers: { Authorization: `Bearer ${KV_TOKEN}` }
        });
        const spamData = await spamCheck.json();
        
        if (spamData.result !== null) {
          await tgApi('deleteMessage', { chat_id: chatId, message_id: msg.message_id });
          await incrementStat('deleted');
          
          const warn = await tgApi('sendMessage', { 
            chat_id: chatId, 
            text: "⚠️ ارسال پیام تکراری (اسپم) ممنوع است!" 
          });
          
          if (warn && warn.result) {
            await sleep(7000);
            await tgApi('deleteMessage', { chat_id: chatId, message_id: warn.result.message_id });
          }
          
          return res.status(200).send('OK');
        } else {
          await fetch(`${KV_URL}/set/${spamKey}/1/EX/86400`, {
            headers: { Authorization: `Bearer ${KV_TOKEN}` }
          });
        }
      } catch (e) {}
    }
  }

  // دستورات ادمین - افزودن به بلک‌لیست (فوروارد)
  if (!isGroup && isAdmin && (msg.forward_from_chat || msg.forward_from)) {
    let id, name, type;
    
    if (msg.forward_from_chat) {
      id = msg.forward_from_chat.id;
      name = msg.forward_from_chat.title || msg.forward_from_chat.username || 'نامشخص';
      type = msg.forward_from_chat.type;
    } else if (msg.forward_from) {
      id = msg.forward_from.id;
      const firstName = msg.forward_from.first_name || '';
      const lastName = msg.forward_from.last_name || '';
      name = `${firstName} ${lastName}`.trim() || 'کاربر';
      type = 'user';
    }

    const alreadyBlacklisted = await isInBlacklist(id);
    
    if (alreadyBlacklisted) {
      await tgApi('sendMessage', {
        chat_id: chatId,
        text: `⚠️ قبلاً در بلک‌لیست است!\n\n📌 ${name}\n🆔 \`${id}\``,
        parse_mode: "Markdown"
      });
    } else {
      const success = await addToBlacklist(id, name, type);
      
      if (success) {
        await tgApi('sendMessage', {
          chat_id: chatId,
          text: `✅ به بلک‌لیست اضافه شد!\n\n📌 ${name}\n🆔 \`${id}\`\n📝 ${type}`,
          parse_mode: "Markdown"
        });
      }
    }
    return res.status(200).send('OK');
  }

  // دستور /wl - افزودن به وایت‌لیست
  if (!isGroup && isAdmin && text.startsWith('/wl')) {
    const args = text.split(' ');
    
    if (args.length < 2) {
      await tgApi('sendMessage', {
        chat_id: chatId,
        text: "❌ *استفاده نادرست!*\n\n*مثال:*\n`/wl 123456789`\n`/wl @username`",
        parse_mode: "Markdown"
      });
      return res.status(200).send('OK');
    }

    const target = args[1];
    let id, name, type;

    if (/^-?\d+$/.test(target)) {
      id = parseInt(target);
      name = `ID: ${id}`;
      type = id < 0 ? 'group' : 'user';
    } else if (target.startsWith('@')) {
      const info = await getUserInfo(target);
      if (!info) {
        await tgApi('sendMessage', {
          chat_id: chatId,
          text: `❌ ${target} یافت نشد!`
        });
        return res.status(200).send('OK');
      }
      id = info.id;
      name = info.name;
      type = info.type;
    }

    const alreadyWhitelisted = await isInWhitelist(id);
    
    if (alreadyWhitelisted) {
      await tgApi('sendMessage', {
        chat_id: chatId,
        text: `⚠️ قبلاً در وایت‌لیست است!`,
        parse_mode: "Markdown"
      });
    } else {
      const success = await addToWhitelist(id, name, type);
      
      if (success) {
        await tgApi('sendMessage', {
          chat_id: chatId,
          text: `✅ به وایت‌لیست اضافه شد!\n\n📌 ${name}\n🆔 \`${id}\``,
          parse_mode: "Markdown"
        });
      }
    }
    return res.status(200).send('OK');
  }

  // دستور /start
  if (text === '/start' || text.startsWith('/start@')) {
    if (isGroup) {
      await tgApi('deleteMessage', { chat_id: chatId, message_id: msg.message_id });
    }

    const keyboard = isAdmin 
      ? [[{ text: "📋 منو" }], [{ text: "⚙️ مدیریت" }]]
      : [[{ text: "📋 منو" }]];

    let welcomeText = `👋 *خوش آمدید!*\n\n`;
    if (isAdmin) {
      welcomeText += `🔑 شما ادمین هستید و از همه فیلترها معاف می‌باشید.\n\n`;
      welcomeText += `📝 *راهنمای سریع:*\n`;
      welcomeText += `• فوروارد کنید → بلک‌لیست\n`;
      welcomeText += `• \`/wl آیدی\` → وایت‌لیست\n\n`;
    }
    welcomeText += `از دکمه زیر استفاده کنید:`;

    await tgApi('sendMessage', {
      chat_id: chatId,
      text: welcomeText,
      parse_mode: "Markdown",
      reply_markup: { keyboard, resize_keyboard: true }
    });
    return res.status(200).send('OK');
  }

  // دستور /menu
  if (text === '/menu' || text === 'منو' || text === '📋 منو') {
    if (isGroup) {
      await tgApi('deleteMessage', { chat_id: chatId, message_id: msg.message_id });
    }

    const adminBtn = isAdmin ? [[{ text: "⚙️ مدیریت", callback_data: "admin" }]] : [];

    await tgApi('sendMessage', {
      chat_id: chatId,
      text: "📌 *منوی اصلی*\n\nگزینه را انتخاب کنید:",
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "📢 کانال‌ها", callback_data: "channels" }],
          [{ text: "👥 گروه‌ها", callback_data: "groups" }],
          [{ text: "📞 ارتباط", callback_data: "contact" }],
          [{ text: "📜 قوانین", callback_data: "rules" }],
          ...adminBtn
        ]
      }
    });
    return res.status(200).send('OK');
  }

  // دستور /admin
  if ((text === '/admin' || text === '⚙️ مدیریت') && isAdmin && !isGroup) {
    await tgApi('sendMessage', {
      chat_id: chatId,
      text: "⚙️ *پنل مدیریت*\n\nگزینه را انتخاب کنید:",
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "📊 آمار", callback_data: "stats" }],
          [{ text: "📋 گروه‌ها", callback_data: "manage_groups" }],
          [{ text: "🚫 بلک‌لیست", callback_data: "manage_blacklist" }],
          [{ text: "✅ وایت‌لیست", callback_data: "manage_whitelist" }]
        ]
      }
    });
    return res.status(200).send('OK');
  }

  res.status(200).send('OK');
}
