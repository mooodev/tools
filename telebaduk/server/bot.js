const TelegramBot = require('node-telegram-bot-api');

function createBot(token, appUrl, store) {
  const bot = new TelegramBot(token, { polling: true });

  bot.onText(/\/start(.*)/, (msg, match) => {
    const chatId = msg.chat.id;
    const param = (match[1] || '').trim();

    if (param) {
      // Deep link: join a game
      const session = store.getGame(param);
      if (!session) {
        return bot.sendMessage(chatId, 'Game not found or has expired.');
      }
      const userId = String(msg.from.id);
      const userName = msg.from.first_name || 'Player';

      if (session.isPlayer(userId)) {
        return bot.sendMessage(chatId, `You're already in this game.`, {
          reply_markup: {
            inline_keyboard: [[{
              text: 'Open Game',
              web_app: { url: `${appUrl}?game=${session.id}` }
            }]]
          }
        });
      }

      if (session.players[2]) { // WHITE taken
        return bot.sendMessage(chatId, `This game is full. You can spectate:`, {
          reply_markup: {
            inline_keyboard: [[{
              text: 'Watch Game',
              web_app: { url: `${appUrl}?game=${session.id}` }
            }]]
          }
        });
      }

      // Join as white
      const result = store.joinGame(session.id, userId, userName);
      if (result.joined) {
        // Store chatId for bot notifications
        session.setPlayerChatId(userId, chatId);
        // Notify creator
        if (session.creatorChatId) {
          bot.sendMessage(session.creatorChatId,
            `${userName} joined your ${session.settings.size}x${session.settings.size} game!`, {
            reply_markup: {
              inline_keyboard: [[{
                text: 'Play Now',
                web_app: { url: `${appUrl}?game=${session.id}` }
              }]]
            }
          });
        }
        return bot.sendMessage(chatId,
          `You joined a ${session.settings.size}x${session.settings.size} game as White!`, {
          reply_markup: {
            inline_keyboard: [[{
              text: 'Play Now',
              web_app: { url: `${appUrl}?game=${session.id}` }
            }]]
          }
        });
      }
      return bot.sendMessage(chatId, 'Could not join game.');
    }

    // Main menu
    sendMainMenu(chatId);
  });

  function sendMainMenu(chatId) {
    bot.sendMessage(chatId,
      '**Telebaduk** \u2014 Play Go\n\nCreate a game below or open the app to see your games.', {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '9\u00d79', callback_data: 'quick_9' },
            { text: '13\u00d713', callback_data: 'quick_13' },
            { text: '19\u00d719', callback_data: 'quick_19' }
          ],
          [{ text: 'Custom Game', callback_data: 'custom_start' }],
          [{ text: 'Open App', web_app: { url: appUrl } }]
        ]
      }
    });
  }

  // Quick game creation
  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    const userId = String(query.from.id);
    const userName = query.from.first_name || 'Player';

    if (data.startsWith('quick_')) {
      const size = parseInt(data.split('_')[1]);
      const komi = 6.5;
      const session = store.createGame(
        { size, komi, isPublic: true },
        userId, userName, chatId
      );
      await bot.answerCallbackQuery(query.id);
      sendGameCreated(chatId, session);
      return;
    }

    if (data === 'custom_start') {
      await bot.answerCallbackQuery(query.id);
      bot.sendMessage(chatId, 'Choose board size:', {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '9\u00d79', callback_data: 'csize_9' },
              { text: '13\u00d713', callback_data: 'csize_13' },
              { text: '19\u00d719', callback_data: 'csize_19' }
            ]
          ]
        }
      });
      return;
    }

    if (data.startsWith('csize_')) {
      const size = parseInt(data.split('_')[1]);
      await bot.answerCallbackQuery(query.id);
      bot.sendMessage(chatId, `Board: ${size}\u00d7${size}\nChoose komi:`, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '0', callback_data: `ckomi_${size}_0` },
              { text: '5.5', callback_data: `ckomi_${size}_5.5` },
              { text: '6.5', callback_data: `ckomi_${size}_6.5` },
              { text: '7.5', callback_data: `ckomi_${size}_7.5` }
            ]
          ]
        }
      });
      return;
    }

    if (data.startsWith('ckomi_')) {
      const parts = data.split('_');
      const size = parseInt(parts[1]);
      const komi = parseFloat(parts[2]);
      await bot.answerCallbackQuery(query.id);
      bot.sendMessage(chatId, 'Game visibility:', {
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'Public (anyone can watch)', callback_data: `cvis_${size}_${komi}_1` },
              { text: 'Private', callback_data: `cvis_${size}_${komi}_0` }
            ]
          ]
        }
      });
      return;
    }

    if (data.startsWith('cvis_')) {
      const parts = data.split('_');
      const size = parseInt(parts[1]);
      const komi = parseFloat(parts[2]);
      const isPublic = parts[3] === '1';
      const session = store.createGame(
        { size, komi, isPublic },
        userId, userName, chatId
      );
      await bot.answerCallbackQuery(query.id);
      sendGameCreated(chatId, session);
      return;
    }

    await bot.answerCallbackQuery(query.id);
  });

  function sendGameCreated(chatId, session) {
    const botUsername = bot.options?.username || 'telebaduk_bot';
    const inviteLink = `https://t.me/${botUsername}?start=${session.id}`;
    const s = session.settings;

    bot.sendMessage(chatId,
      `Game created!\n\n` +
      `Board: ${s.size}\u00d7${s.size}\n` +
      `Komi: ${s.komi}\n` +
      `Visibility: ${s.isPublic ? 'Public' : 'Private'}\n\n` +
      `Share this link to invite an opponent:\n${inviteLink}`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Open Game', web_app: { url: `${process.env.APP_URL || 'https://localhost:3000'}?game=${session.id}` } }],
          [{ text: 'Share Invite', switch_inline_query: `Join my Go game! ${inviteLink}` }]
        ]
      }
    });
  }

  bot.onText(/\/help/, (msg) => {
    bot.sendMessage(msg.chat.id,
      `**Telebaduk \u2014 Help**\n\n` +
      `Create a game using the buttons after /start.\n` +
      `Forward the invite link to a friend.\n` +
      `Open the app to see your active games and spectate others.\n\n` +
      `**Rules:**\n` +
      `\u2022 Black plays first\n` +
      `\u2022 Capture stones by surrounding them\n` +
      `\u2022 Game ends when both players pass\n` +
      `\u2022 Chinese scoring (area + stones)\n\n` +
      `**Features:**\n` +
      `\u2022 3D/2D board view\n` +
      `\u2022 Request redo after a move\n` +
      `\u2022 Real-time influence estimation\n` +
      `\u2022 Spectate public games`, {
      parse_mode: 'Markdown'
    });
  });

  // Get bot username for invite links
  bot.getMe().then(me => {
    bot.options.username = me.username;
    console.log(`Bot started: @${me.username}`);
  }).catch(() => {});

  return bot;
}

module.exports = { createBot };
