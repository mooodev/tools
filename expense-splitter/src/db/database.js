const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const SCHEMA = require('./schema');

let db;

function getDb() {
  if (db) return db;

  const dbPath = process.env.DB_PATH || './data/expense-splitter.db';
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const statements = SCHEMA.split(';').filter(s => s.trim());
  for (const stmt of statements) {
    db.exec(stmt + ';');
  }

  seedCategories(db);
  return db;
}

function seedCategories(db) {
  const count = db.prepare('SELECT COUNT(*) as c FROM categories').get().c;
  if (count > 0) return;

  const categories = [
    { key: 'food', icon: '🍕', name_ru: 'Еда и напитки', name_en: 'Food & Drinks' },
    { key: 'groceries', icon: '🛒', name_ru: 'Продукты', name_en: 'Groceries' },
    { key: 'restaurant', icon: '🍽️', name_ru: 'Рестораны', name_en: 'Restaurants' },
    { key: 'transport', icon: '🚕', name_ru: 'Транспорт', name_en: 'Transport' },
    { key: 'fuel', icon: '⛽', name_ru: 'Бензин', name_en: 'Fuel' },
    { key: 'housing', icon: '🏠', name_ru: 'Жильё', name_en: 'Housing' },
    { key: 'rent', icon: '🔑', name_ru: 'Аренда', name_en: 'Rent' },
    { key: 'utilities', icon: '💡', name_ru: 'Коммунальные', name_en: 'Utilities' },
    { key: 'entertainment', icon: '🎬', name_ru: 'Развлечения', name_en: 'Entertainment' },
    { key: 'shopping', icon: '🛍️', name_ru: 'Покупки', name_en: 'Shopping' },
    { key: 'health', icon: '💊', name_ru: 'Здоровье', name_en: 'Health' },
    { key: 'travel', icon: '✈️', name_ru: 'Путешествия', name_en: 'Travel' },
    { key: 'clothing', icon: '👕', name_ru: 'Одежда', name_en: 'Clothing' },
    { key: 'education', icon: '📚', name_ru: 'Образование', name_en: 'Education' },
    { key: 'subscriptions', icon: '📱', name_ru: 'Подписки', name_en: 'Subscriptions' },
    { key: 'gifts', icon: '🎁', name_ru: 'Подарки', name_en: 'Gifts' },
    { key: 'sports', icon: '⚽', name_ru: 'Спорт', name_en: 'Sports' },
    { key: 'alcohol', icon: '🍷', name_ru: 'Алкоголь', name_en: 'Alcohol' },
    { key: 'parking', icon: '🅿️', name_ru: 'Парковка', name_en: 'Parking' },
    { key: 'other', icon: '📦', name_ru: 'Другое', name_en: 'Other' },
  ];

  const insert = db.prepare(
    'INSERT INTO categories (key, icon, name_ru, name_en) VALUES (?, ?, ?, ?)'
  );
  const tx = db.transaction(() => {
    for (const cat of categories) {
      insert.run(cat.key, cat.icon, cat.name_ru, cat.name_en);
    }
  });
  tx();
}

module.exports = { getDb };
