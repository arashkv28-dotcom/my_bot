export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('Bot is running on Vercel!');
  if (!req.body) return res.status(200).send('OK');
  
  const BOT_TOKEN = process.env.BOT_TOKEN;
  const ADMIN_IDS = process.env.ADMIN_IDS 
    ? process.env.ADMIN_IDS.split(',').map(id => parseInt(id.trim())) 
    : [];

  const FAQ_ANSWERS = {
    faq_1: "🔹 *مجموعه شما چیست؟*\n\n*ما مجموعه‌ای شامل چند کانال و گروه هستیم که حول محور اندیشه پهلویسم، مسائل روز، اخبار، و مباحث مرتبط سیاسی فعالیت می‌کنند. از طریق منوی اصلی می‌تونید به همه‌ی کانال‌ها و گروه‌های ما دسترسی داشته باشید.*",
    faq_2: "🔹 *کانال‌ها کدام‌اند؟*\n\n*برای دیدن لیست کامل کانال‌های ما به بخش «📢 کانال های ما» در منوی اصلی مراجعه کنید.*",
    faq_3: "🔹 *گروه‌ها کدام‌اند؟*\n\n*برای دیدن لیست کامل گروه‌های ما به بخش «👥 گروه های ما» در منوی اصلی مراجعه کنید.*",
    faq_4: "🔹 *چطور ارتباط بگیرم؟*\n\n*می‌تونید از بخش «📞 گروه های ارتباط» در منوی اصلی استفاده کنید، یا از همین قسمت گزینه‌ی «📩 ارتباط با ما» رو انتخاب کنید تا مستقیماً به گروه‌های پشتیبانی وصل بشید.*",
    faq_5: "🔹 *قوانین چیست؟*\n\n*۱. استفاده از کلمات رکیک و توهین ممنوع است.\n۲. ارسال هرگونه لینک و تبلیغات اکیداً ممنوع است.\n۳. سیستم به صورت خودکار پیام‌های تکراری و لینک‌ها را حذف می‌کند.\n۴. لطفاً نظم گروه را رعایت کنید.*"
  };

  const tgApi = async (method, body) => {
    try {
      const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
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
  // 🚫 توابع مدیریت بلک‌لیست
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
      console.error('removeFromBlacklist error:', e);
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
      console.error('getAllBlacklist error:', e);
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
      console.error('getUserInfo error:', e);
      return null;
    }
  };

  // ==========================================
  // 📊 توابع مدیریت گروه‌ها
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
    } catch (e) {
      console.error('saveGroupToKV error:', e);
    }
  };

  const removeGroupFromKV = async (chatId) => {
    if (!KV_URL || !KV_TOKEN) return;
    try {
      await fetch(`${KV_URL}/del/group_${chatId}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
      });
    } catch (e) {
      console.error('removeGroupFromKV error:', e);
    }
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
      console.error('getAllGroupsFromKV error:', e);
      return [];
    }
  };

  // ==========================================
  // 🎛️ Callback Query Handler
  // ==========================================
  if (req.body.callback_query) {
    const callbackQuery = req.body.callback_query;
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const data = callbackQuery.data;
    const userId = callbackQuery.from.id;

    let newText = "";
    let newMarkup = {};

    const isAdmin = ADMIN_IDS.includes(userId);

    if (data === "main_menu") {
      newText = "📌 *منوی اصلی مجموعه‌ها*\nلطفاً یکی از گزینه‌های زیر را انتخاب کنید:";
      newMarkup = {
        inline_keyboard: [
          [{ text: "📢 کانال های ما", callback_data: "menu_channels" }],
          [{ text: "👥 گروه های ما", callback_data: "menu_groups" }],
          [{ text: "📞 گروه های ارتباط", callback_data: "menu_contact" }],
          [{ text: "📜 قوانین", callback_data: "menu_rules" }],
          [{ text: "💬 گفت‌وگو با ربات", callback_data: "menu_chat" }],
          ...(isAdmin ? [
            [{ text: "⚙️ مدیریت گروه‌ها", callback_data: "admin_manage" }],
            [{ text: "🚫 مدیریت بلک‌لیست", callback_data: "blacklist_manage" }]
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
      newText = "📜 *قوانین و مقررات:*\n\n*۱. استفاده از کلمات رکیک و توهین ممنوع است.\n۲. ارسال هرگونه لینک و تبلیغات اکیداً ممنوع است.\n۳. سیستم به صورت خودکار پیام‌های تکراری و لینک‌ها را حذف می‌کند.\n۴. لطفاً نظم گروه را رعایت کنید.*";
      newMarkup = {
        inline_keyboard: [[{ text: "🔙 بازگشت", callback_data: "main_menu" }]]
      };
    }
    else if (data === "menu_chat") {
      newText = "💬 *گفت‌وگو با ربات*\nچطور می‌تونم کمکتون کنم؟";
      newMarkup = {
        inline_keyboard: [
          [{ text: "❓ سوالات متداول", callback_data: "menu_faq" }],
          [{ text: "📩 ارتباط با ما", callback_data: "menu_contactus" }],
          [{ text: "🔙 بازگشت", callback_data: "main_menu" }]
        ]
      };
    }
    else if (data === "menu_faq") {
      newText = "❓ *سوالات متداول*\nیکی از سوالات زیر رو انتخاب کنید:";
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
      newText = "📩 *ارتباط با ما*\n\n*برای ارتباط با ادمین‌ها و مدیریت مجموعه، لطفاً روی یکی از دکمه‌های زیر کلیک کنید و در گروه مربوطه پیام خود را مطرح کنید:*";
      newMarkup = {
        inline_keyboard: [
          [{ text: "ارتباط اندیشه پهلویسم", url: "https://t.me/+aaJQcUU7ZIMyZWQ8" }],
          [{ text: "ارتباط فرو پاشی", url: "https://t.me/+GZOW85iRkX45ODJi" }],
          [{ text: "🔙 بازگشت", callback_data: "menu_chat" }]
        ]
      };
    }
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
        newText = "🚫 *مدیریت بلک‌لیست*\n\n❌ *لیست خالی است.*\n\n📝 *روش‌های افزودن:*\n\n*۱. فوروارد پیام:* پیامی از کاربر/کانال/گروه فوروارد کنید\n\n*۲. آیدی عددی:* عدد بفرستید\n`123456789` (کاربر)\n`-1001234567890` (گروه/کانال)\n\n*۳. یوزرنیم:* با @ بفرستید\n`@username`";
        newMarkup = {
          inline_keyboard: [[{ text: "🔙 بازگشت به منو", callback_data: "main_menu" }]]
        };
      } else {
        const users = blacklist.filter(item => item.type === 'user');
        const channels = blacklist.filter(item => item.type === 'channel');
        const groups = blacklist.filter(item => item.type === 'group' || item.type === 'supergroup');
        
        newText = `🚫 *مدیریت بلک‌لیست*\n\n`;
        newText += `👤 *کاربران:* ${users.length}\n`;
        newText += `📢 *کانال‌ها:* ${channels.length}\n`;
        newText += `👥 *گروه‌ها:* ${groups.length}\n`;
        newText += `📊 *مجموع:* ${blacklist.length}\n\n`;
        newText += `_روی هر آیتم کلیک کنید:_`;
        
        const blacklistButtons = blacklist.map(item => {
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
            [{ text: "🔙 بازگشت به منو", callback_data: "main_menu" }]
          ]
        };
      }
    }
    else if (data.startsWith("bl_view_")) {
      if (!isAdmin) {
        await tgApi('answerCallbackQuery', { 
          callback_query_id: callbackQuery.id, 
          text: "⛔️ شما دسترسی ادمین ندارید!", 
          show_alert: true 
        });
        return res.status(200).send('OK');
      }

      const itemId = data.replace("bl_view_", "");
      const blacklist = await getAllBlacklist();
      const item = blacklist.find(b => b.id.toString() === itemId);

      if (!item) {
        newText = "❌ *آیتم مورد نظر یافت نشد!*";
        newMarkup = {
          inline_keyboard: [[{ text: "🔙 بازگشت به لیست", callback_data: "blacklist_manage" }]]
        };
      } else {
        const addDate = new Date(item.addedAt).toLocaleString('fa-IR', { timeZone: 'Asia/Tehran' });
        let typeIcon = '🚫';
        let typeName = 'نامشخص';
        
        if (item.type === 'user') {
          typeIcon = '👤';
          typeName = 'کاربر';
        } else if (item.type === 'channel') {
          typeIcon = '📢';
          typeName = 'کانال';
        } else if (item.type === 'group' || item.type === 'supergroup') {
          typeIcon = '👥';
          typeName = 'گروه';
        }
        
        newText = `${typeIcon} *جزئیات بلک‌لیست*\n\n`;
        newText += `📝 *نوع:* ${typeName}\n`;
        newText += `📌 *نام:* ${item.name || 'نامشخص'}\n`;
        newText += `🆔 *شناسه:* \`${item.id}\`\n`;
        newText += `👤 *یوزرنیم:* ${item.username ? '@' + item.username : '❌ ندارد'}\n`;
        newText += `📅 *تاریخ افزودن:* ${addDate}\n\n`;
        
        if (item.type === 'user') {
          newText += `⚠️ *هر پیام فوروارد شده از این کاربر حذف می‌شود.*`;
        } else {
          newText += `⚠️ *هر پیام فوروارد شده از این ${typeName} حذف می‌شود.*`;
        }
        
        newMarkup = {
          inline_keyboard: [
            [{ text: "🗑 حذف از بلک‌لیست", callback_data: `bl_remove_${itemId}` }],
            [{ text: "🔙 بازگشت به لیست", callback_data: "blacklist_manage" }]
          ]
        };
      }
    }
    else if (data.startsWith("bl_remove_")) {
      if (!isAdmin) {
        await tgApi('answerCallbackQuery', { 
          callback_query_id: callbackQuery.id, 
          text: "⛔️ شما دسترسی ادمین ندارید!", 
          show_alert: true 
        });
        return res.status(200).send('OK');
      }

      const itemId = data.replace("bl_remove_", "");
      const success = await removeFromBlacklist(itemId);
      
      if (success) {
        newText = "✅ *عملیات موفق*\n\n*آیتم از بلک‌لیست حذف شد.*";
        await tgApi('answerCallbackQuery', { 
          callback_query_id: callbackQuery.id, 
          text: "✅ از بلک‌لیست حذف شد", 
          show_alert: false 
        });
      } else {
        newText = "❌ *خطا در حذف از بلک‌لیست*";
      }
      
      newMarkup = {
        inline_keyboard: [[{ text: "🔙 بازگشت به لیست", callback_data: "blacklist_manage" }]]
      };
    }
    else if (data === "admin_manage") {
      if (!isAdmin) {
        await tgApi('answerCallbackQuery', { 
          callback_query_id: callbackQuery.id, 
          text: "⛔️ شما دسترسی ادمین ندارید!", 
          show_alert: true 
        });
        return res.status(200).send('OK');
      }

      const groups = await getAllGroupsFromKV();
      
      if (groups.length === 0) {
        newText = "📋 *مدیریت گروه‌ها*\n\n❌ *هیچ گروهی ثبت نشده است.*\n\n_ربات را به گروه‌های مورد نظر اضافه کنید تا اینجا لیست شوند._";
        newMarkup = {
          inline_keyboard: [[{ text: "🔙 بازگشت به منو", callback_data: "main_menu" }]]
        };
      } else {
        newText = `📋 *مدیریت گروه‌ها*\n\n✅ *تعداد گروه‌های ثبت شده:* ${groups.length}\n\n_روی هر گروه کلیک کنید:_`;
        
        const groupButtons = groups.map(g => [{
          text: `📍 ${g.title}`,
          callback_data: `view_${g.id}`
        }]);
        
        newMarkup = {
          inline_keyboard: [
            ...groupButtons,
            [{ text: "🔙 بازگشت به منو", callback_data: "main_menu" }]
          ]
        };
      }
    }
    else if (data.startsWith("view_")) {
      if (!isAdmin) {
        await tgApi('answerCallbackQuery', { 
          callback_query_id: callbackQuery.id, 
          text: "⛔️ شما دسترسی ادمین ندارید!", 
          show_alert: true 
        });
        return res.status(200).send('OK');
      }

      const groupId = data.replace("view_", "");
      const groups = await getAllGroupsFromKV();
      const group = groups.find(g => g.id.toString() === groupId);

      if (!group) {
        newText = "❌ *گروه مورد نظر یافت نشد!*";
        newMarkup = {
          inline_keyboard: [[{ text: "🔙 بازگشت به لیست", callback_data: "admin_manage" }]]
        };
      } else {
        const joinDate = new Date(group.joinedAt).toLocaleString('fa-IR', { timeZone: 'Asia/Tehran' });
        newText = `📊 *اطلاعات گروه*\n\n`;
        newText += `📌 *نام گروه:* ${group.title}\n`;
        newText += `🆔 *شناسه:* \`${group.id}\`\n`;
        newText += `👤 *یوزرنیم:* ${group.username ? '@' + group.username : '❌ ندارد'}\n`;
        newText += `📅 *تاریخ عضویت:* ${joinDate}`;
        
        newMarkup = {
          inline_keyboard: [
            [{ text: "🗑 حذف و خروج از گروه", callback_data: `delete_${groupId}` }],
            [{ text: "🔙 بازگشت به لیست", callback_data: "admin_manage" }]
          ]
        };
      }
    }
    else if (data.startsWith("delete_")) {
      if (!isAdmin) {
        await tgApi('answerCallbackQuery', { 
          callback_query_id: callbackQuery.id, 
          text: "⛔️ شما دسترسی ادمین ندارید!", 
          show_alert: true 
        });
        return res.status(200).send('OK');
      }

      const groupId = data.replace("delete_", "");
      
      newText = `⚠️ *تایید حذف*\n\n*آیا مطمئن هستید که می‌خواهید ربات را از این گروه خارج کنید؟*\n\n_این عملیات غیرقابل بازگشت است!_`;
      newMarkup = {
        inline_keyboard: [
          [
            { text: "✅ بله، خارج شو", callback_data: `confirm_delete_${groupId}` },
            { text: "❌ انصراف", callback_data: `view_${groupId}` }
          ]
        ]
      };
    }
    else if (data.startsWith("confirm_delete_")) {
      if (!isAdmin) {
        await tgApi('answerCallbackQuery', { 
          callback_query_id: callbackQuery.id, 
          text: "⛔️ شما دسترسی ادمین ندارید!", 
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
          newText = "✅ *عملیات موفق*\n\n*ربات با موفقیت از گروه خارج شد و از لیست حذف گردید.*";
          await tgApi('answerCallbackQuery', { 
            callback_query_id: callbackQuery.id, 
            text: "✅ ربات از گروه خارج شد", 
            show_alert: false 
          });
        } else {
          newText = `❌ *خطا در خروج از گروه*\n\n\`${leaveData.description || 'خطای نامشخص'}\``;
          await removeGroupFromKV(groupId);
        }
      } else {
        newText = "❌ *خطا در ارتباط با سرور تلگرام*";
      }
      
      newMarkup = {
        inline_keyboard: [[{ text: "🔙 بازگشت به لیست", callback_data: "admin_manage" }]]
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
  // 🛡️ Message Handler
  // ==========================================
  const message = req.body.message || req.body.channel_post;
  if (!message) return res.status(200).send('OK');

  const chatId = message.chat.id;
  const messageId = message.message_id;
  const text = message.text || "";
  const isGroup = message.chat.type !== 'private';
  const userId = message.from ? message.from.id : null;
  const isAdmin = ADMIN_IDS.includes(userId);

  // ذخیره اطلاعات گروه جدید
  if (isGroup && message.chat.title) {
    await saveGroupToKV(chatId, message.chat.title, message.chat.username);
  }

  // حذف پیام‌های ورود و خروج
  if (message.new_chat_members || message.left_chat_member) {
    await tgApi('deleteMessage', { chat_id: chatId, message_id: messageId });
    return res.status(200).send('OK');
  }

  // ==========================================
  // ✅ تعریف WHITELIST و بررسی معافیت - اول از همه!
  // ==========================================
  const WHITELIST_IDS = [
    1001977073229, 1922419923, 6990025961, 96431648, 
    -1001678007720, 8934796975, 5443017337, 8097212518, 6604010059, 
    7452439235, 8108599040, 6491888510, 7738331590, 
    -1002103959267, -1002080075722, -1002425222777,
    1528824508
  ];
  
  const senderChatId = message.sender_chat ? message.sender_chat.id : null;
  
  // بررسی معافیت از تمام سیستم‌های امنیتی
  const isExempt = 
    WHITELIST_IDS.includes(userId) || 
    WHITELIST_IDS.includes(senderChatId) || 
    WHITELIST_IDS.includes(chatId) || // اضافه کردن chatId برای گروه‌های وایت‌لیست
    userId === 777000 || 
    message.is_automatic_forward || 
    req.body.channel_post ||
    ADMIN_IDS.includes(userId); // ادمین‌ها هم معاف

  console.log('Security Check:', {
    userId,
    senderChatId,
    chatId,
    isExempt,
    isWhitelistedUser: WHITELIST_IDS.includes(userId),
    isWhitelistedSender: WHITELIST_IDS.includes(senderChatId),
    isWhitelistedChat: WHITELIST_IDS.includes(chatId)
  });

  // ==========================================
  // 🚫 بررسی فوروارد از بلک‌لیست (فقط برای افراد غیرمعاف)
  // ==========================================
  if (isGroup && !isExempt) {
    let shouldDelete = false;
    let blacklistedSource = null;

    // بررسی فوروارد از کانال/گروه
    if (message.forward_from_chat) {
      const forwardFromId = message.forward_from_chat.id;
      const isBlacklisted = await isInBlacklist(forwardFromId);
      
      if (isBlacklisted) {
        shouldDelete = true;
        blacklistedSource = message.forward_from_chat.title || message.forward_from_chat.username || 'منبع بلک‌لیست شده';
      }
    }
    
    // بررسی فوروارد از کاربر
    if (message.forward_from) {
      const forwardFromId = message.forward_from.id;
      const isBlacklisted = await isInBlacklist(forwardFromId);
      
      if (isBlacklisted) {
        shouldDelete = true;
        const firstName = message.forward_from.first_name || '';
        const lastName = message.forward_from.last_name || '';
        blacklistedSource = `${firstName} ${lastName}`.trim() || message.forward_from.username || 'کاربر بلک‌لیست شده';
      }
    }

    if (shouldDelete) {
      await tgApi('deleteMessage', { chat_id: chatId, message_id: messageId });
      
      const warnRes = await tgApi('sendMessage', { 
        chat_id: chatId, 
        text: `🚫 *پیام حذف شد*\n\nارسال محتوا از *${blacklistedSource}* ممنوع است.`,
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

  // ==========================================
  // 🔧 دستورات ادمین در پی‌وی
  // ==========================================
  
  if (!isGroup && isAdmin && message.forward_from_chat) {
    const forwardFromId = message.forward_from_chat.id;
    const forwardFromTitle = message.forward_from_chat.title || message.forward_from_chat.username || 'نامشخص';
    const forwardFromUsername = message.forward_from_chat.username || null;
    const forwardFromType = message.forward_from_chat.type;
    
    const alreadyBlacklisted = await isInBlacklist(forwardFromId);
    
    if (alreadyBlacklisted) {
      await tgApi('sendMessage', {
        chat_id: chatId,
        text: `⚠️ *این منبع قبلاً در بلک‌لیست وجود دارد!*\n\n📌 *عنوان:* ${forwardFromTitle}\n🆔 *شناسه:* \`${forwardFromId}\``,
        parse_mode: "Markdown"
      });
    } else {
      const success = await addToBlacklist(forwardFromId, forwardFromTitle, forwardFromType, forwardFromUsername);
      
      if (success) {
        let typeIcon = '🚫';
        if (forwardFromType === 'channel') typeIcon = '📢';
        else if (forwardFromType === 'group' || forwardFromType === 'supergroup') typeIcon = '👥';
        
        await tgApi('sendMessage', {
          chat_id: chatId,
          text: `✅ *به بلک‌لیست اضافه شد!*\n\n${typeIcon} *نوع:* ${forwardFromType === 'channel' ? 'کانال' : 'گروه'}\n📌 *عنوان:* ${forwardFromTitle}\n🆔 *شناسه:* \`${forwardFromId}\`\n👤 *یوزرنیم:* ${forwardFromUsername ? '@' + forwardFromUsername : '❌'}\n\n_از این پس تمام پیام‌های فوروارد شده از این منبع حذف خواهند شد._`,
          parse_mode: "Markdown"
        });
      } else {
        await tgApi('sendMessage', {
          chat_id: chatId,
          text: "❌ *خطا در افزودن به بلک‌لیست!*",
          parse_mode: "Markdown"
        });
      }
    }
    return res.status(200).send('OK');
  }

  if (!isGroup && isAdmin && message.forward_from) {
    const forwardFromId = message.forward_from.id;
    const firstName = message.forward_from.first_name || '';
    const lastName = message.forward_from.last_name || '';
    const forwardFromName = `${firstName} ${lastName}`.trim() || 'کاربر';
    const forwardFromUsername = message.forward_from.username || null;
    
    const alreadyBlacklisted = await isInBlacklist(forwardFromId);
    
    if (alreadyBlacklisted) {
      await tgApi('sendMessage', {
        chat_id: chatId,
        text: `⚠️ *این کاربر قبلاً در بلک‌لیست وجود دارد!*\n\n👤 *نام:* ${forwardFromName}\n🆔 *شناسه:* \`${forwardFromId}\``,
        parse_mode: "Markdown"
      });
    } else {
      const success = await addToBlacklist(forwardFromId, forwardFromName, 'user', forwardFromUsername);
      
      if (success) {
        await tgApi('sendMessage', {
          chat_id: chatId,
          text: `✅ *به بلک‌لیست اضافه شد!*\n\n👤 *نوع:* کاربر\n📌 *نام:* ${forwardFromName}\n🆔 *شناسه:* \`${forwardFromId}\`\n👤 *یوزرنیم:* ${forwardFromUsername ? '@' + forwardFromUsername : '❌'}\n\n_از این پس تمام پیام‌های فوروارد شده از این کاربر حذف خواهند شد._`,
          parse_mode: "Markdown"
        });
      } else {
        await tgApi('sendMessage', {
          chat_id: chatId,
          text: "❌ *خطا در افزودن به بلک‌لیست!*",
          parse_mode: "Markdown"
        });
      }
    }
    return res.status(200).send('OK');
  }

  if (!isGroup && isAdmin && text && text.startsWith('@') && text.length > 1) {
    const username = text.trim();
    const userInfo = await getUserInfo(username);
    
    if (!userInfo) {
      await tgApi('sendMessage', {
        chat_id: chatId,
        text: `❌ *کاربر/کانال/گروه با یوزرنیم ${username} یافت نشد!*\n\n_ممکن است یوزرنیم اشتباه باشد یا حساب پرایوت باشد._`,
        parse_mode: "Markdown"
      });
      return res.status(200).send('OK');
    }
    
    const alreadyBlacklisted = await isInBlacklist(userInfo.id);
    
    if (alreadyBlacklisted) {
      await tgApi('sendMessage', {
        chat_id: chatId,
        text: `⚠️ *این ${userInfo.type === 'user' ? 'کاربر' : (userInfo.type === 'channel' ? 'کانال' : 'گروه')} قبلاً در بلک‌لیست وجود دارد!*\n\n📌 *نام:* ${userInfo.name}\n🆔 *شناسه:* \`${userInfo.id}\``,
        parse_mode: "Markdown"
      });
    } else {
      const success = await addToBlacklist(userInfo.id, userInfo.name, userInfo.type, userInfo.username);
      
      if (success) {
        let typeIcon = '🚫';
        let typeName = 'نامشخص';
        if (userInfo.type === 'user') {
          typeIcon = '👤';
          typeName = 'کاربر';
        } else if (userInfo.type === 'channel') {
          typeIcon = '📢';
          typeName = 'کانال';
        } else if (userInfo.type === 'group' || userInfo.type === 'supergroup') {
          typeIcon = '👥';
          typeName = 'گروه';
        }
        
        await tgApi('sendMessage', {
          chat_id: chatId,
          text: `✅ *به بلک‌لیست اضافه شد!*\n\n${typeIcon} *نوع:* ${typeName}\n📌 *نام:* ${userInfo.name}\n🆔 *شناسه:* \`${userInfo.id}\`\n👤 *یوزرنیم:* @${userInfo.username}\n\n_از این پس تمام پیام‌های فوروارد شده از این ${typeName} حذف خواهند شد._`,
          parse_mode: "Markdown"
        });
      } else {
        await tgApi('sendMessage', {
          chat_id: chatId,
          text: "❌ *خطا در افزودن به بلک‌لیست!*",
          parse_mode: "Markdown"
        });
      }
    }
    return res.status(200).send('OK');
  }

  if (!isGroup && isAdmin && text && /^-?\d+$/.test(text.trim())) {
    const targetId = parseInt(text.trim());
    
    const alreadyBlacklisted = await isInBlacklist(targetId);
    
    if (alreadyBlacklisted) {
      await tgApi('sendMessage', {
        chat_id: chatId,
        text: `⚠️ *این آیدی قبلاً در بلک‌لیست وجود دارد!*\n\n🆔 *شناسه:* \`${targetId}\``,
        parse_mode: "Markdown"
      });
    } else {
      const targetType = targetId < 0 ? 'group' : 'user';
      const success = await addToBlacklist(targetId, `ID: ${targetId}`, targetType, null);
      
      if (success) {
        const typeIcon = targetType === 'user' ? '👤' : '👥';
        const typeName = targetType === 'user' ? 'کاربر' : 'گروه/کانال';
        
        await tgApi('sendMessage', {
          chat_id: chatId,
          text: `✅ *به بلک‌لیست اضافه شد!*\n\n${typeIcon} *نوع (تخمینی):* ${typeName}\n🆔 *شناسه:* \`${targetId}\`\n\n_از این پس تمام پیام‌های فوروارد شده از این منبع حذف خواهند شد._`,
          parse_mode: "Markdown"
        });
      } else {
        await tgApi('sendMessage', {
          chat_id: chatId,
          text: "❌ *خطا در افزودن به بلک‌لیست!*",
          parse_mode: "Markdown"
        });
      }
    }
    return res.status(200).send('OK');
  }

  if (text === "/start") {
    if (isGroup) await tgApi('deleteMessage', { chat_id: chatId, message_id: messageId });
    
    const keyboard = isAdmin 
      ? [
          [{ text: "📋 منوی اصلی" }], 
          [{ text: "⚙️ مدیریت گروه‌ها" }, { text: "🚫 بلک‌لیست" }]
        ]
      : [[{ text: "📋 منوی اصلی" }]];
    
    let welcomeText = `👋 *خوش آمدید!*\n\n`;
    if (isAdmin) {
      welcomeText += `🔑 *شما ادمین هستید.*\n\n`;
      welcomeText += `📝 *راهنمای افزودن به بلک‌لیست:*\n\n`;
      welcomeText += `*۱. فوروارد:* پیام کاربر/کانال/گروه رو فوروارد کنید\n`;
      welcomeText += `*۲. یوزرنیم:* \`@username\` بفرستید\n`;
      welcomeText += `*۳. آیدی عددی:*\n`;
      welcomeText += `   • کاربر: \`123456789\`\n`;
      welcomeText += `   • گروه/کانال: \`-1001234567890\`\n\n`;
    }
    welcomeText += `دکمه‌های دسترسی سریع فعال شد. 👇`;
    
    await tgApi('sendMessage', { 
      chat_id: chatId, 
      text: welcomeText, 
      parse_mode: "Markdown",
      reply_markup: { keyboard, resize_keyboard: true } 
    });
    return res.status(200).send('OK');
  }

  if (text === "/menu" || text === "منو" || text === "📋 منوی اصلی") {
    if (isGroup) await tgApi('deleteMessage', { chat_id: chatId, message_id: messageId });
    
    const adminButtons = isAdmin ? [
      [{ text: "⚙️ مدیریت گروه‌ها", callback_data: "admin_manage" }],
      [{ text: "🚫 مدیریت بلک‌لیست", callback_data: "blacklist_manage" }]
    ] : [];
    
    await tgApi('sendMessage', {
      chat_id: chatId, 
      text: "📌 *منوی اصلی مجموعه‌ها*\nلطفاً یکی از گزینه‌های زیر را انتخاب کنید:", 
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

  if ((text === "/blacklist" || text === "🚫 بلک‌لیست") && isAdmin) {
    if (isGroup) await tgApi('deleteMessage', { chat_id: chatId, message_id: messageId });
    
    const blacklist = await getAllBlacklist();
    
    let blacklistText = "";
    let blacklistMarkup = {};
    
    if (blacklist.length === 0) {
      blacklistText = "🚫 *مدیریت بلک‌لیست*\n\n❌ *لیست خالی است.*\n\n📝 *روش‌های افزودن:*\n\n*۱. فوروارد پیام*\n*۲. یوزرنیم:* `@username`\n*۳. آیدی عددی:* `123456789` یا `-1001234567890`";
      blacklistMarkup = {
        inline_keyboard: [[{ text: "🔙 بازگشت به منو", callback_data: "main_menu" }]]
      };
    } else {
      const users = blacklist.filter(item => item.type === 'user');
      const channels = blacklist.filter(item => item.type === 'channel');
      const groups = blacklist.filter(item => item.type === 'group' || item.type === 'supergroup');
      
      blacklistText = `🚫 *مدیریت بلک‌لیست*\n\n`;
      blacklistText += `👤 *کاربران:* ${users.length}\n`;
      blacklistText += `📢 *کانال‌ها:* ${channels.length}\n`;
      blacklistText += `👥 *گروه‌ها:* ${groups.length}\n`;
      blacklistText += `📊 *مجموع:* ${blacklist.length}\n\n`;
      blacklistText += `_روی هر آیتم کلیک کنید:_`;
      
      const blacklistButtons = blacklist.map(item => {
        let icon = '🚫';
        if (item.type === 'user') icon = '👤';
        else if (item.type === 'channel') icon = '📢';
        else if (item.type === 'group' || item.type === 'supergroup') icon = '👥';
        
        return [{
          text: `${icon} ${item.name || item.username || item.id}`,
          callback_data: `bl_view_${item.id}`
        }];
      });
      
      blacklistMarkup = {
        inline_keyboard: [
          ...blacklistButtons,
          [{ text: "🔙 بازگشت به منو", callback_data: "main_menu" }]
        ]
      };
    }
    
    await tgApi('sendMessage', {
      chat_id: chatId,
      text: blacklistText,
      parse_mode: "Markdown",
      reply_markup: blacklistMarkup
    });
    return res.status(200).send('OK');
  }

  // ==========================================
  // 🛡️ سیستم امنیتی (فقط برای افراد غیرمعاف)
  // ==========================================
  if (!isExempt && isGroup) {
    let isSpam = false;
    let warningMessage = "";

    // ۱. بررسی پیام‌های تکراری
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
                warningMessage = `⚠️ کاربر عزیز، ارسال پیام تکراری (اسپم) ممنوع است!`;
              } else {
                await fetch(`${KV_URL}/set/${encodeURIComponent(uniqueKey)}/1/EX/86400`, { 
                  headers: { Authorization: `Bearer ${KV_TOKEN}` } 
                });
              }
            } catch (e) { 
              console.error('Spam check error:', e);
            }
        }
    }

    // ۲. بررسی کلمات رکیک و لینک‌ها
    const badWordsRaw = ["گوه نخور", "جنده", "کونی", "شاشزاده", "کون", "کص", "سس خرسی", "تام مورلی", "کسکش", "کوسکش", "کوصکش", "کصکش", "کیر", "کوس"];
    const hasBadWord = text ? badWordsRaw.some(w => text.includes(w)) : false;
    const linkRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-zA-Z0-9-]+\.[a-zA-Z]{2,})|(@[a-zA-Z0-9_]+)/i;
    const hasLink = text ? linkRegex.test(text) : false;

    if (hasBadWord || hasLink) {
        isSpam = true;
        warningMessage = hasLink 
          ? `⚠️ ارسال لینک و تبلیغات در این گروه ممنوع است!` 
          : `⚠️ استفاده از کلمات نامناسب ممنوع است!`;
    }

    if (isSpam) {
      console.log('Spam detected from non-exempt user:', userId);
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
