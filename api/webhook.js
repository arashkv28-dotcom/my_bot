export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('Bot is running on Vercel!');
  if (!req.body) return res.status(200).send('OK');
  
  const BOT_TOKEN = process.env.BOT_TOKEN;
  const ADMIN_IDS = process.env.ADMIN_IDS 
    ? process.env.ADMIN_IDS.split(',').map(id => parseInt(id.trim())) 
    : [];

  console.log('Received update:', JSON.stringify(req.body, null, 2));

  const FAQ_ANSWERS = {
    faq_1: "🔹 *مجموعه شما چیست؟*\n\n*ما مجموعه‌ای شامل چند کانال و گروه هستیم که حول محور اندیشه پهلویسم، مسائل روز، اخبار، و مباحث مرتبط سیاسی فعالیت می‌کنند.*",
    faq_2: "🔹 *کانال‌ها کدام‌اند؟*\n\n*برای دیدن لیست کامل کانال‌های ما به بخش «📢 کانال های ما» مراجعه کنید.*",
    faq_3: "🔹 *گروه‌ها کدام‌اند؟*\n\n*برای دیدن لیست کامل گروه‌های ما به بخش «👥 گروه های ما» مراجعه کنید.*",
    faq_4: "🔹 *چطور ارتباط بگیرم؟*\n\n*می‌تونید از بخش «📞 گروه های ارتباط» استفاده کنید.*",
    faq_5: "🔹 *قوانین چیست؟*\n\n*۱. استفاده از کلمات رکیک ممنوع است.\n۲. ارسال لینک ممنوع است.\n۳. پیام‌های تکراری حذف می‌شوند.*"
  };

  const tgApi = async (method, body) => {
    try {
      const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await response.json();
      console.log(`${method} response:`, data);
      return response;
    } catch (e) {
      console.error('tgApi error:', e);
      return null;
    }
  };

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const KV_URL = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;

  // ==========================================
  // توابع مدیریت بلک‌لیست
  // ==========================================
  
  const addToBlacklist = async (targetId, targetName, targetType, targetUsername = null) => {
    if (!KV_URL || !KV_TOKEN) return false;
    try {
      const blacklistData = JSON.stringify({ 
        id: targetId, 
        name: targetName,
        type: targetType,
        username: targetUsername,
        addedAt: Date.now()
      });
      await fetch(`${KV_URL}/set/blacklist_${targetId}/${encodeURIComponent(blacklistData)}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
      });
      return true;
    } catch (e) {
      console.error('addToBlacklist error:', e);
      return false;
    }
  };

  const removeFromBlacklist = async (targetId) => {
    if (!KV_URL || !KV_TOKEN) return false;
    try {
      await fetch(`${KV_URL}/del/blacklist_${targetId}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
      });
      return true;
    } catch (e) {
      return false;
    }
  };

  const isInBlacklist = async (targetId) => {
    if (!KV_URL || !KV_TOKEN) return false;
    try {
      const checkRes = await fetch(`${KV_URL}/get/blacklist_${targetId}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
      });
      const checkData = await checkRes.json();
      return checkData.result !== null;
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
      
      const blacklist = [];
      for (const key of keysData.result) {
        const valueRes = await fetch(`${KV_URL}/get/${key}`, {
          headers: { Authorization: `Bearer ${KV_TOKEN}` }
        });
        const valueData = await valueRes.json();
        if (valueData.result) {
          try {
            blacklist.push(JSON.parse(valueData.result));
          } catch (e) {}
        }
      }
      return blacklist;
    } catch (e) {
      return [];
    }
  };

  // ==========================================
  // توابع مدیریت وایت‌لیست
  // ==========================================
  
  const addToWhitelist = async (targetId, targetName, targetType, targetUsername = null) => {
    if (!KV_URL || !KV_TOKEN) return false;
    try {
      const whitelistData = JSON.stringify({ 
        id: targetId, 
        name: targetName,
        type: targetType,
        username: targetUsername,
        addedAt: Date.now()
      });
      await fetch(`${KV_URL}/set/whitelist_${targetId}/${encodeURIComponent(whitelistData)}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
      });
      return true;
    } catch (e) {
      return false;
    }
  };

  const removeFromWhitelist = async (targetId) => {
    if (!KV_URL || !KV_TOKEN) return false;
    try {
      await fetch(`${KV_URL}/del/whitelist_${targetId}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
      });
      return true;
    } catch (e) {
      return false;
    }
  };

  const isInWhitelist = async (targetId) => {
    if (!KV_URL || !KV_TOKEN) return false;
    try {
      const checkRes = await fetch(`${KV_URL}/get/whitelist_${targetId}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
      });
      const checkData = await checkRes.json();
      return checkData.result !== null;
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
      
      const whitelist = [];
      for (const key of keysData.result) {
        const valueRes = await fetch(`${KV_URL}/get/${key}`, {
          headers: { Authorization: `Bearer ${KV_TOKEN}` }
        });
        const valueData = await valueRes.json();
        if (valueData.result) {
          try {
            whitelist.push(JSON.parse(valueData.result));
          } catch (e) {}
        }
      }
      return whitelist;
    } catch (e) {
      return [];
    }
  };

  const getUserInfo = async (username) => {
    try {
      const chatRes = await tgApi('getChat', { chat_id: username });
      const chatData = await chatRes.json();
      
      if (chatData.ok) {
        return {
          id: chatData.result.id,
          name: chatData.result.first_name || chatData.result.title || username,
          username: chatData.result.username || null,
          type: chatData.result.type === 'private' ? 'user' : chatData.result.type
        };
      }
      return null;
    } catch (e) {
      return null;
    }
  };

  // ==========================================
  // توابع مدیریت گروه‌ها
  // ==========================================
  
  const saveGroupToKV = async (chatId, chatTitle, chatUsername) => {
    if (!KV_URL || !KV_TOKEN) return;
    try {
      const groupData = JSON.stringify({ 
        id: chatId, 
        title: chatTitle, 
        username: chatUsername || null,
        joinedAt: Date.now()
      });
      await fetch(`${KV_URL}/set/group_${chatId}/${encodeURIComponent(groupData)}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
      });
    } catch (e) {}
  };

  const removeGroupFromKV = async (chatId) => {
    if (!KV_URL || !KV_TOKEN) return;
    try {
      await fetch(`${KV_URL}/del/group_${chatId}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
      });
    } catch (e) {}
  };

  const getAllGroupsFromKV = async () => {
    if (!KV_URL || !KV_TOKEN) return [];
    try {
      const keysRes = await fetch(`${KV_URL}/keys/group_*`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
      });
      const keysData = await keysRes.json();
      
      if (!keysData.result || keysData.result.length === 0) return [];
      
      const groups = [];
      for (const key of keysData.result) {
        const valueRes = await fetch(`${KV_URL}/get/${key}`, {
          headers: { Authorization: `Bearer ${KV_TOKEN}` }
        });
        const valueData = await valueRes.json();
        if (valueData.result) {
          try {
            groups.push(JSON.parse(valueData.result));
          } catch (e) {}
        }
      }
      return groups;
    } catch (e) {
      return [];
    }
  };

  // ==========================================
  // Callback Query Handler
  // ==========================================
  if (req.body.callback_query) {
    const callbackQuery = req.body.callback_query;
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const data = callbackQuery.data;
    const userId = callbackQuery.from.id;

    console.log('Callback query from user:', userId, 'data:', data);

    let newText = "";
    let newMarkup = {};

    const isAdmin = ADMIN_IDS.includes(userId);

    if (data === "main_menu") {
      newText = "📌 *منوی اصلی مجموعه‌ها*\n\nلطفاً یکی از گزینه‌های زیر را انتخاب کنید:";
      newMarkup = {
        inline_keyboard: [
          [{ text: "📢 کانال های ما", callback_data: "menu_channels" }],
          [{ text: "👥 گروه های ما", callback_data: "menu_groups" }],
          [{ text: "📞 گروه های ارتباط", callback_data: "menu_contact" }],
          [{ text: "📜 قوانین", callback_data: "menu_rules" }],
          [{ text: "💬 گفت‌وگو با ربات", callback_data: "menu_chat" }],
          ...(isAdmin ? [
            [{ text: "⚙️ مدیریت گروه‌ها", callback_data: "admin_manage" }],
            [{ text: "🚫 بلک‌لیست", callback_data: "blacklist_manage" }, { text: "✅ وایت‌لیست", callback_data: "whitelist_manage" }]
          ] : [])
        ]
      };
    }
    else if (data === "menu_channels") {
      newText = "📢 *لیست کانال‌های ما:*";
      newMarkup = {
        inline_keyboard: [
          [{ text: "آرشیو جاویدنامان دیماه", url: "https://t.me/javidnam10_1404" }],
          [{ text: "عکس و استیکر اندیشه پهلویسم", url: "https://t.me/pic_gifpahlavi" }],
          [{ text: "اندیشه پهلویسم", url: "https://t.me/andishepahlavism" }],
          [{ text: "فروپاشی", url: "https://t.me/froopashee2" }],
          [{ text: "الفبای سیاست", url: "https://t.me/Allephba" }],
          [{ text: "🔙 بازگشت", callback_data: "main_menu" }]
        ]
      };
    }
    else if (data === "menu_groups") {
      newText = "👥 *لیست گروه‌های ما:*";
      newMarkup = {
        inline_keyboard: [
          [{ text: "گفتگوی اندیشه پهلویسم", url: "https://t.me/goftemanazadAp" }],
          [{ text: "گفتگوی فروپاشی", url: "https://t.me/+6nIM1oBqTaVjNzYy" }],
          [{ text: "تلنگر", url: "https://t.me/+Vad19Bh1UAxmYTYy" }],
          [{ text: "گپ شبانه", url: "https://t.me/+j9Xnb05ntcVmM2Ni" }],
          [{ text: "عکس و استیکر اندیشه پهلویسم", url: "https://t.me/pic_gifpahlavi_r" }],
          [{ text: "🔙 بازگشت", callback_data: "main_menu" }]
        ]
      };
    }
    else if (data === "menu_contact") {
      newText = "📞 *گروه‌های ارتباط:*";
      newMarkup = {
        inline_keyboard: [
          [{ text: "ارتباط اندیشه پهلویسم", url: "https://t.me/+aaJQcUU7ZIMyZWQ8" }],
          [{ text: "ارتباط فرو پاشی", url: "https://t.me/+GZOW85iRkX45ODJi" }],
          [{ text: "🔙 بازگشت", callback_data: "main_menu" }]
        ]
      };
    }
    else if (data === "menu_rules") {
      newText = "📜 *قوانین و مقررات:*\n\n۱. استفاده از کلمات رکیک و توهین ممنوع است.\n۲. ارسال هرگونه لینک و تبلیغات اکیداً ممنوع است.\n۳. سیستم به صورت خودکار پیام‌های تکراری و لینک‌ها را حذف می‌کند.\n۴. لطفاً نظم گروه را رعایت کنید.";
      newMarkup = {
        inline_keyboard: [[{ text: "🔙 بازگشت", callback_data: "main_menu" }]]
      };
    }
    else if (data === "menu_chat") {
      newText = "💬 *گفت‌وگو با ربات*\n\nچطور می‌تونم کمکتون کنم؟";
      newMarkup = {
        inline_keyboard: [
          [{ text: "❓ سوالات متداول", callback_data: "menu_faq" }],
          [{ text: "📩 ارتباط با ما", callback_data: "menu_contactus" }],
          [{ text: "🔙 بازگشت", callback_data: "main_menu" }]
        ]
      };
    }
    else if (data === "menu_faq") {
      newText = "❓ *سوالات متداول*\n\nیکی از سوالات زیر رو انتخاب کنید:";
      newMarkup = {
        inline_keyboard: [
          [{ text: "مجموعه شما چیست؟", callback_data: "faq_1" }],
          [{ text: "کانال‌ها کدام‌اند؟", callback_data: "faq_2" }],
          [{ text: "گروه‌ها کدام‌اند؟", callback_data: "faq_3" }],
          [{ text: "چطور ارتباط بگیرم؟", callback_data: "faq_4" }],
          [{ text: "قوانین چیست؟", callback_data: "faq_5" }],
          [{ text: "🔙 بازگشت", callback_data: "menu_chat" }]
        ]
      };
    }
    else if (FAQ_ANSWERS[data]) {
      newText = FAQ_ANSWERS[data];
      newMarkup = {
        inline_keyboard: [[{ text: "🔙 بازگشت", callback_data: "menu_faq" }]]
      };
    }
    else if (data === "menu_contactus") {
      newText = "📩 *ارتباط با ما*\n\nبرای ارتباط با ادمین‌ها، روی یکی از دکمه‌های زیر کلیک کنید:";
      newMarkup = {
        inline_keyboard: [
          [{ text: "ارتباط اندیشه پهلویسم", url: "https://t.me/+aaJQcUU7ZIMyZWQ8" }],
          [{ text: "ارتباط فرو پاشی", url: "https://t.me/+GZOW85iRkX45ODJi" }],
          [{ text: "🔙 بازگشت", callback_data: "menu_chat" }]
        ]
      };
    }
    // مدیریت وایت‌لیست
    else if (data === "whitelist_manage") {
      if (!isAdmin) {
        await tgApi('answerCallbackQuery', { 
          callback_query_id: callbackQuery.id, 
          text: "⛔️ شما دسترسی ادمین ندارید!", 
          show_alert: true 
        });
        return res.status(200).send('OK');
      }

      const whitelist = await getAllWhitelist();
      
      if (whitelist.length === 0) {
        newText = "✅ *مدیریت وایت‌لیست*\n\n❌ لیست خالی است.\n\nبرای افزودن:\n`/wl 123456789`\n`/wl @username`";
        newMarkup = {
          inline_keyboard: [[{ text: "🔙 بازگشت", callback_data: "main_menu" }]]
        };
      } else {
        const users = whitelist.filter(item => item.type === 'user');
        const channels = whitelist.filter(item => item.type === 'channel');
        const groups = whitelist.filter(item => item.type === 'group' || item.type === 'supergroup');
        
        newText = `✅ *وایت‌لیست*\n\n👤 کاربران: ${users.length}\n📢 کانال‌ها: ${channels.length}\n👥 گروه‌ها: ${groups.length}\n📊 مجموع: ${whitelist.length}`;
        
        const whitelistButtons = whitelist.slice(0, 10).map(item => {
          let icon = '✅';
          if (item.type === 'user') icon = '👤';
          else if (item.type === 'channel') icon = '📢';
          else if (item.type === 'group' || item.type === 'supergroup') icon = '👥';
          
          return [{
            text: `${icon} ${item.name || item.username || item.id}`,
            callback_data: `wl_view_${item.id}`
          }];
        });
        
        newMarkup = {
          inline_keyboard: [
            ...whitelistButtons,
            [{ text: "🔙 بازگشت", callback_data: "main_menu" }]
          ]
        };
      }
    }
    else if (data.startsWith("wl_view_")) {
      if (!isAdmin) {
        await tgApi('answerCallbackQuery', { 
          callback_query_id: callbackQuery.id, 
          text: "⛔️ دسترسی ندارید!", 
          show_alert: true 
        });
        return res.status(200).send('OK');
      }

      const itemId = data.replace("wl_view_", "");
      const whitelist = await getAllWhitelist();
      const item = whitelist.find(w => w.id.toString() === itemId);

      if (!item) {
        newText = "❌ آیتم یافت نشد!";
        newMarkup = {
          inline_keyboard: [[{ text: "🔙 بازگشت", callback_data: "whitelist_manage" }]]
        };
      } else {
        newText = `✅ *جزئیات وایت‌لیست*\n\n📌 نام: ${item.name || 'نامشخص'}\n🆔 شناسه: \`${item.id}\`\n👤 یوزرنیم: ${item.username ? '@' + item.username : '❌'}`;
        
        newMarkup = {
          inline_keyboard: [
            [{ text: "🗑 حذف", callback_data: `wl_remove_${itemId}` }],
            [{ text: "🔙 بازگشت", callback_data: "whitelist_manage" }]
          ]
        };
      }
    }
    else if (data.startsWith("wl_remove_")) {
      if (!isAdmin) {
        await tgApi('answerCallbackQuery', { 
          callback_query_id: callbackQuery.id, 
          text: "⛔️ دسترسی ندارید!", 
          show_alert: true 
        });
        return res.status(200).send('OK');
      }

      const itemId = data.replace("wl_remove_", "");
      const success = await removeFromWhitelist(itemId);
      
      if (success) {
        newText = "✅ از وایت‌لیست حذف شد.";
        await tgApi('answerCallbackQuery', { 
          callback_query_id: callbackQuery.id, 
          text: "✅ حذف شد", 
          show_alert: false 
        });
      } else {
        newText = "❌ خطا در حذف!";
      }
      
      newMarkup = {
        inline_keyboard: [[{ text: "🔙 بازگشت", callback_data: "whitelist_manage" }]]
      };
    }
    // مدیریت بلک‌لیست
    else if (data === "blacklist_manage") {
      if (!isAdmin) {
        await tgApi('answerCallbackQuery', { 
          callback_query_id: callbackQuery.id, 
          text: "⛔️ شما دسترسی ادمین ندارید!", 
          show_alert: true 
        });
        return res.status(200).send('OK');
      }

      const blacklist = await getAllBlacklist();
      
      if (blacklist.length === 0) {
        newText = "🚫 *بلک‌لیست خالی است.*\n\nبرای افزودن پیام فوروارد کنید یا آیدی/یوزرنیم بفرستید.";
        newMarkup = {
          inline_keyboard: [[{ text: "🔙 بازگشت", callback_data: "main_menu" }]]
        };
      } else {
        const users = blacklist.filter(item => item.type === 'user');
        const channels = blacklist.filter(item => item.type === 'channel');
        const groups = blacklist.filter(item => item.type === 'group' || item.type === 'supergroup');
        
        newText = `🚫 *بلک‌لیست*\n\n👤 کاربران: ${users.length}\n📢 کانال‌ها: ${channels.length}\n👥 گروه‌ها: ${groups.length}\n📊 مجموع: ${blacklist.length}`;
        
        const blacklistButtons = blacklist.slice(0, 10).map(item => {
          let icon = '🚫';
          if (item.type === 'user') icon = '👤';
          else if (item.type === 'channel') icon = '📢';
          else if (item.type === 'group' || item.type === 'supergroup') icon = '👥';
          
          return [{
            text: `${icon} ${item.name || item.username || item.id}`,
            callback_data: `bl_view_${item.id}`
          }];
        });
        
        newMarkup = {
          inline_keyboard: [
            ...blacklistButtons,
            [{ text: "🔙 بازگشت", callback_data: "main_menu" }]
          ]
        };
      }
    }
    else if (data.startsWith("bl_view_")) {
      if (!isAdmin) {
        await tgApi('answerCallbackQuery', { 
          callback_query_id: callbackQuery.id, 
          text: "⛔️ دسترسی ندارید!", 
          show_alert: true 
        });
        return res.status(200).send('OK');
      }

      const itemId = data.replace("bl_view_", "");
      const blacklist = await getAllBlacklist();
      const item = blacklist.find(b => b.id.toString() === itemId);

      if (!item) {
        newText = "❌ آیتم یافت نشد!";
        newMarkup = {
          inline_keyboard: [[{ text: "🔙 بازگشت", callback_data: "blacklist_manage" }]]
        };
      } else {
        newText = `🚫 *جزئیات بلک‌لیست*\n\n📌 نام: ${item.name || 'نامشخص'}\n🆔 شناسه: \`${item.id}\`\n👤 یوزرنیم: ${item.username ? '@' + item.username : '❌'}`;
        
        newMarkup = {
          inline_keyboard: [
            [{ text: "🗑 حذف", callback_data: `bl_remove_${itemId}` }],
            [{ text: "🔙 بازگشت", callback_data: "blacklist_manage" }]
          ]
        };
      }
    }
    else if (data.startsWith("bl_remove_")) {
      if (!isAdmin) {
        await tgApi('answerCallbackQuery', { 
          callback_query_id: callbackQuery.id, 
          text: "⛔️ دسترسی ندارید!", 
          show_alert: true 
        });
        return res.status(200).send('OK');
      }

      const itemId = data.replace("bl_remove_", "");
      const success = await removeFromBlacklist(itemId);
      
      if (success) {
        newText = "✅ از بلک‌لیست حذف شد.";
        await tgApi('answerCallbackQuery', { 
          callback_query_id: callbackQuery.id, 
          text: "✅ حذف شد", 
          show_alert: false 
        });
      } else {
        newText = "❌ خطا در حذف!";
      }
      
      newMarkup = {
        inline_keyboard: [[{ text: "🔙 بازگشت", callback_data: "blacklist_manage" }]]
      };
    }
    // مدیریت گروه‌ها
    else if (data === "admin_manage") {
      if (!isAdmin) {
        await tgApi('answerCallbackQuery', { 
          callback_query_id: callbackQuery.id, 
          text: "⛔️ دسترسی ندارید!", 
          show_alert: true 
        });
        return res.status(200).send('OK');
      }

      const groups = await getAllGroupsFromKV();
      
      if (groups.length === 0) {
        newText = "📋 *مدیریت گروه‌ها*\n\n❌ هیچ گروهی ثبت نشده.";
        newMarkup = {
          inline_keyboard: [[{ text: "🔙 بازگشت", callback_data: "main_menu" }]]
        };
      } else {
        newText = `📋 *مدیریت گروه‌ها*\n\n✅ تعداد: ${groups.length}`;
        
        const groupButtons = groups.slice(0, 10).map(g => [{
          text: `📍 ${g.title}`,
          callback_data: `view_${g.id}`
        }]);
        
        newMarkup = {
          inline_keyboard: [
            ...groupButtons,
            [{ text: "🔙 بازگشت", callback_data: "main_menu" }]
          ]
        };
      }
    }
    else if (data.startsWith("view_")) {
      if (!isAdmin) {
        await tgApi('answerCallbackQuery', { 
          callback_query_id: callbackQuery.id, 
          text: "⛔️ دسترسی ندارید!", 
          show_alert: true 
        });
        return res.status(200).send('OK');
      }

      const groupId = data.replace("view_", "");
      const groups = await getAllGroupsFromKV();
      const group = groups.find(g => g.id.toString() === groupId);

      if (!group) {
        newText = "❌ گروه یافت نشد!";
        newMarkup = {
          inline_keyboard: [[{ text: "🔙 بازگشت", callback_data: "admin_manage" }]]
        };
      } else {
        newText = `📊 *اطلاعات گروه*\n\n📌 نام: ${group.title}\n🆔 شناسه: \`${group.id}\``;
        
        newMarkup = {
          inline_keyboard: [
            [{ text: "🗑 خروج از گروه", callback_data: `delete_${groupId}` }],
            [{ text: "🔙 بازگشت", callback_data: "admin_manage" }]
          ]
        };
      }
    }
    else if (data.startsWith("delete_")) {
      if (!isAdmin) {
        await tgApi('answerCallbackQuery', { 
          callback_query_id: callbackQuery.id, 
          text: "⛔️ دسترسی ندارید!", 
          show_alert: true 
        });
        return res.status(200).send('OK');
      }

      const groupId = data.replace("delete_", "");
      
      newText = `⚠️ *تایید خروج*\n\nآیا مطمئن هستید؟`;
      newMarkup = {
        inline_keyboard: [
          [
            { text: "✅ بله", callback_data: `confirm_delete_${groupId}` },
            { text: "❌ خیر", callback_data: `view_${groupId}` }
          ]
        ]
      };
    }
    else if (data.startsWith("confirm_delete_")) {
      if (!isAdmin) {
        await tgApi('answerCallbackQuery', { 
          callback_query_id: callbackQuery.id, 
          text: "⛔️ دسترسی ندارید!", 
          show_alert: true 
        });
        return res.status(200).send('OK');
      }

      const groupId = data.replace("confirm_delete_", "");
      
      const leaveRes = await tgApi('leaveChat', { chat_id: parseInt(groupId) });
      
      if (leaveRes) {
        const leaveData = await leaveRes.json();
        
        if (leaveData.ok) {
          await removeGroupFromKV(groupId);
          newText = "✅ ربات از گروه خارج شد.";
          await tgApi('answerCallbackQuery', { 
            callback_query_id: callbackQuery.id, 
            text: "✅ خارج شد", 
            show_alert: false 
          });
        } else {
          newText = `❌ خطا: ${leaveData.description || 'نامشخص'}`;
          await removeGroupFromKV(groupId);
        }
      } else {
        newText = "❌ خطا در ارتباط!";
      }
      
      newMarkup = {
        inline_keyboard: [[{ text: "🔙 بازگشت", callback_data: "admin_manage" }]]
      };
    }

    if (newText !== "") {
      await tgApi('editMessageText', { 
        chat_id: chatId, 
        message_id: messageId, 
        text: newText, 
        parse_mode: "Markdown", 
        reply_markup: newMarkup 
      });
    }
    await tgApi('answerCallbackQuery', { callback_query_id: callbackQuery.id });
    return res.status(200).send('OK');
  }

  // ==========================================
  // Message Handler
  // ==========================================
  const message = req.body.message || req.body.channel_post;
  if (!message) return res.status(200).send('OK');

  const chatId = message.chat.id;
  const messageId = message.message_id;
  const text = message.text || "";
  const isGroup = message.chat.type !== 'private';
  const userId = message.from ? message.from.id : null;
  const isAdmin = ADMIN_IDS.includes(userId);

  console.log('Message received:', { chatId, userId, text: text.substring(0, 50), isGroup, isAdmin });

  // ذخیره گروه
  if (isGroup && message.chat.title) {
    await saveGroupToKV(chatId, message.chat.title, message.chat.username);
  }

  // حذف پیام‌های ورود/خروج
  if (message.new_chat_members || message.left_chat_member) {
    await tgApi('deleteMessage', { chat_id: chatId, message_id: messageId });
    return res.status(200).send('OK');
  }

  // بررسی معافیت
  const senderChatId = message.sender_chat ? message.sender_chat.id : null;
  const isUserWhitelisted = userId ? await isInWhitelist(userId) : false;
  const isSenderWhitelisted = senderChatId ? await isInWhitelist(senderChatId) : false;
  const isChatWhitelisted = chatId ? await isInWhitelist(chatId) : false;
  
  const isExempt = 
    isUserWhitelisted ||
    isSenderWhitelisted ||
    isChatWhitelisted ||
    userId === 777000 || 
    message.is_automatic_forward || 
    req.body.channel_post ||
    ADMIN_IDS.includes(userId);

  // بررسی بلک‌لیست فوروارد
  if (isGroup && !isExempt) {
    let shouldDelete = false;
    let blacklistedSource = null;

    if (message.forward_from_chat) {
      const forwardFromId = message.forward_from_chat.id;
      const isBlacklisted = await isInBlacklist(forwardFromId);
      
      if (isBlacklisted) {
        shouldDelete = true;
        blacklistedSource = message.forward_from_chat.title || 'منبع بلک‌لیست شده';
      }
    }
    
    if (message.forward_from) {
      const forwardFromId = message.forward_from.id;
      const isBlacklisted = await isInBlacklist(forwardFromId);
      
      if (isBlacklisted) {
        shouldDelete = true;
        const firstName = message.forward_from.first_name || '';
        const lastName = message.forward_from.last_name || '';
        blacklistedSource = `${firstName} ${lastName}`.trim() || 'کاربر بلک‌لیست شده';
      }
    }

    if (shouldDelete) {
      await tgApi('deleteMessage', { chat_id: chatId, message_id: messageId });
      
      const warnRes = await tgApi('sendMessage', { 
        chat_id: chatId, 
        text: `🚫 پیام حذف شد\n\nارسال محتوا از ${blacklistedSource} ممنوع است.`,
        parse_mode: "Markdown"
      });
      
      const warnData = await warnRes.json();
      if (warnData.ok) {
        await sleep(5000);
        await tgApi('deleteMessage', { chat_id: chatId, message_id: warnData.result.message_id });
      }
      
      return res.status(200).send('OK');
    }
  }

  // دستورات ادمین - وایت‌لیست
  if (!isGroup && isAdmin && text.startsWith('/wl')) {
    const args = text.split(' ');
    
    if (args.length > 1) {
      const target = args[1];
      
      if (/^-?\d+$/.test(target)) {
        const targetId = parseInt(target);
        const targetType = targetId < 0 ? 'group' : 'user';
        const success = await addToWhitelist(targetId, `ID: ${targetId}`, targetType, null);
        
        if (success) {
          await tgApi('sendMessage', {
            chat_id: chatId,
            text: `✅ به وایت‌لیست اضافه شد!\n\n🆔 ${targetId}`,
            parse_mode: "Markdown"
          });
        }
      } else if (target.startsWith('@')) {
        const userInfo = await getUserInfo(target);
        if (userInfo) {
          const success = await addToWhitelist(userInfo.id, userInfo.name, userInfo.type, userInfo.username);
          if (success) {
            await tgApi('sendMessage', {
              chat_id: chatId,
              text: `✅ به وایت‌لیست اضافه شد!\n\n📌 ${userInfo.name}\n🆔 ${userInfo.id}`,
              parse_mode: "Markdown"
            });
          }
        } else {
          await tgApi('sendMessage', {
            chat_id: chatId,
            text: `❌ ${target} یافت نشد!`,
            parse_mode: "Markdown"
          });
        }
      }
      return res.status(200).send('OK');
    }
  }

  // افزودن به بلک‌لیست - فوروارد
  if (!isGroup && isAdmin && message.forward_from_chat) {
    const id = message.forward_from_chat.id;
    const name = message.forward_from_chat.title || message.forward_from_chat.username || 'نامشخص';
    const type = message.forward_from_chat.type;
    const username = message.forward_from_chat.username || null;
    
    const success = await addToBlacklist(id, name, type, username);
    
    if (success) {
      await tgApi('sendMessage', {
        chat_id: chatId,
        text: `✅ به بلک‌لیست اضافه شد!\n\n📌 ${name}\n🆔 \`${id}\``,
        parse_mode: "Markdown"
      });
    }
    return res.status(200).send('OK');
  }

  if (!isGroup && isAdmin && message.forward_from) {
    const id = message.forward_from.id;
    const firstName = message.forward_from.first_name || '';
    const lastName = message.forward_from.last_name || '';
    const name = `${firstName} ${lastName}`.trim();
    const username = message.forward_from.username || null;
    
    const success = await addToBlacklist(id, name, 'user', username);
    
    if (success) {
      await tgApi('sendMessage', {
        chat_id: chatId,
        text: `✅ به بلک‌لیست اضافه شد!\n\n👤 ${name}\n🆔 \`${id}\``,
        parse_mode: "Markdown"
      });
    }
    return res.status(200).send('OK');
  }

  // افزودن با یوزرنیم/آیدی
  if (!isGroup && isAdmin && text && text.startsWith('@') && text.length > 1) {
    const username = text.trim();
    const userInfo = await getUserInfo(username);
    
    if (userInfo) {
      const success = await addToBlacklist(userInfo.id, userInfo.name, userInfo.type, userInfo.username);
      
      if (success) {
        await tgApi('sendMessage', {
          chat_id: chatId,
          text: `✅ به بلک‌لیست اضافه شد!\n\n📌 ${userInfo.name}\n🆔 \`${userInfo.id}\``,
          parse_mode: "Markdown"
        });
      }
    } else {
      await tgApi('sendMessage', {
        chat_id: chatId,
        text: `❌ ${username} یافت نشد!`,
        parse_mode: "Markdown"
      });
    }
    return res.status(200).send('OK');
  }

  if (!isGroup && isAdmin && text && /^-?\d+$/.test(text.trim())) {
    const targetId = parseInt(text.trim());
    const targetType = targetId < 0 ? 'group' : 'user';
    const success = await addToBlacklist(targetId, `ID: ${targetId}`, targetType, null);
    
    if (success) {
      await tgApi('sendMessage', {
        chat_id: chatId,
        text: `✅ به بلک‌لیست اضافه شد!\n\n🆔 \`${targetId}\``,
        parse_mode: "Markdown"
      });
    }
    return res.status(200).send('OK');
  }

  // دستور /start
  if (text === "/start" || text === "/start@your_bot_username") {
    console.log('Processing /start command');
    
    if (isGroup) {
      await tgApi('deleteMessage', { chat_id: chatId, message_id: messageId });
    }
    
    const keyboard = isAdmin 
      ? [
          [{ text: "📋 منوی اصلی" }], 
          [{ text: "⚙️ مدیریت گروه‌ها" }],
          [{ text: "🚫 بلک‌لیست" }, { text: "✅ وایت‌لیست" }]
        ]
      : [[{ text: "📋 منوی اصلی" }]];
    
    let welcomeText = `👋 *خوش آمدید!*\n\n`;
    if (isAdmin) {
      welcomeText += `🔑 شما ادمین هستید.\n\n`;
      welcomeText += `✅ وایت‌لیست: \`/wl آیدی\` یا \`/wl @username\`\n`;
      welcomeText += `🚫 بلک‌لیست: فوروارد کنید یا آیدی بفرستید\n\n`;
    }
    welcomeText += `از دکمه‌های زیر استفاده کنید:`;
    
    await tgApi('sendMessage', { 
      chat_id: chatId, 
      text: welcomeText, 
      parse_mode: "Markdown",
      reply_markup: { keyboard, resize_keyboard: true } 
    });
    return res.status(200).send('OK');
  }

  // دستور /menu
  if (text === "/menu" || text === "منو" || text === "📋 منوی اصلی") {
    console.log('Processing /menu command');
    
    if (isGroup) {
      await tgApi('deleteMessage', { chat_id: chatId, message_id: messageId });
    }
    
    const adminButtons = isAdmin ? [
      [{ text: "⚙️ مدیریت گروه‌ها", callback_data: "admin_manage" }],
      [{ text: "🚫 بلک‌لیست", callback_data: "blacklist_manage" }, { text: "✅ وایت‌لیست", callback_data: "whitelist_manage" }]
    ] : [];
    
    await tgApi('sendMessage', {
      chat_id: chatId, 
      text: "📌 *منوی اصلی مجموعه‌ها*\n\nلطفاً یکی از گزینه‌های زیر را انتخاب کنید:", 
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "📢 کانال های ما", callback_data: "menu_channels" }],
          [{ text: "👥 گروه های ما", callback_data: "menu_groups" }],
          [{ text: "📞 گروه های ارتباط", callback_data: "menu_contact" }],
          [{ text: "📜 قوانین", callback_data: "menu_rules" }],
          [{ text: "💬 گفت‌وگو با ربات", callback_data: "menu_chat" }],
          ...adminButtons
        ]
      }
    });
    return res.status(200).send('OK');
  }

  // سیستم امنیتی
  if (!isExempt && isGroup) {
    let isSpam = false;
    let warningMessage = "";

    if (KV_URL && KV_TOKEN) {
        let uniqueKey = null;

        if (text && text.length > 10) {
            uniqueKey = "text_" + text.substring(0, 50).replace(/\s/g, '');
        } else if (message.photo) {
            uniqueKey = "media_" + message.photo[message.photo.length - 1].file_unique_id;
        } else if (message.video) {
            uniqueKey = "media_" + message.video.file_unique_id;
        }

        if (uniqueKey) {
            try {
              const checkRes = await fetch(`${KV_URL}/get/${encodeURIComponent(uniqueKey)}`, { 
                headers: { Authorization: `Bearer ${KV_TOKEN}` } 
              });
              const checkData = await checkRes.json();
              if (checkData.result !== null) {
                isSpam = true;
                warningMessage = `⚠️ ارسال پیام تکراری (اسپم) ممنوع است!`;
              } else {
                await fetch(`${KV_URL}/set/${encodeURIComponent(uniqueKey)}/1/EX/86400`, { 
                  headers: { Authorization: `Bearer ${KV_TOKEN}` } 
                });
              }
            } catch (e) {}
        }
    }

    const badWordsRaw = ["گوه نخور", "جنده", "کونی", "شاشزاده", "کون", "کص", "کسکش", "کوسکش", "کوصکش", "کصکش", "کیر", "کوس"];
    const hasBadWord = text ? badWordsRaw.some(w => text.includes(w)) : false;
    const linkRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-zA-Z0-9-]+\.[a-zA-Z]{2,})|(@[a-zA-Z0-9_]+)/i;
    const hasLink = text ? linkRegex.test(text) : false;

    if (hasBadWord || hasLink) {
        isSpam = true;
        warningMessage = hasLink 
          ? `⚠️ ارسال لینک و تبلیغات ممنوع است!` 
          : `⚠️ استفاده از کلمات نامناسب ممنوع است!`;
    }

    if (isSpam) {
      await tgApi('deleteMessage', { chat_id: chatId, message_id: messageId });
      
      let warnRes = await tgApi('sendMessage', { chat_id: chatId, text: warningMessage });
      let warnData = await warnRes.json();
      
      if (warnData.ok) {
        await sleep(7000); 
        await tgApi('deleteMessage', { chat_id: chatId, message_id: warnData.result.message_id });
      }
      return res.status(200).send('OK');
    }
  }

  res.status(200).send('OK');
}
