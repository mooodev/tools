const TelegramBot = require('node-telegram-bot-api');

const botStrings = {
  en: {
    gameNotFound: 'Game not found or has expired.',
    alreadyInGame: "You're already in this game.",
    openGame: 'Open Game',
    gameFull: 'This game is full. You can spectate:',
    watchGame: 'Watch Game',
    joinedAs: (size) => `You joined a ${size}×${size} game as White!`,
    playNow: 'Play Now',
    couldNotJoin: 'Could not join game.',
    mainMenu: '**Telebaduk** — Play Go\n\nCreate a game below or open the app to see your games.',
    customGame: 'Custom Game',
    openApp: 'Open App',
    chooseBoardSize: 'Choose board size:',
    chooseKomi: (size) => `Board: ${size}×${size}\nChoose komi:`,
    gameVisibility: 'Game visibility:',
    publicGame: 'Public (anyone can watch)',
    privateGame: 'Private',
    gameCreated: 'Game created!',
    board: 'Board',
    komi: 'Komi',
    visibility: 'Visibility',
    public: 'Public',
    private: 'Private',
    shareInvite: 'Share this link to invite an opponent:',
    shareInviteBtn: 'Share Invite',
    joinedNotify: (name, size) => `${name} joined your ${size}×${size} game!`,
    yourTurn: (name) => `${name} played a move — it's your turn!`,
    helpTitle: '**Telebaduk — Help**',
    helpText: 'Create a game using the buttons after /start.\nForward the invite link to a friend.\nOpen the app to see your active games and spectate others.\n\n**Rules:**\n• Black plays first\n• Capture stones by surrounding them\n• Game ends when both players pass\n• Chinese scoring (area + stones)\n\n**Features:**\n• 3D/2D board view\n• Request redo after a move\n• Real-time influence estimation\n• Spectate public games',
  },
  ru: {
    gameNotFound: 'Игра не найдена или истекла.',
    alreadyInGame: 'Вы уже в этой игре.',
    openGame: 'Открыть игру',
    gameFull: 'Игра заполнена. Вы можете наблюдать:',
    watchGame: 'Смотреть игру',
    joinedAs: (size) => `Вы присоединились к игре ${size}×${size} за белых!`,
    playNow: 'Играть',
    couldNotJoin: 'Не удалось присоединиться.',
    mainMenu: '**Телебадук** — Играть в Го\n\nСоздайте игру ниже или откройте приложение.',
    customGame: 'Своя игра',
    openApp: 'Открыть',
    chooseBoardSize: 'Выберите размер доски:',
    chooseKomi: (size) => `Доска: ${size}×${size}\nВыберите коми:`,
    gameVisibility: 'Видимость игры:',
    publicGame: 'Публичная (все могут смотреть)',
    privateGame: 'Приватная',
    gameCreated: 'Игра создана!',
    board: 'Доска',
    komi: 'Коми',
    visibility: 'Видимость',
    public: 'Публичная',
    private: 'Приватная',
    shareInvite: 'Отправьте ссылку для приглашения:',
    shareInviteBtn: 'Пригласить',
    joinedNotify: (name, size) => `${name} присоединился к вашей игре ${size}×${size}!`,
    yourTurn: (name) => `${name} сделал ход — ваша очередь!`,
    helpTitle: '**Телебадук — Помощь**',
    helpText: 'Создайте игру кнопками после /start.\nОтправьте ссылку другу.\nОткройте приложение для списка игр.\n\n**Правила:**\n• Чёрные ходят первыми\n• Захватывайте камни окружением\n• Игра завершается после двух пасов\n• Китайский подсчёт (территория + камни)\n\n**Возможности:**\n• 3D/2D вид доски\n• Запрос отмены хода\n• Оценка влияния в реальном времени\n• Наблюдение за играми',
  }
};

function getLang(from) {
  const lc = from && from.language_code;
  return (lc && lc.startsWith('ru')) ? 'ru' : 'en';
}

function t(lang, key) {
  return (botStrings[lang] && botStrings[lang][key]) || botStrings.en[key] || key;
}

