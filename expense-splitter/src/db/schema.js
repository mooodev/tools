const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id TEXT UNIQUE NOT NULL,
    username TEXT,
    first_name TEXT,
    last_name TEXT,
    language TEXT DEFAULT 'ru',
    currency TEXT DEFAULT 'RUB',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS groups_ (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT DEFAULT 'other',
    currency TEXT DEFAULT 'RUB',
    simplify_debts INTEGER DEFAULT 1,
    default_split_type TEXT DEFAULT 'equal',
    default_split_data TEXT,
    created_by INTEGER REFERENCES users(id),
    telegram_chat_id TEXT,
    invite_code TEXT UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS group_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL REFERENCES groups_(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'member',
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(group_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE NOT NULL,
    icon TEXT NOT NULL,
    name_ru TEXT NOT NULL,
    name_en TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER REFERENCES groups_(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    total_amount REAL NOT NULL,
    currency TEXT DEFAULT 'RUB',
    category_id INTEGER REFERENCES categories(id),
    split_type TEXT NOT NULL DEFAULT 'equal',
    created_by INTEGER NOT NULL REFERENCES users(id),
    receipt_photo TEXT,
    note TEXT,
    is_settlement INTEGER DEFAULT 0,
    recurring_id INTEGER REFERENCES recurring_expenses(id),
    date DATE DEFAULT CURRENT_DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS expense_payers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    amount REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS expense_splits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    amount REAL NOT NULL,
    share_value REAL,
    percentage REAL
  );

  CREATE TABLE IF NOT EXISTS expense_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    amount REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS expense_item_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL REFERENCES expense_items(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    share REAL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS expense_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    text TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS friend_expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    friend_id INTEGER NOT NULL REFERENCES users(id),
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'RUB',
    paid_by INTEGER NOT NULL REFERENCES users(id),
    category_id INTEGER REFERENCES categories(id),
    note TEXT,
    date DATE DEFAULT CURRENT_DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS settlements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER REFERENCES groups_(id) ON DELETE CASCADE,
    from_user_id INTEGER NOT NULL REFERENCES users(id),
    to_user_id INTEGER NOT NULL REFERENCES users(id),
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'RUB',
    method TEXT DEFAULT 'cash',
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS recurring_expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL REFERENCES groups_(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    total_amount REAL NOT NULL,
    currency TEXT DEFAULT 'RUB',
    category_id INTEGER REFERENCES categories(id),
    split_type TEXT NOT NULL DEFAULT 'equal',
    split_data TEXT,
    payer_data TEXT,
    created_by INTEGER NOT NULL REFERENCES users(id),
    frequency TEXT NOT NULL DEFAULT 'monthly',
    next_date DATE NOT NULL,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    type TEXT NOT NULL,
    data TEXT,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS exchange_rates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    base_currency TEXT NOT NULL,
    target_currency TEXT NOT NULL,
    rate REAL NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(base_currency, target_currency)
  );

  CREATE INDEX IF NOT EXISTS idx_expenses_group ON expenses(group_id);
  CREATE INDEX IF NOT EXISTS idx_expense_payers_expense ON expense_payers(expense_id);
  CREATE INDEX IF NOT EXISTS idx_expense_splits_expense ON expense_splits(expense_id);
  CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members(group_id);
  CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id);
  CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
  CREATE INDEX IF NOT EXISTS idx_settlements_group ON settlements(group_id);
`;

module.exports = SCHEMA;
