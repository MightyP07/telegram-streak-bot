import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import TelegramBot from 'node-telegram-bot-api';
import db from './db.mjs';
import cron from 'node-cron';

// Replace with your token
const token = process.env.TOKEN;
const bot = new TelegramBot(token, { polling: true });

// /start command with optional referral payload
bot.onText(/\/start(?:\s+(\d+))?/, async (msg, match) => {
  const name = msg.from.first_name || msg.from.username || 'friend';
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const today = new Date().toDateString();

  const users = db.data.users;
  const referrerId = match[1]; // from referral link: /start <referrerId>

  // Create user if not exists
  if (!users[userId]) {
    users[userId] = {
      chatId,
      lastLogin: '',
      streak: 0,
      referredBy: referrerId || null,
      referrals: 0,
      username: name,
    };

    // If referrer exists and is not the same as the new user
  if (referrerId && users[referrerId] && parseInt(referrerId) !== userId) {
      users[referrerId].referrals = (users[referrerId].referrals || 0) + 1;
      // bot.sendMessage(referrerId, `🎉 Someone joined using your referral link!`);
      bot.sendMessage(parseInt(referrerId), `🎉 ${name} joined using your referral link!`);
    }

    await db.write();
  }

  const lastLogin = users[userId].lastLogin;
  const streak = users[userId].streak;
  const alreadyLoggedInToday = lastLogin === today;

  const referrals = users[userId].referrals || 0;

if (alreadyLoggedInToday) {
  bot.sendMessage(chatId,
    `👋 Welcome back, ${name}!\n✅ You've already logged in today.\n🔥 Current streak: ${streak} day(s)\n👥 Referrals: ${referrals}`
  );
} else {
  bot.sendMessage(chatId,
    `👋 Welcome to the 300-Day Streak Challenge, ${name}!\n🔥 Current streak: ${streak} day(s)\n👥 Referrals: ${referrals}`,
    {
      reply_markup: {
        inline_keyboard: [[{ text: "🔐 Log In Today", callback_data: "login_today" }]]
      }
    }
  );
}})

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
      referredBy: null,
      referrals: 0,
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

// /referral command — send the user's own referral link
bot.onText(/\/referral/, (msg) => {
  const userId = msg.from.id;
  const botUsername = 'consistencycoach_bot'; // 🔴 Replace with your bot's username (without the @)
  const link = `https://t.me/${botUsername}?start=${userId}`;

  bot.sendMessage(msg.chat.id, `🔗 Share your referral link:\n${link}`);
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
bot.onText(/\/stats/, async (msg) => {
  const userId = msg.from.id;
  const user = db.data.users[userId];

  if (!user) {
    return bot.sendMessage(msg.chat.id, `❌ You are not registered yet. Send /start to join the challenge.`);
  }

  const statsMessage = `
📊 *Your Stats*:
🔥 Streak: ${user.streak} day(s)
📅 Last Login: ${user.lastLogin || "Never"}
👥 Referrals: ${user.referrals || 0}
  `;

  bot.sendMessage(msg.chat.id, statsMessage, { parse_mode: 'Markdown' });
});

bot.onText(/\/leaderboard/, async (msg) => {
  const users = db.data.users;
  const allUsers = Object.entries(users);

  if (allUsers.length === 0) {
    return bot.sendMessage(msg.chat.id, `🏆 No users found in the leaderboard yet.`);
  }

  const topUsers = allUsers
    .filter(([_, user]) => typeof user.streak === 'number') // Ensure streak is a number
    .sort((a, b) => b[1].streak - a[1].streak)
    .slice(0, 5);

  const leaderboard = topUsers
    .map(([userId, user], index) => {
      const username = user.username || `User ${userId}`;
      return `${index + 1}. 🔥 ${user.streak} day(s) – ${username}`;
    })
    .join('\n');

  bot.sendMessage(msg.chat.id, `🏆 *Top Streaks Leaderboard*\n\n${leaderboard}`, {
    parse_mode: 'Markdown'
  });
});


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

  if (error.code === 'EFATAL') {
    console.log('🔁 Retrying in 10 seconds...');
    setTimeout(() => {
      bot.startPolling();
    }, 10000);
  }
});

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('🤖 Telegram Streak Bot is running');
});

app.listen(PORT, () => {
  console.log(`✅ Express server listening on port ${PORT}`);
});

