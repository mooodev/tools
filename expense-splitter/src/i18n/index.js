const ru = require('./ru');
const en = require('./en');

const locales = { ru, en };

function t(lang, key, params = {}) {
  const locale = locales[lang] || locales.ru;
  const keys = key.split('.');
  let value = locale;

  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k];
    } else {
      // Fallback to Russian
      value = locales.ru;
      for (const fk of keys) {
        if (value && typeof value === 'object' && fk in value) {
          value = value[fk];
        } else {
          return key;
        }
      }
      break;
    }
  }

  if (typeof value !== 'string') return key;

  return value.replace(/\{(\w+)\}/g, (_, name) => {
    return params[name] !== undefined ? params[name] : `{${name}}`;
  });
}

function getUserLang(db, telegramId) {
  const user = db.prepare('SELECT language FROM users WHERE telegram_id = ?').get(String(telegramId));
  return user ? user.language : 'ru';
}

module.exports = { t, getUserLang, locales };
