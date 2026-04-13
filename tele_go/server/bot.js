// Telegram Bot — handles commands, inline buttons, game invites
const TelegramBot = require('node-telegram-bot-api');

function createBot(token, webAppUrl, store) {
  const bot = new TelegramBot(token, { polling: true });

  // /start — main entry or deep-link join
  bot.onText(/\/start(.*)/, (msg, match) => {
    const chatId = msg.chat.id;
    const param = (match[1] || '').trim();

    if (param) {
      // Deep link: join existing game
      const gameId = param;
      const session = store.getGame(gameId);
      if (session) {
        const status = session.game.moves.length > 0 || session.players[2]
          ? 'Watch this Go game live!'
          : 'Join this Go game!';

        bot.sendMessage(chatId, `🎯 *${status}*\n\nBoard: ${session.settings.size}×${session.settings.size} | Komi: ${session.settings.komi}`, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[{
              text: session.players[2] ? '👀 Watch Game' : '⚫ Join Game',
              web_app: { url: `${webAppUrl}?game=${gameId}` }
            }]]
          }
        });
        return;
      }
    }

    // Default start message
    bot.sendMessage(chatId,
      `⚫⚪ *Tele Go* ⚪⚫\n\nPlay Go right here in Telegram!\n\n` +
      `🎮 *Features:*\n` +
      `• 9×9, 13×13, 19×19 boards\n` +
      `• Play against friends or AI\n` +
      `• Share invite links\n` +
      `• Watch live games\n` +
      `• AI move suggestions\n` +
      `• Post-game analysis\n\n` +
      `Tap below to start a new game!`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '⚡ Quick Game (9×9)', callback_data: 'new_9_6.5' }],
            [{ text: '📐 Standard (13×13)', callback_data: 'new_13_6.5' }],
            [{ text: '🏛 Classic (19×19)', callback_data: 'new_19_6.5' }],
            [{ text: '⚙️ Custom Game', callback_data: 'custom' }]
          ]
        }
      }
    );
  });

  // Handle new game callbacks
  bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    if (data.startsWith('new_')) {
      const parts = data.split('_');
      const size = parseInt(parts[1]);
      const komi = parseFloat(parts[2]);

      const session = store.createGame({
        size,
        komi,
        creatorId: String(query.from.id),
        creatorName: query.from.first_name || 'Player'
      });

      bot.answerCallbackQuery(query.id, { text: 'Game created!' });

      const inviteLink = `https://t.me/${bot.botInfo?.username || 'tele_go_bot'}?start=${session.id}`;

      bot.sendMessage(chatId,
        `🎯 *Game Created!*\n\n` +
        `Board: ${size}×${size} | Komi: ${komi}\n` +
        `Game ID: \`${session.id}\`\n\n` +
        `Share this link to invite a friend:\n${inviteLink}\n\n` +
        `Or play against AI — tap the game to begin!`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🎮 Open Game', web_app: { url: `${webAppUrl}?game=${session.id}` } }],
              [{
                text: '📤 Invite Friend',
                switch_inline_query: `Join my Go game! ${size}×${size} — ${inviteLink}`
              }],
              [{ text: '🤖 Play vs AI', callback_data: `ai_${session.id}_medium` }]
            ]
          }
        }
      );
      return;
    }

    if (data.startsWith('ai_')) {
      const parts = data.split('_');
      const gameId = parts[1];
      const difficulty = parts[2] || 'medium';

      const result = store.joinAsAI(gameId, difficulty);
      if (result.error) {
        bot.answerCallbackQuery(query.id, { text: result.error, show_alert: true });
        return;
      }

      bot.answerCallbackQuery(query.id, { text: 'AI opponent joined!' });
      bot.sendMessage(chatId,
        `🤖 *AI joined the game!*\nDifficulty: ${difficulty}\n\nTap to start playing:`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🎮 Play Now', web_app: { url: `${webAppUrl}?game=${gameId}` } }]
            ]
          }
        }
      );
      return;
    }

    if (data === 'custom') {
      bot.answerCallbackQuery(query.id);
      bot.sendMessage(chatId,
        `⚙️ *Custom Game Setup*\n\nChoose board size:`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '9×9', callback_data: 'size_9' },
                { text: '13×13', callback_data: 'size_13' },
                { text: '19×19', callback_data: 'size_19' }
              ]
            ]
          }
        }
      );
      return;
    }

    if (data.startsWith('size_')) {
      const size = parseInt(data.split('_')[1]);
      bot.answerCallbackQuery(query.id);
      bot.sendMessage(chatId,
        `Set komi for ${size}×${size} board:`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '0', callback_data: `new_${size}_0` },
                { text: '5.5', callback_data: `new_${size}_5.5` },
                { text: '6.5', callback_data: `new_${size}_6.5` },
                { text: '7.5', callback_data: `new_${size}_7.5` }
              ]
            ]
          }
        }
      );
      return;
    }

    if (data.startsWith('komi_')) {
      // handled via new_ pattern
      bot.answerCallbackQuery(query.id);
      return;
    }

    bot.answerCallbackQuery(query.id);
  });

  // /game command — quick status
  bot.onText(/\/game (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const gameId = match[1].trim();
    const session = store.getGame(gameId);

    if (!session) {
      bot.sendMessage(chatId, '❌ Game not found.');
      return;
    }

    const g = session.game;
    const status = g.gameOver
      ? `Game Over — ${g.result.display}`
      : `Move ${g.moves.length} — ${g.currentPlayer === 1 ? 'Black' : 'White'} to play`;

    bot.sendMessage(chatId,
      `📊 *Game ${gameId}*\n\n` +
      `Board: ${g.size}×${g.size} | Komi: ${g.komi}\n` +
      `Status: ${status}\n` +
      `Captures: ⚫ ${g.captures[1]} | ⚪ ${g.captures[2]}\n` +
      `Players: ${session.players[1]?.name || '?'} vs ${session.players[2]?.name || 'Waiting...'}`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🎮 Open Game', web_app: { url: `${webAppUrl}?game=${gameId}` } }]
          ]
        }
      }
    );
  });

  // /help
  bot.onText(/\/help/, (msg) => {
    bot.sendMessage(msg.chat.id,
      `📖 *Tele Go — Help*\n\n` +
      `*Commands:*\n` +
      `/start — New game menu\n` +
      `/game <id> — Game status\n` +
      `/help — This help message\n\n` +
      `*How to play:*\n` +
      `1. Create a game with /start\n` +
      `2. Share the invite link with a friend\n` +
      `3. Both open the game in the web app\n` +
      `4. Take turns placing stones\n` +
      `5. Game ends when both pass or someone resigns\n\n` +
      `*Tips:*\n` +
      `• Tap 💡 for AI move suggestions\n` +
      `• Long press a point to preview\n` +
      `• After the game, tap 📊 for analysis`,
      { parse_mode: 'Markdown' }
    );
  });

  // Store bot info
  bot.getMe().then(info => {
    bot.botInfo = info;
    console.log(`🤖 Bot @${info.username} is running`);
  }).catch(err => {
    console.error('Bot getMe failed:', err.message);
  });

  return bot;
}

module.exports = { createBot };
