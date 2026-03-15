const { InlineKeyboard } = require('grammy');

const onboardingKeyboards = {
  // ============ GIRL ============
  GIRL_WELCOME: {
    text: '💫 Привет, красавица! Сейчас настроим всё для вашей пары.\n\n7 коротких вопросов — и я стану вашим персональным помощником в отношениях.',
    keyboard: new InlineKeyboard().text('Поехали 💫', 'ob:start'),
  },
  GIRL_CYCLE_START: {
    text: '🌙 Когда начались твои последние месячные?',
    keyboard: new InlineKeyboard()
      .text('Сегодня', 'ob:0').text('Вчера', 'ob:1').row()
      .text('2-3 дня назад', 'ob:3').text('Неделю назад', 'ob:7').row()
      .text('Больше недели', 'ob:14'),
  },
  GIRL_CYCLE_LENGTH: {
    text: '📅 Сколько дней обычно длится твой цикл?',
    keyboard: new InlineKeyboard()
      .text('21-24', 'ob:23').text('25-27', 'ob:26').text('28', 'ob:28').row()
      .text('29-31', 'ob:30').text('32-35', 'ob:33').row()
      .text('Нерегулярный', 'ob:0'),
  },
  GIRL_PERIOD_LENGTH: {
    text: '🩸 Сколько дней длится менструация?',
    keyboard: new InlineKeyboard()
      .text('2-3 дня', 'ob:3').text('4-5 дней', 'ob:5').text('6-7 дней', 'ob:7'),
  },
  GIRL_ATTACHMENT_1: {
    text: '💭 Ситуация: он не отвечает на сообщение 3 часа. Ты:\n\n' +
      'А) Начинаю нервничать и писать ещё\n' +
      'Б) Думаю: ну ок, значит занят\n' +
      'В) Специально тоже не отвечаю потом',
    keyboard: new InlineKeyboard()
      .text('А', 'ob:ANXIOUS').text('Б', 'ob:SECURE').text('В', 'ob:AVOIDANT'),
  },
  GIRL_ATTACHMENT_2: {
    text: '💭 Он хочет провести вечер с друзьями без тебя. Ты:\n\n' +
      'А) Чувствую себя отвергнутой\n' +
      'Б) Рада за него, займусь своими делами\n' +
      'В) Мне тоже лучше отдельно иногда',
    keyboard: new InlineKeyboard()
      .text('А', 'ob:ANXIOUS').text('Б', 'ob:SECURE').text('В', 'ob:AVOIDANT'),
  },
  GIRL_ATTACHMENT_3: {
    text: '💭 После ссоры ты:\n\n' +
      'А) Хочу сразу помириться, не могу ждать\n' +
      'Б) Даю время обоим остыть, потом обсуждаем\n' +
      'В) Закрываюсь и молчу',
    keyboard: new InlineKeyboard()
      .text('А', 'ob:ANXIOUS').text('Б', 'ob:SECURE').text('В', 'ob:AVOIDANT'),
  },
  GIRL_LOVE_LANG: {
    text: '❤️ Как ты чувствуешь себя любимой?',
    keyboard: new InlineKeyboard()
      .text('Тёплые слова', 'ob:WORDS').row()
      .text('Когда делает что-то для меня', 'ob:ACTS').row()
      .text('Когда мы просто вместе', 'ob:TIME').row()
      .text('Через прикосновения', 'ob:TOUCH').row()
      .text('Подарки и сюрпризы', 'ob:GIFTS'),
  },
  GIRL_CONFLICT: {
    text: '⚡ Как ты ведёшь себя в конфликте?',
    keyboard: new InlineKeyboard()
      .text('Говорю сразу всё', 'ob:EXPRESSIVE').row()
      .text('Замолкаю и думаю', 'ob:THINKER').row()
      .text('Расстраиваюсь', 'ob:EXPRESSIVE').row()
      .text('Ищу компромисс', 'ob:SOLVER'),
  },
  GIRL_STRESS: {
    text: '🌡 Как сейчас твой уровень стресса?',
    keyboard: new InlineKeyboard()
      .text('😌 Всё ок', 'ob:1').text('😐 Немного', 'ob:2').row()
      .text('😤 Есть стресс', 'ob:3').text('😰 Устала', 'ob:4').row()
      .text('🤯 Полный выгон', 'ob:5'),
  },
  GIRL_ABOUT_HIM: {
    text: '💌 Что тебя в нём цепляет больше всего?\n\n_Напиши свободным текстом — я передам ему когда он присоединится_',
    keyboard: null, // free text
  },
  GIRL_DONE: {
    text: '✨ Готово! Осталось пригласить его.',
    keyboard: new InlineKeyboard().text('Отправить приглашение 💌', 'ob:done'),
  },

  // ============ GUY ============
  GUY_WELCOME: {
    text: '🎮 Окей, 7 вопросов. Без нудятины — обещаю.\nЭто типа настройка перед игрой.',
    keyboard: new InlineKeyboard().text('Го! 🚀', 'ob:start'),
  },
  GUY_WORKLOAD: {
    text: '💼 Насколько ты сейчас загружен по работе/жизни?',
    keyboard: new InlineKeyboard()
      .text('🟢 Всё тихо', 'ob:1').text('🟡 Норм', 'ob:2').row()
      .text('🟠 Много', 'ob:4').text('🔴 Завал', 'ob:5'),
  },
  GUY_ATTACHMENT_1: {
    text: '💭 Она расстроена и молчит. Ты:\n\n' +
      'А) Пытаюсь расшевелить и выяснить что случилось\n' +
      'Б) Спокойно спрашиваю, готов подождать\n' +
      'В) Даю ей пространство, разберётся сама',
    keyboard: new InlineKeyboard()
      .text('А', 'ob:ANXIOUS').text('Б', 'ob:SECURE').text('В', 'ob:AVOIDANT'),
  },
  GUY_ATTACHMENT_2: {
    text: '💭 Она хочет поговорить о чувствах. Ты:\n\n' +
      'А) Готов, хоть и не очень комфортно\n' +
      'Б) Нормально, давай обсудим\n' +
      'В) Напрягаюсь и хочу сменить тему',
    keyboard: new InlineKeyboard()
      .text('А', 'ob:ANXIOUS').text('Б', 'ob:SECURE').text('В', 'ob:AVOIDANT'),
  },
  GUY_ATTACHMENT_3: {
    text: '💭 Вы поругались. Ты:\n\n' +
      'А) Хочу решить прямо сейчас\n' +
      'Б) Дам время и вернусь к разговору\n' +
      'В) Ухожу и переключаюсь на своё',
    keyboard: new InlineKeyboard()
      .text('А', 'ob:ANXIOUS').text('Б', 'ob:SECURE').text('В', 'ob:AVOIDANT'),
  },
  GUY_REACTION_STYLE: {
    text: '⚡ Когда у вас спор — ты скорее:',
    keyboard: new InlineKeyboard()
      .text('Разобраться и решить', 'ob:SOLVER').row()
      .text('Чтобы всё успокоилось', 'ob:AVOIDER').row()
      .text('Говорю прямо', 'ob:EXPRESSIVE').row()
      .text('Ухожу подумать', 'ob:THINKER'),
  },
  GUY_LOVE_LANG: {
    text: '❤️ Ты чувствуешь, что тебя ценят, когда:',
    keyboard: new InlineKeyboard()
      .text('Говорят словами', 'ob:WORDS').row()
      .text('Делают что-то для меня', 'ob:ACTS').row()
      .text('Просто рядом', 'ob:TIME').row()
      .text('Физический контакт', 'ob:TOUCH').row()
      .text('Подарок / жест', 'ob:GIFTS'),
  },
  GUY_STRESS_SIGNALS: {
    text: '🔋 Когда ты на пределе — что реально помогает?',
    keyboard: new InlineKeyboard()
      .text('Побыть одному', 'ob:alone').row()
      .text('Спорт', 'ob:sport').row()
      .text('Поговорить с ней', 'ob:talk').row()
      .text('Переключиться', 'ob:distract').row()
      .text('Сон', 'ob:sleep'),
  },
  GUY_ABOUT_HER: {
    text: '💌 Что первым делом зацепило в ней, когда вы познакомились?\n\n_Напиши — я передам ей в красивой обёртке_',
    keyboard: null, // free text
  },
  GUY_DONE: {
    text: '📈 Настройка завершена! Теперь ты на 34% более понимающий партнёр.',
    keyboard: new InlineKeyboard().text('Готово ✅', 'ob:done'),
  },
};

module.exports = { onboardingKeyboards };