function createBot(token, appUrl, store) {
  const bot = new TelegramBot(token, { polling: true });

  bot.onText(/\/start(.*)/, (msg, match) => {
    const chatId = msg.chat.id;
    const lang = getLang(msg.from);
    const param = (match[1] || '').trim();

    if (param) {
      const session = store.getGame(param);
      if (!session) {
        return bot.sendMessage(chatId, t(lang, 'gameNotFound'));
      }
      const userId = String(msg.from.id);
      const userName = msg.from.first_name || 'Player';

      if (session.isPlayer(userId)) {
        return bot.sendMessage(chatId, t(lang, 'alreadyInGame'), {
          reply_markup: {
            inline_keyboard: [[{
              text: t(lang, 'openGame'),
              web_app: { url: `${appUrl}?game=${session.id}` }
            }]]
          }
        });
      }

      if (session.players[2]) {
        return bot.sendMessage(chatId, t(lang, 'gameFull'), {
          reply_markup: {
            inline_keyboard: [[{
              text: t(lang, 'watchGame'),
              web_app: { url: `${appUrl}?game=${session.id}` }
            }]]
          }
        });
      }

      const result = store.joinGame(session.id, userId, userName);
      if (result.joined) {
        session.setPlayerChatId(userId, chatId);
        if (session.creatorChatId) {
          const creatorLang = 'ru'; // default notify in ru
          bot.sendMessage(session.creatorChatId,
            t(creatorLang, 'joinedNotify')(userName, session.settings.size), {
            reply_markup: {
              inline_keyboard: [[{
                text: t(creatorLang, 'playNow'),
                web_app: { url: `${appUrl}?game=${session.id}` }
              }]]
            }
          });
        }
        return bot.sendMessage(chatId,
          t(lang, 'joinedAs')(session.settings.size), {
          reply_markup: {
            inline_keyboard: [[{
              text: t(lang, 'playNow'),
              web_app: { url: `${appUrl}?game=${session.id}` }
            }]]
          }
        });
      }
      return bot.sendMessage(chatId, t(lang, 'couldNotJoin'));
    }

    sendMainMenu(chatId, lang);
  });

  function sendMainMenu(chatId, lang) {
    bot.sendMessage(chatId, t(lang, 'mainMenu'), {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '9×9', callback_data: 'quick_9' },
            { text: '13×13', callback_data: 'quick_13' },
            { text: '19×19', callback_data: 'quick_19' }
          ],
          [{ text: t(lang, 'customGame'), callback_data: 'custom_start' }],
          [{ text: t(lang, 'openApp'), web_app: { url: appUrl } }]
        ]
      }
    });
  }

  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    const userId = String(query.from.id);
    const userName = query.from.first_name || 'Player';
    const lang = getLang(query.from);

    if (data.startsWith('quick_')) {
      const size = parseInt(data.split('_')[1]);
      const komi = 6.5;
      const session = store.createGame(
        { size, komi, isPublic: true },
        userId, userName, chatId
      );
      await bot.answerCallbackQuery(query.id);
      sendGameCreated(chatId, session, lang);
      return;
    }

    if (data === 'custom_start') {
      await bot.answerCallbackQuery(query.id);
      bot.sendMessage(chatId, t(lang, 'chooseBoardSize'), {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '9×9', callback_data: 'csize_9' },
              { text: '13×13', callback_data: 'csize_13' },
              { text: '19×19', callback_data: 'csize_19' }
            ]
          ]
        }
      });
      return;
    }

    if (data.startsWith('csize_')) {
      const size = parseInt(data.split('_')[1]);
      await bot.answerCallbackQuery(query.id);
      bot.sendMessage(chatId, t(lang, 'chooseKomi')(size), {
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
      bot.sendMessage(chatId, t(lang, 'gameVisibility'), {
        reply_markup: {
          inline_keyboard: [
            [
              { text: t(lang, 'publicGame'), callback_data: `cvis_${size}_${komi}_1` },
              { text: t(lang, 'privateGame'), callback_data: `cvis_${size}_${komi}_0` }
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
      sendGameCreated(chatId, session, lang);
      return;
    }

    await bot.answerCallbackQuery(query.id);
  });

  function sendGameCreated(chatId, session, lang) {
    const botUsername = bot.options?.username || 'telebaduk_bot';
    const inviteLink = `https://t.me/${botUsername}?start=${session.id}`;
    const s = session.settings;

    bot.sendMessage(chatId,
      `${t(lang, 'gameCreated')}\n\n` +
      `${t(lang, 'board')}: ${s.size}×${s.size}\n` +
      `${t(lang, 'komi')}: ${s.komi}\n` +
      `${t(lang, 'visibility')}: ${s.isPublic ? t(lang, 'public') : t(lang, 'private')}\n\n` +
      `${t(lang, 'shareInvite')}\n${inviteLink}`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: t(lang, 'openGame'), web_app: { url: `${process.env.APP_URL || 'https://localhost:3000'}?game=${session.id}` } }],
          [{ text: t(lang, 'shareInviteBtn'), switch_inline_query: inviteLink }]
        ]
      }
    });
  }

  bot.onText(/\/help/, (msg) => {
    const lang = getLang(msg.from);
    bot.sendMessage(msg.chat.id,
      `${t(lang, 'helpTitle')}\n\n${t(lang, 'helpText')}`, {
      parse_mode: 'Markdown'
    });
  });

  bot.getMe().then(me => {
    bot.options.username = me.username;
    console.log(`Bot started: @${me.username}`);
  }).catch(() => {});

  return bot;
}

module.exports = { createBot };
