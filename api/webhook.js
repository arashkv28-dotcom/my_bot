export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('Bot is running on Vercel!');
  if (!req.body) return res.status(200).send('OK');
  
  const BOT_TOKEN = process.env.BOT_TOKEN;
  const ADMIN_IDS = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(id => parseInt(id.trim())) : [];

  // ❓ پاسخ سوالات متداول
  const FAQ_ANSWERS = {
    faq_1: "🔹 *مجموعه شما چیست؟*\n\n*ما مجموعه‌ای شامل چند کانال و گروه هستیم که حول محور اندیشه پهلویسم، مسائل روز، اخبار، و مباحث مرتبط سیاسی فعالیت می‌کنند. از طریق منوی اصلی می‌تونید به همه‌ی کانال‌ها و گروه‌های ما دسترسی داشته باشید.*",
    faq_2: "🔹 *کانال‌ها کدام‌اند؟*\n\n*برای دیدن لیست کامل کانال‌های ما به بخش «📢 کانال های ما» در منوی اصلی مراجعه کنید.*",
    faq_3: "🔹 *گروه‌ها کدام‌اند؟*\n\n*برای دیدن لیست کامل گروه‌های ما به بخش «👥 گروه های ما» در منوی اصلی مراجعه کنید.*",
    faq_4: "🔹 *چطور ارتباط بگیرم؟*\n\n*می‌تونید از بخش «📞 گروه های ارتباط» در منوی اصلی استفاده کنید، یا از همین قسمت گزینه‌ی «📩 ارتباط با ما» رو انتخاب کنید تا مستقیماً به گروه‌های پشتیبانی وصل بشید.*",
    faq_5: "🔹 *قوانین چیست؟*\n\n*۱. استفاده از کلمات رکیک و توهین ممنوع است.\n۲. ارسال هرگونه لینک و تبلیغات اکیداً ممنوع است.\n۳. سیستم به صورت خودکار پیام‌های تکراری و لینک‌ها را حذف می‌کند.\n۴. لطفاً نظم گروه را رعایت کنید.*"
  };

  const tgApi = async (method, body) => {
    try {
      return await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    } catch (e) {
      return null;
    }
  };

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const KV_URL = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;

  // ذخیره اطلاعات گروه در KV
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

  // حذف گروه از KV
  const removeGroupFromKV = async (chatId) => {
    if (!KV_URL || !KV_TOKEN) return;
    try {
      await fetch(`${KV_URL}/del/group_${chatId}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
      });
    } catch (e) {}
  };

  // دریافت لیست تمام گروه‌ها از KV
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
  // 🎛️ بخش اول: دکمه‌های شیشه‌ای (منوها)
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
          ...(isAdmin ? [[{ text: "⚙️ مدیریت گروه‌ها", callback_data: "admin_manage" }]] : [])
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
    // ==========================================
    // ⚙️ بخش مدیریت گروه‌ها (فقط برای ادمین‌ها)
    // ==========================================
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
        newText = `📋 *مدیریت گروه‌ها*\n\n✅ *تعداد گروه‌های ثبت شده:* ${groups.length}\n\n_روی هر گروه کلیک کنید تا گزینه‌های مدیریت را ببینید:_`;
        
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
        newText = "❌ *گروه مورد نظر یافت نشد!*\n\n_احتمالاً ربات از این گروه خارج شده است._";
        newMarkup = {
          inline_keyboard: [[{ text: "🔙 بازگشت به لیست", callback_data: "admin_manage" }]]
        };
      } else {
        const joinDate = new Date(group.joinedAt).toLocaleString('fa-IR', { timeZone: 'Asia/Tehran' });
        newText = `📊 *اطلاعات گروه*\n\n`;
        newText += `📌 *نام گروه:* ${group.title}\n`;
        newText += `🆔 *شناسه:* \`${group.id}\`\n`;
        newText += `👤 *یوزرنیم:* ${group.username ? '@' + group.username : '❌ ندارد'}\n`;
        newText += `📅 *تاریخ عضویت:* ${joinDate}\n\n`;
        newText += `⚠️ *با کلیک روی دکمه زیر، ربات از این گروه خارج می‌شود و دیگر نمی‌تواند پیام‌ها را مدیریت کند.*`;
        
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
      
      // نمایش صفحه تایید
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
      
      // تلاش برای ترک گروه
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
          newText = `❌ *خطا در خروج از گروه*\n\n\`${leaveData.description || 'خطای نامشخص'}\`\n\n_احتمالاً ربات قبلاً از این گروه خارج شده است._`;
          await removeGroupFromKV(groupId); // حذف از لیست حتی در صورت خطا
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
  // 🛡️ بخش دوم: مدیریت پیام‌ها و امنیت
  // ==========================================
  const message = req.body.message || req.body.channel_post;
  if (!message) return res.status(200).send('OK');

  const chatId = message.chat.id;
  const messageId = message.message_id;
  const text = message.text || "";
  const isGroup = message.chat.type !== 'private';

  // ذخیره اطلاعات گروه جدید
  if (isGroup && message.chat.title) {
    await saveGroupToKV(chatId, message.chat.title, message.chat.username);
  }

  // 🚫 مقابله با حملات سایبری (حذف پیام‌های ورود و خروج)
  if (message.new_chat_members || message.left_chat_member) {
    await tgApi('deleteMessage', { chat_id: chatId, message_id: messageId });
    return res.status(200).send('OK');
  }

  const WHITELIST_IDS = [
    1001977073229, 1922419923, 6990025961, 96431648, 
    -1001678007720, 8934796975, 5443017337, 8097212518, 6604010059, 
    7452439235, 8108599040, 6491888510, 7738331590, 
    -1002103959267, -1002080075722, -1002425222777,
    1528824508
  ];
  
  const userId = message.from ? message.from.id : null;
  const senderChatId = message.sender_chat ? message.sender_chat.id : null;
  
  const isExempt = 
    WHITELIST_IDS.includes(userId) || 
    WHITELIST_IDS.includes(senderChatId) || 
    userId === 777000 || 
    message.is_automatic_forward || 
    req.body.channel_post; 

  // --- دکمه‌های احضار منو ---
  if (text === "/start") {
    if (isGroup) await tgApi('deleteMessage', { chat_id: chatId, message_id: messageId });
    
    const isAdmin = ADMIN_IDS.includes(userId);
    const keyboard = isAdmin 
      ? [[{ text: "📋 منوی اصلی" }], [{ text: "⚙️ مدیریت گروه‌ها" }]]
      : [[{ text: "📋 منوی اصلی" }]];
    
    await tgApi('sendMessage', { 
      chat_id: chatId, 
      text: "👋 *خوش آمدید!*\n\nدکمه‌های دسترسی سریع برای شما فعال شد. 👇", 
      parse_mode: "Markdown",
      reply_markup: { keyboard, resize_keyboard: true } 
    });
    return res.status(200).send('OK');
  }

  if (text === "/menu" || text === "منو" || text === "📋 منوی اصلی") {
    if (isGroup) await tgApi('deleteMessage', { chat_id: chatId, message_id: messageId });
    
    const isAdmin = ADMIN_IDS.includes(userId);
    const adminButton = isAdmin ? [[{ text: "⚙️ مدیریت گروه‌ها", callback_data: "admin_manage" }]] : [];
    
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
          ...adminButton
        ]
      }
    });
    return res.status(200).send('OK');
  }

  // دستور مخصوص ادمین برای مدیریت گروه‌ها
  if ((text === "/admin" || text === "⚙️ مدیریت گروه‌ها") && ADMIN_IDS.includes(userId)) {
    if (isGroup) await tgApi('deleteMessage', { chat_id: chatId, message_id: messageId });
    
    const groups = await getAllGroupsFromKV();
    
    let adminText = "";
    let adminMarkup = {};
    
    if (groups.length === 0) {
      adminText = "📋 *مدیریت گروه‌ها*\n\n❌ *هیچ گروهی ثبت نشده است.*\n\n_ربات را به گروه‌های مورد نظر اضافه کنید تا اینجا لیست شوند._";
      adminMarkup = {
        inline_keyboard: [[{ text: "🔙 بازگشت به منو", callback_data: "main_menu" }]]
      };
    } else {
      adminText = `📋 *مدیریت گروه‌ها*\n\n✅ *تعداد گروه‌های ثبت شده:* ${groups.length}\n\n_روی هر گروه کلیک کنید:_`;
      
      const groupButtons = groups.map(g => [{
        text: `📍 ${g.title}`,
        callback_data: `view_${g.id}`
      }]);
      
      adminMarkup = {
        inline_keyboard: [
          ...groupButtons,
          [{ text: "🔙 بازگشت به منو", callback_data: "main_menu" }]
        ]
      };
    }
    
    await tgApi('sendMessage', {
      chat_id: chatId,
      text: adminText,
      parse_mode: "Markdown",
      reply_markup: adminMarkup
    });
    return res.status(200).send('OK');
  }

  // --- سیستم امنیتی هوشمند (برای کاربران غیرمجاز) ---
  if (!isExempt && isGroup) {
    let isSpam = false;
    let warningMessage = "";

    // ۱. بررسی پیام‌های تکراری (متن، عکس، ویدیو)
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
              const checkRes = await fetch(`${KV_URL}/get/${encodeURIComponent(uniqueKey)}`, { headers: { Authorization: `Bearer ${KV_TOKEN}` } });
              const checkData = await checkRes.json();
              if (checkData.result !== null) {
                isSpam = true;
                warningMessage = `⚠️ کاربر عزیز، ارسال پیام تکراری (اسپم) ممنوع است!`;
              } else {
                await fetch(`${KV_URL}/set/${encodeURIComponent(uniqueKey)}/1/EX/86400`, { headers: { Authorization: `Bearer ${KV_TOKEN}` } });
              }
            } catch (e) { }
        }
    }

    // ۲. بررسی کلمات رکیک و لینک‌ها
    const badWordsRaw = ["احمق", "بیشعور", "کلاهبرداری", "شاشزاده", "کون", "کص", "سس خرسی", "تام مورلی", "کسکش", "کوسکش", "کوصکش", "کصکش", "کیر", "کوس"];
    const hasBadWord = text ? badWordsRaw.some(w => text.includes(w)) : false;
    const linkRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-zA-Z0-9-]+\.[a-zA-Z]{2,})|(@[a-zA-Z0-9_]+)/i;
    const hasLink = text ? linkRegex.test(text) : false;

    if (hasBadWord || hasLink) {
        isSpam = true;
        warningMessage = hasLink ? `⚠️ ارسال لینک و تبلیغات در این گروه ممنوع است!` : `⚠️ استفاده از کلمات نامناسب ممنوع است!`;
    }

    // ۳. عملیات پاکسازی و ارسال اخطار موقت (7 ثانیه)
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
