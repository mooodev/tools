module.exports = {
  welcome: '👋 Добро пожаловать в *Сочтёмся*!\n\nЯ помогу вам разделить расходы между друзьями и группами.\n\nВыберите действие:',
  language_selected: '✅ Язык установлен: Русский',
  select_language: '🌐 Выберите язык / Select language:',
  russian: '🇷🇺 Русский',
  english: '🇬🇧 English',

  // Main menu
  menu_groups: '👥 Мои группы',
  menu_add_expense: '💰 Добавить расход',
  menu_balance: '📊 Баланс',
  menu_settle: '💸 Рассчитаться',
  menu_history: '📋 История',
  menu_settings: '⚙️ Настройки',
  menu_friends: '👤 Друзья',
  menu_help: '❓ Помощь',
  menu_webapp: '🌐 Открыть приложение',

  // Groups
  groups_title: '👥 *Ваши группы:*',
  groups_empty: 'У вас пока нет групп. Создайте первую!',
  group_create: '➕ Создать группу',
  group_name_prompt: '📝 Введите название группы:',
  group_type_prompt: 'Выберите тип группы:',
  group_type_home: '🏠 Дом',
  group_type_trip: '✈️ Поездка',
  group_type_couple: '💑 Пара',
  group_type_other: '📦 Другое',
  group_created: '✅ Группа «{name}» создана!\n\nКод приглашения: `{code}`\nУчастники могут присоединиться по команде:\n/join {code}',
  group_joined: '✅ Вы присоединились к группе «{name}»!',
  group_not_found: '❌ Группа не найдена',
  group_already_member: 'Вы уже участник этой группы',
  group_invite_invalid: '❌ Неверный код приглашения',
  group_members: '👥 *Участники группы «{name}»:*',
  group_settings: '⚙️ *Настройки группы «{name}»*',
  group_simplify_on: '✅ Упрощение долгов: включено',
  group_simplify_off: '❌ Упрощение долгов: выключено',
  group_toggle_simplify: '🔄 Переключить упрощение долгов',
  group_set_default_split: '📐 Установить деление по умолчанию',
  group_delete: '🗑 Удалить группу',
  group_delete_confirm: '⚠️ Вы уверены, что хотите удалить группу «{name}»? Все расходы будут потеряны.',
  group_deleted: '✅ Группа удалена',
  group_leave: '🚪 Покинуть группу',
  group_left: '✅ Вы покинули группу',

  // Expenses
  expense_select_group: '📁 Выберите группу для расхода:',
  expense_description_prompt: '📝 Введите описание расхода:',
  expense_amount_prompt: '💰 Введите сумму:',
  expense_amount_invalid: '❌ Некорректная сумма. Введите число:',
  expense_payer_prompt: '💳 Кто заплатил?',
  expense_payer_multiple: '👥 Несколько плательщиков',
  expense_split_type_prompt: '📐 Как разделить расход?',
  expense_split_equal: '➗ Поровну',
  expense_split_exact: '🔢 По точным суммам',
  expense_split_percent: '📊 По процентам',
  expense_split_shares: '📏 По долям',
  expense_split_adjustment: '±️ С корректировкой',
  expense_select_participants: '👥 Выберите участников (нажмите для выбора/отмены):',
  expense_confirm_participants: '✅ Подтвердить участников',
  expense_enter_shares: '📏 Введите доли для каждого участника (формат: Имя:доля, через запятую):',
  expense_enter_percentages: '📊 Введите проценты для каждого участника (формат: Имя:%, через запятую):',
  expense_enter_exact: '🔢 Введите суммы для каждого участника (формат: Имя:сумма, через запятую):',
  expense_enter_adjustment: '±️ Введите корректировки (формат: Имя:+/-сумма, через запятую, остальные поровну):',
  expense_category_prompt: '📂 Выберите категорию:',
  expense_created: '✅ *Расход добавлен!*\n\n📝 {description}\n💰 {amount} {currency}\n💳 Оплатил: {payer}\n📐 Деление: {split_type}\n📂 Категория: {category}',
  expense_deleted: '✅ Расход удалён',
  expense_not_found: '❌ Расход не найден',
  expense_recurring_prompt: '🔄 Сделать расход повторяющимся?',
  expense_recurring_yes: '✅ Да',
  expense_recurring_no: '❌ Нет',
  expense_frequency_prompt: '📅 Как часто?',
  expense_freq_weekly: '📆 Еженедельно',
  expense_freq_biweekly: '📅 Раз в 2 недели',
  expense_freq_monthly: '🗓 Ежемесячно',
  expense_freq_yearly: '📅 Ежегодно',
  expense_add_note: '📝 Добавить заметку',
  expense_add_photo: '📸 Прикрепить чек',
  expense_skip: '⏭ Пропустить',

  // Balance
  balance_title: '📊 *Баланс*',
  balance_group_title: '📊 *Баланс группы «{name}»:*',
  balance_you_owe: '🔴 Вы должны {name}: *{amount} {currency}*',
  balance_owed_to_you: '🟢 {name} должен вам: *{amount} {currency}*',
  balance_settled: '✅ Все расходы оплачены!',
  balance_total_owe: '🔴 *Итого вы должны: {amount} {currency}*',
  balance_total_owed: '🟢 *Итого вам должны: {amount} {currency}*',
  balance_view_group: '📊 По группам',
  balance_view_total: '📊 Общий',

  // Simplify debts
  simplify_title: '🔄 *Упрощённые долги:*',
  simplify_transaction: '💸 {from} → {to}: *{amount} {currency}*',
  simplify_no_debts: '✅ Нет долгов для упрощения',

  // Settle up
  settle_select_group: '💸 Выберите группу для расчёта:',
  settle_select_person: '👤 Кому вы хотите заплатить?',
  settle_amount_prompt: '💰 Введите сумму (максимум {max} {currency}):',
  settle_full: '💯 Полная сумма',
  settle_partial: '✏️ Указать сумму',
  settle_method_prompt: '💳 Способ оплаты:',
  settle_method_cash: '💵 Наличные',
  settle_method_transfer: '🏦 Банковский перевод',
  settle_method_other: '📱 Другое',
  settle_confirmed: '✅ *Расчёт зафиксирован!*\n\n💸 {from} → {to}\n💰 {amount} {currency}\n💳 Способ: {method}',

  // History
  history_title: '📋 *История расходов:*',
  history_empty: 'История пуста',
  history_expense: '{icon} *{description}*\n   💰 {amount} {currency} | 💳 {payer} | 📅 {date}',
  history_settlement: '💸 *Расчёт*\n   {from} → {to}: {amount} {currency} | 📅 {date}',
  history_next: '➡️ Далее',
  history_prev: '⬅️ Назад',

  // Friends
  friends_title: '👤 *Ваши друзья:*',
  friends_empty: 'У вас пока нет друзей в приложении',
  friends_add: '➕ Добавить расход с другом',
  friends_balance: '💰 Баланс: {amount} {currency}',
  friends_select: '👤 Выберите друга:',
  friends_add_by_username: '👤 Отправьте @username друга или перешлите его сообщение:',
  friends_added: '✅ Друг добавлен!',
  friends_not_found: '❌ Пользователь не найден. Убедитесь, что он зарегистрирован в боте.',

  // Settings
  settings_title: '⚙️ *Настройки*',
  settings_language: '🌐 Язык',
  settings_currency: '💱 Валюта по умолчанию',
  settings_notifications: '🔔 Уведомления',
  settings_export: '📤 Экспорт данных (CSV)',

  // Notifications
  notif_new_expense: '💰 Новый расход в группе «{group}»:\n{description} — {amount} {currency}\nОплатил: {payer}',
  notif_expense_edited: '✏️ Расход изменён в группе «{group}»:\n{description}',
  notif_added_to_group: '👥 Вас добавили в группу «{group}»',
  notif_reminder: '⏰ Напоминание: вы должны {name} — {amount} {currency}',
  notif_settlement: '💸 {name} зафиксировал расчёт: {amount} {currency}',
  notif_recurring: '🔄 Автоматически добавлен повторяющийся расход: {description} — {amount} {currency}',

  // Reminders
  remind: '⏰ Напомнить',
  remind_sent: '✅ Напоминание отправлено!',

  // Currency
  currency_select: '💱 Выберите валюту:',
  currency_popular: '💱 Популярные валюты:',
  currencies: {
    RUB: '🇷🇺 RUB — Российский рубль',
    USD: '🇺🇸 USD — Доллар США',
    EUR: '🇪🇺 EUR — Евро',
    GBP: '🇬🇧 GBP — Фунт стерлингов',
    TRY: '🇹🇷 TRY — Турецкая лира',
    KZT: '🇰🇿 KZT — Тенге',
    UAH: '🇺🇦 UAH — Гривна',
    GEL: '🇬🇪 GEL — Лари',
    THB: '🇹🇭 THB — Бат',
    CNY: '🇨🇳 CNY — Юань',
  },

  // Export
  export_generating: '⏳ Генерирую файл...',
  export_ready: '📤 Ваш экспорт готов:',

  // Misc
  btn_back: '⬅️ Назад',
  btn_cancel: '❌ Отмена',
  btn_confirm: '✅ Подтвердить',
  btn_yes: '✅ Да',
  btn_no: '❌ Нет',
  btn_done: '✅ Готово',
  error_generic: '❌ Произошла ошибка. Попробуйте ещё раз.',
  error_not_registered: 'Сначала нажмите /start для регистрации.',
  cancelled: '❌ Действие отменено',

  // Help
  help_text: `❓ *Помощь — Сочтёмся*

*Основные команды:*
/start — Начало работы
/groups — Мои группы
/newgroup — Создать группу
/join <код> — Присоединиться к группе
/expense — Добавить расход
/balance — Посмотреть баланс
/settle — Рассчитаться
/history — История расходов
/friends — Друзья и личные расходы
/settings — Настройки
/export — Экспорт данных в CSV
/help — Эта справка

*Как пользоваться:*
1. Создайте группу или присоединитесь по коду
2. Добавляйте расходы — указывайте кто платил и как делить
3. Следите за балансом
4. Рассчитывайтесь когда будете готовы

*Способы деления:*
• Поровну — на всех одинаково
• По суммам — указать точные суммы
• По процентам — указать % для каждого
• По долям — указать пропорции (2:1:1)
• С корректировкой — поровну ± поправки`,

  // Split type names
  split_types: {
    equal: 'Поровну',
    exact: 'По суммам',
    percent: 'По процентам',
    shares: 'По долям',
    adjustment: 'С корректировкой',
  },
};
