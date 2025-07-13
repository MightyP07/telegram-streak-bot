import TelegramBot from 'node-telegram-bot-api';
import db from './db.mjs';
import cron from 'node-cron';

// Replace with your token
// const token = '7603611635:AAGrHGVaCkdrhjV3PDCbJVwXhDhnB6z8fg4';
const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

// /start command
bot.onText(/\/start/, async (msg) => {
  const name = msg.from.first_name || msg.from.username || 'friend';
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const today = new Date().toDateString();

  const users = db.data.users;

  // Create user if not exists
  if (!users[userId]) {
    users[userId] = {
      chatId,
      lastLogin: '',
      streak: 0,
    };
    await db.write();
  }

  const lastLogin = users[userId].lastLogin;
  const streak = users[userId].streak;
  const alreadyLoggedInToday = lastLogin === today;

  if (alreadyLoggedInToday) {
    bot.sendMessage(chatId,
      `👋 Welcome back, ${name}!\n✅ You've already logged in today.\n🔥 Your current streak: ${streak} day(s) ✅`
    );
  } else {
    bot.sendMessage(chatId,
      `👋 Welcome to the 300-Day Streak Challenge, ${name}!\n🔥 Your current streak: ${streak} day(s)`,
      {
        reply_markup: {
          inline_keyboard: [[{ text: "🔐 Log In Today", callback_data: "login_today" }]]
        }
      }
    );
  }
});

// Handle login button
bot.on('callback_query', async (query) => {
  const userId = query.from.id;
  const chatId = query.message.chat.id;
  const today = new Date().toDateString();
  const users = db.data.users;

  if (query.data === "disabled") {
    return bot.answerCallbackQuery(query.id, {
      text: "You've already logged in today. Come back tomorrow!",
      show_alert: true
    });
  }

  if (!users[userId]) {
    users[userId] = {
      chatId,
      lastLogin: today,
      streak: 1,
    };
    await db.write();
    return bot.sendMessage(chatId, `✅ Day 1 complete! Keep it up!`);
  }

  if (users[userId].lastLogin === today) {
    return bot.sendMessage(chatId, `⏳ You already logged in today!`);
  }

  users[userId].lastLogin = today;
  users[userId].streak += 1;
  await db.write();
  bot.sendMessage(chatId, `✅ Streak updated! You're on day ${users[userId].streak} 🎉`);
});

// Daily streak reset
async function checkForMissedLogins() {
  const users = db.data.users;
  const today = new Date().toDateString();
  let changesMade = false;

  for (const userId in users) {
    const user = users[userId];
    if (user.lastLogin !== today && user.streak > 0) {
      user.streak = 0;
      changesMade = true;
      bot.sendMessage(user.chatId, `❌ You missed a day. Your streak has been reset to 0.`);
    }
  }

  if (changesMade) {
    await db.write();
    console.log('✅ Missed logins checked and data saved.');
  } else {
    console.log('✅ No streaks reset. All users logged in today.');
  }
}

// Run immediately on startup
checkForMissedLogins();

// Run every day at midnight (00:00)
cron.schedule('0 0 * * *', () => {
  console.log('⏰ Running daily login check at midnight...');
  checkForMissedLogins();
});

// Log polling errors
bot.on("polling_error", (error) => {
  console.error("Polling error:", error.code, error.message);
});
