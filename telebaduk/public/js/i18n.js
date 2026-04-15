// Internationalization system - EN/RU
const I18n = (() => {
  const translations = {
    en: {
      title: 'Telebaduk',
      subtitle: 'Play Go',
      myGames: 'My Games',
      watch: 'Watch',
      noGames: 'No games yet. Create one from the bot!',
      noPublicGames: 'No public games right now.',
      waiting: 'Waiting...',
      live: 'Live',
      open: 'Open',
      done: 'Done',
      move: 'Move',
      watching: 'watching',
      vs: 'vs',
      opponent: 'Opponent',
      you: 'You',
      pass: 'Pass',
      redo: 'Redo',
      resign: 'Resign',
      waitingForOpponent: 'Waiting for opponent...',
      markDeadStones: 'Mark dead stones',
      gameOverStatus: 'Game over',
      spectating: 'Spectating',
      yourTurn: 'Your turn',
      opponentsTurn: "Opponent's turn",
      blacksTurn: "Black's turn",
      whitesTurn: "White's turn",
      redoRequest: 'Redo Request',
      redoText: 'Opponent wants to undo their last move.',
      allow: 'Allow',
      deny: 'Deny',
      markDeadStonesTitle: 'Mark Dead Stones',
      markDeadStonesText: 'Tap groups to mark as dead. Both players confirm to finish.',
      black: 'Black',
      white: 'White',
      confirmScore: 'Confirm Score',
      youWon: 'You Won!',
      youLost: 'You Lost',
      gameOver: 'Game Over',
      backToGames: 'Back to Games',
      waitingForOpponentTitle: 'Waiting for opponent',
      shareInvite: 'Share the invite link from the bot.',
      passed: 'passed',
      oneMoreToEnd: '(1 more to end)',
      confirmedScore: 'confirmed the score',
      opponentDisconnected: 'Opponent disconnected',
      redoRequested: 'Redo requested...',
      redoAccepted: 'Redo accepted',
      redoDenied: 'Redo denied',
      passConfirm: 'Pass your turn?',
      resignConfirm: 'Are you sure you want to resign?',
      cap: 'cap',
    },
    ru: {
      title: 'Телебадук',
      subtitle: 'Играть в Го',
      myGames: 'Мои игры',
      watch: 'Смотреть',
      noGames: 'Пока нет игр. Создайте через бота!',
      noPublicGames: 'Нет открытых игр.',
      waiting: 'Ожидание...',
      live: 'Идёт',
      open: 'Открыта',
      done: 'Завершена',
      move: 'Ход',
      watching: 'смотрят',
      vs: 'против',
      opponent: 'Соперник',
      you: 'Вы',
      pass: 'Пас',
      redo: 'Отмена',
      resign: 'Сдаться',
      waitingForOpponent: 'Ожидание соперника...',
      markDeadStones: 'Отметьте мёртвые камни',
      gameOverStatus: 'Игра окончена',
      spectating: 'Наблюдение',
      yourTurn: 'Ваш ход',
      opponentsTurn: 'Ход соперника',
      blacksTurn: 'Ход чёрных',
      whitesTurn: 'Ход белых',
      redoRequest: 'Запрос отмены',
      redoText: 'Соперник хочет отменить последний ход.',
      allow: 'Разрешить',
      deny: 'Отклонить',
      markDeadStonesTitle: 'Мёртвые камни',
      markDeadStonesText: 'Нажмите на группы, чтобы отметить мёртвые. Оба игрока подтверждают.',
      black: 'Чёрные',
      white: 'Белые',
      confirmScore: 'Подтвердить счёт',
      youWon: 'Вы выиграли!',
      youLost: 'Вы проиграли',
      gameOver: 'Игра окончена',
      backToGames: 'К списку игр',
      waitingForOpponentTitle: 'Ожидание соперника',
      shareInvite: 'Отправьте ссылку-приглашение из бота.',
      passed: 'спасовал',
      oneMoreToEnd: '(ещё 1 для завершения)',
      confirmedScore: 'подтвердил счёт',
      opponentDisconnected: 'Соперник отключился',
      redoRequested: 'Запрос отмены...',
      redoAccepted: 'Отмена принята',
      redoDenied: 'Отмена отклонена',
      passConfirm: 'Пропустить ход?',
      resignConfirm: 'Вы уверены, что хотите сдаться?',
      cap: 'взято',
    }
  };

  let currentLang = localStorage.getItem('telebaduk_lang') || 'ru';

  function t(key) {
    return (translations[currentLang] && translations[currentLang][key]) ||
           translations.en[key] || key;
  }

  function setLang(lang) {
    currentLang = lang;
    localStorage.setItem('telebaduk_lang', lang);
  }

  function getLang() {
    return currentLang;
  }

  // Update all elements with data-i18n attribute
  function updateDOM() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      el.textContent = t(el.dataset.i18n);
    });
  }

  return { t, setLang, getLang, updateDOM };
})();
