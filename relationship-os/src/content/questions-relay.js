/**
 * Relay questions — free text answers that get forwarded to partner.
 */
const RELAY_QUESTIONS = {
  RELAY_FIRST_IMPRESSION: {
    text: 'Что тебя зацепило при первой встрече?',
    textMale: 'Что первым делом зацепило в ней, когда вы познакомились?',
    textFemale: 'Что тебя зацепило в нём при первой встрече?',
    targetGender: 'BOTH',
  },
  RELAY_APPRECIATE_MOST: {
    text: 'Что ты больше всего ценишь в партнёре прямо сейчас?',
    textMale: 'Что ты больше всего ценишь в ней прямо сейчас?',
    textFemale: 'Что ты больше всего ценишь в нём прямо сейчас?',
    targetGender: 'BOTH',
  },
  RELAY_MISS_WHEN_APART: {
    text: 'Что ты больше всего замечаешь когда вас нет рядом?',
    targetGender: 'BOTH',
  },
  RELAY_PROUD_OF_PARTNER: {
    text: 'За что ты гордишься партнёром в последнее время?',
    textMale: 'За что ты гордишься ей в последнее время?',
    textFemale: 'За что ты гордишься им в последнее время?',
    targetGender: 'BOTH',
  },
  RELAY_BEST_MEMORY: {
    text: 'Какой момент с вами ты вспоминаешь чаще всего?',
    targetGender: 'BOTH',
  },
  RELAY_FEEL_LOVED: {
    text: 'Опиши момент когда ты больше всего чувствовал(а) что тебя любят',
    targetGender: 'BOTH',
  },
  RELAY_WISH_MORE_OF: {
    text: 'Если бы вы могли чаще делать что-то одно вместе — что бы это было?',
    targetGender: 'BOTH',
  },
  RELAY_GIRL_WHAT_HELPS: {
    text: 'Что он делает, и тебе сразу становится лучше?',
    targetGender: 'FEMALE',
  },
  RELAY_GUY_FEEL_RESPECTED: {
    text: 'Когда ты чувствуешь что она тебя уважает?',
    targetGender: 'MALE',
  },
  RELAY_DREAM_DATE: {
    text: 'Опиши идеальное свидание — без ограничений',
    textMale: 'Опиши идеальное свидание с ней — без ограничений',
    textFemale: 'Опиши идеальное свидание с ним — без ограничений',
    targetGender: 'BOTH',
  },
  RELAY_THANK_YOU: {
    text: 'Напиши одно «спасибо» партнёру за последнюю неделю',
    textMale: 'Напиши ей одно «спасибо» за последнюю неделю',
    textFemale: 'Напиши ему одно «спасибо» за последнюю неделю',
    targetGender: 'BOTH',
  },
};

// Rotation order for relay questions
const RELAY_ROTATION = Object.keys(RELAY_QUESTIONS);

/**
 * Get next relay question key for a pair.
 * @param {number} dayCount - pair's day count
 * @returns {string} question key
 */
function getNextRelayKey(dayCount) {
  const index = Math.floor(dayCount / 5) % RELAY_ROTATION.length;
  return RELAY_ROTATION[index];
}

/**
 * Build delivery template when forwarding answer to partner.
 */
function getRelayDeliveryTemplate(questionKey, fromGender, userText) {
  const question = RELAY_QUESTIONS[questionKey];
  if (!question) return `💌 Сообщение от партнёра:\n\n«${userText}»`;

  const pronoun = fromGender === 'MALE' ? 'Он' : 'Она';
  const questionText = question.text;

  return `💌 ${pronoun} ответил(а) на вопрос:\n` +
    `«${questionText}»\n\n` +
    `${pronoun} написал(а):\n«${userText}»\n\n` +
    `Никаких действий не нужно. Просто прочитай.`;
}

module.exports = { RELAY_QUESTIONS, RELAY_ROTATION, getNextRelayKey, getRelayDeliveryTemplate };
