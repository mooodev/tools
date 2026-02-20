module.exports = {
  welcome: '👋 Welcome to *Splitwise Bot*!\n\nI help you split expenses between friends and groups.\n\nChoose an action:',
  language_selected: '✅ Language set: English',
  select_language: '🌐 Выберите язык / Select language:',
  russian: '🇷🇺 Русский',
  english: '🇬🇧 English',

  // Main menu
  menu_groups: '👥 My Groups',
  menu_add_expense: '💰 Add Expense',
  menu_balance: '📊 Balance',
  menu_settle: '💸 Settle Up',
  menu_history: '📋 History',
  menu_settings: '⚙️ Settings',
  menu_friends: '👤 Friends',
  menu_help: '❓ Help',
  menu_webapp: '🌐 Open App',

  // Groups
  groups_title: '👥 *Your groups:*',
  groups_empty: 'You have no groups yet. Create your first one!',
  group_create: '➕ Create Group',
  group_name_prompt: '📝 Enter group name:',
  group_type_prompt: 'Choose group type:',
  group_type_home: '🏠 Home',
  group_type_trip: '✈️ Trip',
  group_type_couple: '💑 Couple',
  group_type_other: '📦 Other',
  group_created: '✅ Group "{name}" created!\n\nInvite code: `{code}`\nMembers can join with:\n/join {code}',
  group_joined: '✅ You joined the group "{name}"!',
  group_not_found: '❌ Group not found',
  group_already_member: 'You are already a member of this group',
  group_invite_invalid: '❌ Invalid invite code',
  group_members: '👥 *Members of "{name}":*',
  group_settings: '⚙️ *Settings for "{name}"*',
  group_simplify_on: '✅ Simplify debts: enabled',
  group_simplify_off: '❌ Simplify debts: disabled',
  group_toggle_simplify: '🔄 Toggle debt simplification',
  group_set_default_split: '📐 Set default split',
  group_delete: '🗑 Delete group',
  group_delete_confirm: '⚠️ Are you sure you want to delete the group "{name}"? All expenses will be lost.',
  group_deleted: '✅ Group deleted',
  group_leave: '🚪 Leave group',
  group_left: '✅ You left the group',

  // Expenses
  expense_select_group: '📁 Select group for expense:',
  expense_description_prompt: '📝 Enter expense description:',
  expense_amount_prompt: '💰 Enter amount:',
  expense_amount_invalid: '❌ Invalid amount. Enter a number:',
  expense_payer_prompt: '💳 Who paid?',
  expense_payer_multiple: '👥 Multiple payers',
  expense_split_type_prompt: '📐 How to split the expense?',
  expense_split_equal: '➗ Equally',
  expense_split_exact: '🔢 By exact amounts',
  expense_split_percent: '📊 By percentages',
  expense_split_shares: '📏 By shares',
  expense_split_adjustment: '±️ With adjustment',
  expense_select_participants: '👥 Select participants (tap to toggle):',
  expense_confirm_participants: '✅ Confirm participants',
  expense_enter_shares: '📏 Enter shares for each participant (format: Name:share, comma separated):',
  expense_enter_percentages: '📊 Enter percentages for each participant (format: Name:%, comma separated):',
  expense_enter_exact: '🔢 Enter amounts for each participant (format: Name:amount, comma separated):',
  expense_enter_adjustment: '±️ Enter adjustments (format: Name:+/-amount, comma separated, rest split equally):',
  expense_category_prompt: '📂 Select category:',
  expense_created: '✅ *Expense added!*\n\n📝 {description}\n💰 {amount} {currency}\n💳 Paid by: {payer}\n📐 Split: {split_type}\n📂 Category: {category}',
  expense_deleted: '✅ Expense deleted',
  expense_not_found: '❌ Expense not found',
  expense_recurring_prompt: '🔄 Make this expense recurring?',
  expense_recurring_yes: '✅ Yes',
  expense_recurring_no: '❌ No',
  expense_frequency_prompt: '📅 How often?',
  expense_freq_weekly: '📆 Weekly',
  expense_freq_biweekly: '📅 Biweekly',
  expense_freq_monthly: '🗓 Monthly',
  expense_freq_yearly: '📅 Yearly',
  expense_add_note: '📝 Add note',
  expense_add_photo: '📸 Attach receipt',
  expense_skip: '⏭ Skip',

  // Balance
  balance_title: '📊 *Balance*',
  balance_group_title: '📊 *Balance for "{name}":*',
  balance_you_owe: '🔴 You owe {name}: *{amount} {currency}*',
  balance_owed_to_you: '🟢 {name} owes you: *{amount} {currency}*',
  balance_settled: '✅ All expenses are settled!',
  balance_total_owe: '🔴 *Total you owe: {amount} {currency}*',
  balance_total_owed: '🟢 *Total owed to you: {amount} {currency}*',
  balance_view_group: '📊 By group',
  balance_view_total: '📊 Total',

  // Simplify debts
  simplify_title: '🔄 *Simplified debts:*',
  simplify_transaction: '💸 {from} → {to}: *{amount} {currency}*',
  simplify_no_debts: '✅ No debts to simplify',

  // Settle up
  settle_select_group: '💸 Select group to settle:',
  settle_select_person: '👤 Who do you want to pay?',
  settle_amount_prompt: '💰 Enter amount (max {max} {currency}):',
  settle_full: '💯 Full amount',
  settle_partial: '✏️ Custom amount',
  settle_method_prompt: '💳 Payment method:',
  settle_method_cash: '💵 Cash',
  settle_method_transfer: '🏦 Bank transfer',
  settle_method_other: '📱 Other',
  settle_confirmed: '✅ *Settlement recorded!*\n\n💸 {from} → {to}\n💰 {amount} {currency}\n💳 Method: {method}',

  // History
  history_title: '📋 *Expense history:*',
  history_empty: 'No history yet',
  history_expense: '{icon} *{description}*\n   💰 {amount} {currency} | 💳 {payer} | 📅 {date}',
  history_settlement: '💸 *Settlement*\n   {from} → {to}: {amount} {currency} | 📅 {date}',
  history_next: '➡️ Next',
  history_prev: '⬅️ Previous',

  // Friends
  friends_title: '👤 *Your friends:*',
  friends_empty: 'You have no friends in the app yet',
  friends_add: '➕ Add expense with friend',
  friends_balance: '💰 Balance: {amount} {currency}',
  friends_select: '👤 Select friend:',
  friends_add_by_username: '👤 Send your friend\'s @username or forward their message:',
  friends_added: '✅ Friend added!',
  friends_not_found: '❌ User not found. Make sure they are registered with the bot.',

  // Settings
  settings_title: '⚙️ *Settings*',
  settings_language: '🌐 Language',
  settings_currency: '💱 Default currency',
  settings_notifications: '🔔 Notifications',
  settings_export: '📤 Export data (CSV)',

  // Notifications
  notif_new_expense: '💰 New expense in "{group}":\n{description} — {amount} {currency}\nPaid by: {payer}',
  notif_expense_edited: '✏️ Expense edited in "{group}":\n{description}',
  notif_added_to_group: '👥 You were added to group "{group}"',
  notif_reminder: '⏰ Reminder: you owe {name} — {amount} {currency}',
  notif_settlement: '💸 {name} recorded a settlement: {amount} {currency}',
  notif_recurring: '🔄 Recurring expense auto-added: {description} — {amount} {currency}',

  // Reminders
  remind: '⏰ Remind',
  remind_sent: '✅ Reminder sent!',

  // Currency
  currency_select: '💱 Select currency:',
  currency_popular: '💱 Popular currencies:',
  currencies: {
    RUB: '🇷🇺 RUB — Russian Ruble',
    USD: '🇺🇸 USD — US Dollar',
    EUR: '🇪🇺 EUR — Euro',
    GBP: '🇬🇧 GBP — British Pound',
    TRY: '🇹🇷 TRY — Turkish Lira',
    KZT: '🇰🇿 KZT — Tenge',
    UAH: '🇺🇦 UAH — Hryvnia',
    GEL: '🇬🇪 GEL — Lari',
    THB: '🇹🇭 THB — Thai Baht',
    CNY: '🇨🇳 CNY — Chinese Yuan',
  },

  // Export
  export_generating: '⏳ Generating file...',
  export_ready: '📤 Your export is ready:',

  // Misc
  btn_back: '⬅️ Back',
  btn_cancel: '❌ Cancel',
  btn_confirm: '✅ Confirm',
  btn_yes: '✅ Yes',
  btn_no: '❌ No',
  btn_done: '✅ Done',
  error_generic: '❌ An error occurred. Please try again.',
  error_not_registered: 'Please press /start to register first.',
  cancelled: '❌ Action cancelled',

  // Help
  help_text: `❓ *Help — Splitwise Bot*

*Main commands:*
/start — Get started
/groups — My groups
/newgroup — Create a group
/join <code> — Join a group
/expense — Add an expense
/balance — View balance
/settle — Settle up
/history — Expense history
/friends — Friends & personal expenses
/settings — Settings
/export — Export data to CSV
/help — This help

*How to use:*
1. Create a group or join one with a code
2. Add expenses — specify who paid and how to split
3. Track your balance
4. Settle up when you're ready

*Split methods:*
• Equally — same for everyone
• By amounts — specify exact amounts
• By percentages — specify % for each
• By shares — specify proportions (2:1:1)
• With adjustment — equally ± corrections`,

  // Split type names
  split_types: {
    equal: 'Equally',
    exact: 'By exact amounts',
    percent: 'By percentages',
    shares: 'By shares',
    adjustment: 'With adjustment',
  },
};
