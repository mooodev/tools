const TelegramBot = require('node-telegram-bot-api');
const { t, getUserLang } = require('../i18n');
const { getDb } = require('../db/database');
const userService = require('../services/userService');
const groupService = require('../services/groupService');
const expenseService = require('../services/expenseService');
const balanceService = require('../services/balanceService');
const recurringService = require('../services/recurringService');
const notificationService = require('../services/notificationService');
const exportService = require('../services/exportService');
const { calculateSplits } = require('../services/splitCalculator');
const { getState, setState, clearState, updateState } = require('./stateManager');
const kb = require('./keyboards');
const fs = require('fs');
const path = require('path');

function createBot(token, options = {}) {
  const bot = new TelegramBot(token, { polling: true, ...options });
  notificationService.setBotInstance(bot);

  // ===== COMMANDS =====

  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const user = userService.ensureUser(msg.from);
    const lang = user.language;
    clearState(chatId, msg.from.id);

    await bot.sendMessage(chatId, t(lang, 'welcome'), kb.mainMenu(lang));
  });

  bot.onText(/\/lang/, async (msg) => {
    const chatId = msg.chat.id;
    await bot.sendMessage(chatId, t('ru', 'select_language'), kb.languageKeyboard());
  });

  bot.onText(/\/groups/, async (msg) => {
    await showGroups(msg.chat.id, msg.from);
  });

  bot.onText(/\/newgroup/, async (msg) => {
    const chatId = msg.chat.id;
    const user = userService.ensureUser(msg.from);
    const lang = user.language;
    setState(chatId, msg.from.id, { action: 'create_group', step: 'name' });
    await bot.sendMessage(chatId, t(lang, 'group_name_prompt'));
  });

  bot.onText(/\/join (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const user = userService.ensureUser(msg.from);
    const lang = user.language;
    const code = match[1].trim();

    const group = groupService.getGroupByInviteCode(code);
    if (!group) {
      return bot.sendMessage(chatId, t(lang, 'group_invite_invalid'));
    }

    if (groupService.isMember(group.id, user.id)) {
      return bot.sendMessage(chatId, t(lang, 'group_already_member'));
    }

    groupService.addMember(group.id, user.id);
    await bot.sendMessage(chatId, t(lang, 'group_joined', { name: group.name }), kb.mainMenu(lang));

    // Notify group
    const displayName = userService.getDisplayName(user);
    await notificationService.notifyGroupMembers(
      group.id, user.id,
      t(lang, 'notif_added_to_group', { group: group.name }) + ` (${displayName})`
    );
  });

  bot.onText(/\/expense/, async (msg) => {
    await startExpenseFlow(msg.chat.id, msg.from);
  });

  bot.onText(/\/balance/, async (msg) => {
    await showBalance(msg.chat.id, msg.from);
  });

  bot.onText(/\/settle/, async (msg) => {
    await startSettleFlow(msg.chat.id, msg.from);
  });

  bot.onText(/\/history/, async (msg) => {
    await showHistory(msg.chat.id, msg.from, 0);
  });

  bot.onText(/\/friends/, async (msg) => {
    await showFriends(msg.chat.id, msg.from);
  });

  bot.onText(/\/settings/, async (msg) => {
    await showSettings(msg.chat.id, msg.from);
  });

  bot.onText(/\/export/, async (msg) => {
    await doExport(msg.chat.id, msg.from);
  });

  bot.onText(/\/help/, async (msg) => {
    const user = userService.ensureUser(msg.from);
    await bot.sendMessage(msg.chat.id, t(user.language, 'help_text'), { parse_mode: 'Markdown' });
  });

  // ===== TEXT MENU HANDLER =====

  bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/')) return;

    const chatId = msg.chat.id;
    const user = userService.ensureUser(msg.from);
    const lang = user.language;
    const text = msg.text.trim();

    // Check if it's a menu button
    const menuMap = {
      [t(lang, 'menu_groups')]: () => showGroups(chatId, msg.from),
      [t(lang, 'menu_add_expense')]: () => startExpenseFlow(chatId, msg.from),
      [t(lang, 'menu_balance')]: () => showBalance(chatId, msg.from),
      [t(lang, 'menu_settle')]: () => startSettleFlow(chatId, msg.from),
      [t(lang, 'menu_history')]: () => showHistory(chatId, msg.from, 0),
      [t(lang, 'menu_friends')]: () => showFriends(chatId, msg.from),
      [t(lang, 'menu_settings')]: () => showSettings(chatId, msg.from),
      [t(lang, 'menu_help')]: () => bot.sendMessage(chatId, t(lang, 'help_text'), { parse_mode: 'Markdown' }),
    };

    if (menuMap[text]) {
      return menuMap[text]();
    }

    // Handle stateful conversation
    const state = getState(chatId, msg.from.id);
    if (state) {
      await handleStateInput(bot, chatId, msg.from, state, text);
    }
  });

  // ===== PHOTO HANDLER =====

  bot.on('photo', async (msg) => {
    const chatId = msg.chat.id;
    const state = getState(chatId, msg.from.id);
    if (state && state.action === 'add_expense' && state.step === 'photo') {
      const fileId = msg.photo[msg.photo.length - 1].file_id;
      updateState(chatId, msg.from.id, { receiptPhoto: fileId, step: 'recurring' });
      const user = userService.ensureUser(msg.from);
      await bot.sendMessage(chatId, t(user.language, 'expense_recurring_prompt'), kb.recurringKeyboard(user.language));
    }
  });

  // ===== CALLBACK QUERIES =====

  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const msgId = query.message.message_id;
    const data = query.data;
    const user = userService.ensureUser(query.from);
    const lang = user.language;

    await bot.answerCallbackQuery(query.id);

    try {
      // Language selection
      if (data.startsWith('lang:')) {
        const newLang = data.split(':')[1];
        userService.setLanguage(query.from.id, newLang);
        await bot.editMessageText(t(newLang, 'language_selected'), { chat_id: chatId, message_id: msgId });
        await bot.sendMessage(chatId, t(newLang, 'welcome'), kb.mainMenu(newLang));
        return;
      }

      // Cancel
      if (data === 'cancel') {
        clearState(chatId, query.from.id);
        await bot.editMessageText(t(lang, 'cancelled'), { chat_id: chatId, message_id: msgId });
        return;
      }

      // Main menu
      if (data === 'main') {
        clearState(chatId, query.from.id);
        await bot.sendMessage(chatId, t(lang, 'welcome'), kb.mainMenu(lang));
        return;
      }

      // Groups
      if (data === 'groups:list') {
        await showGroupsInline(chatId, msgId, user);
        return;
      }

      if (data === 'group:create') {
        setState(chatId, query.from.id, { action: 'create_group', step: 'name' });
        await bot.sendMessage(chatId, t(lang, 'group_name_prompt'));
        return;
      }

      if (data.startsWith('group:select:')) {
        const groupId = parseInt(data.split(':')[2]);
        await showGroupDetail(chatId, msgId, user, groupId);
        return;
      }

      if (data.startsWith('gtype:')) {
        const gtype = data.split(':')[1];
        const state = getState(chatId, query.from.id);
        if (state && state.action === 'create_group' && state.step === 'type') {
          const group = groupService.createGroup(state.groupName, gtype, user.id, user.currency || 'RUB');
          clearState(chatId, query.from.id);
          await bot.sendMessage(chatId, t(lang, 'group_created', { name: group.name, code: group.invite_code }), {
            parse_mode: 'Markdown',
            ...kb.mainMenu(lang),
          });
        }
        return;
      }

      // Group settings
      if (data.startsWith('gsettings:')) {
        await handleGroupSettings(bot, chatId, msgId, user, data);
        return;
      }

      // Expense: select group
      if (data.startsWith('expgroup:')) {
        const groupId = parseInt(data.split(':')[1]);
        setState(chatId, query.from.id, {
          action: 'add_expense',
          step: 'description',
          groupId,
        });
        await bot.sendMessage(chatId, t(lang, 'expense_description_prompt'));
        return;
      }

      // Expense: payer selection
      if (data.startsWith('payer:')) {
        const parts = data.split(':');
        const groupId = parseInt(parts[1]);
        const payerIdStr = parts[2];
        const state = getState(chatId, query.from.id);

        if (payerIdStr === 'multiple') {
          // For simplicity, prompt user to enter amounts in text
          updateState(chatId, query.from.id, { step: 'multiple_payers' });
          const members = groupService.getGroupMembers(groupId);
          const names = members.map(m => m.first_name || m.username).join(', ');
          await bot.sendMessage(chatId,
            `Enter amounts paid by each person (format: Name:amount, comma separated).\nMembers: ${names}`
          );
        } else {
          const payerId = parseInt(payerIdStr);
          updateState(chatId, query.from.id, {
            step: 'split_type',
            payers: [{ userId: payerId, amount: state.amount }],
          });
          await bot.sendMessage(chatId, t(lang, 'expense_split_type_prompt'), kb.splitTypeKeyboard(lang));
        }
        return;
      }

      // Split type selection
      if (data.startsWith('split:')) {
        const splitType = data.split(':')[1];
        const state = getState(chatId, query.from.id);
        if (!state) return;

        updateState(chatId, query.from.id, { splitType });

        const members = groupService.getGroupMembers(state.groupId);
        const selected = members.map(m => m.id);

        if (splitType === 'equal') {
          updateState(chatId, query.from.id, {
            step: 'select_participants',
            participants: selected,
          });
          await bot.sendMessage(chatId, t(lang, 'expense_select_participants'),
            kb.participantSelectionKeyboard(members, selected, state.groupId, lang));
        } else if (splitType === 'exact') {
          updateState(chatId, query.from.id, { step: 'enter_exact' });
          const names = members.map(m => m.first_name || m.username).join(', ');
          await bot.sendMessage(chatId, t(lang, 'expense_enter_exact') + `\n(${names})`);
        } else if (splitType === 'percent') {
          updateState(chatId, query.from.id, { step: 'enter_percent' });
          const names = members.map(m => m.first_name || m.username).join(', ');
          await bot.sendMessage(chatId, t(lang, 'expense_enter_percentages') + `\n(${names})`);
        } else if (splitType === 'shares') {
          updateState(chatId, query.from.id, { step: 'enter_shares' });
          const names = members.map(m => m.first_name || m.username).join(', ');
          await bot.sendMessage(chatId, t(lang, 'expense_enter_shares') + `\n(${names})`);
        } else if (splitType === 'adjustment') {
          updateState(chatId, query.from.id, { step: 'enter_adjustment' });
          const names = members.map(m => m.first_name || m.username).join(', ');
          await bot.sendMessage(chatId, t(lang, 'expense_enter_adjustment') + `\n(${names})`);
        }
        return;
      }

      // Participant toggle
      if (data.startsWith('participant:toggle:')) {
        const parts = data.split(':');
        const groupId = parseInt(parts[2]);
        const memberId = parseInt(parts[3]);
        const state = getState(chatId, query.from.id);
        if (!state) return;

        let participants = state.participants || [];
        if (participants.includes(memberId)) {
          participants = participants.filter(id => id !== memberId);
        } else {
          participants.push(memberId);
        }
        updateState(chatId, query.from.id, { participants });

        const members = groupService.getGroupMembers(groupId);
        await bot.editMessageReplyMarkup(
          kb.participantSelectionKeyboard(members, participants, groupId, lang).reply_markup,
          { chat_id: chatId, message_id: msgId }
        );
        return;
      }

      // Participant confirm
      if (data.startsWith('participant:confirm:')) {
        const state = getState(chatId, query.from.id);
        if (!state || !state.participants || state.participants.length === 0) return;

        updateState(chatId, query.from.id, { step: 'category' });
        const categories = expenseService.getCategories();
        await bot.sendMessage(chatId, t(lang, 'expense_category_prompt'), kb.categoryKeyboard(categories, lang));
        return;
      }

      // Category selection
      if (data.startsWith('cat:')) {
        const categoryId = parseInt(data.split(':')[1]);
        const state = getState(chatId, query.from.id);
        if (!state) return;

        updateState(chatId, query.from.id, { categoryId, step: 'note' });
        await bot.sendMessage(chatId, t(lang, 'expense_add_note'), {
          reply_markup: {
            inline_keyboard: [
              [{ text: t(lang, 'expense_skip'), callback_data: 'skip:note' }],
            ],
          },
        });
        return;
      }

      // Skip note
      if (data === 'skip:note') {
        updateState(chatId, query.from.id, { step: 'photo' });
        await bot.sendMessage(chatId, t(lang, 'expense_add_photo'), {
          reply_markup: {
            inline_keyboard: [
              [{ text: t(lang, 'expense_skip'), callback_data: 'skip:photo' }],
            ],
          },
        });
        return;
      }

      // Skip photo
      if (data === 'skip:photo') {
        updateState(chatId, query.from.id, { step: 'recurring' });
        await bot.sendMessage(chatId, t(lang, 'expense_recurring_prompt'), kb.recurringKeyboard(lang));
        return;
      }

      // Recurring decision
      if (data.startsWith('recurring:')) {
        const isRecurring = data.split(':')[1] === 'yes';
        if (isRecurring) {
          updateState(chatId, query.from.id, { step: 'frequency', isRecurring: true });
          await bot.sendMessage(chatId, t(lang, 'expense_frequency_prompt'), kb.frequencyKeyboard(lang));
        } else {
          await finalizeExpense(bot, chatId, query.from);
        }
        return;
      }

      // Frequency
      if (data.startsWith('freq:')) {
        const frequency = data.split(':')[1];
        updateState(chatId, query.from.id, { frequency });
        await finalizeExpense(bot, chatId, query.from);
        return;
      }

      // Settle: group select
      if (data.startsWith('settlegroup:')) {
        const groupId = parseInt(data.split(':')[1]);
        await showSettleOptions(bot, chatId, query.from, groupId);
        return;
      }

      // Settle: person select
      if (data.startsWith('settle:person:')) {
        const parts = data.split(':');
        const toUserId = parseInt(parts[2]);
        const maxAmount = parseFloat(parts[3]);
        const state = getState(chatId, query.from.id);
        updateState(chatId, query.from.id, { toUserId, maxAmount });
        await bot.sendMessage(chatId, t(lang, 'settle_amount_prompt', { max: maxAmount, currency: '' }),
          kb.settleAmountKeyboard(maxAmount, lang));
        return;
      }

      // Settle: amount
      if (data.startsWith('settle:amount:')) {
        const val = data.split(':')[2];
        const state = getState(chatId, query.from.id);
        if (!state) return;

        if (val === 'custom') {
          updateState(chatId, query.from.id, { step: 'settle_custom_amount' });
          await bot.sendMessage(chatId, t(lang, 'expense_amount_prompt'));
        } else {
          updateState(chatId, query.from.id, { settleAmount: parseFloat(val), step: 'settle_method' });
          await bot.sendMessage(chatId, t(lang, 'settle_method_prompt'), kb.settleMethodKeyboard(lang));
        }
        return;
      }

      // Settle: method
      if (data.startsWith('settle:method:')) {
        const method = data.split(':')[2];
        await finalizeSettle(bot, chatId, query.from, method);
        return;
      }

      // Currency selection
      if (data.startsWith('currency:')) {
        const currency = data.split(':')[1];
        userService.setCurrency(query.from.id, currency);
        await bot.editMessageText(t(lang, 'language_selected').replace('Русский', currency).replace('English', currency), {
          chat_id: chatId, message_id: msgId,
        });
        return;
      }

      // History pagination
      if (data.startsWith('history:')) {
        const page = parseInt(data.split(':')[1]);
        await showHistory(chatId, query.from, page);
        return;
      }

      // Balance by group
      if (data.startsWith('balgroup:')) {
        const groupId = parseInt(data.split(':')[1]);
        await showGroupBalance(chatId, user, groupId);
        return;
      }

      // Remind
      if (data.startsWith('remind:')) {
        const toUserId = parseInt(data.split(':')[1]);
        const amount = parseFloat(data.split(':')[2]);
        const currency = data.split(':')[3] || '';
        await notificationService.sendReminder(user.id, toUserId, amount, currency);
        await bot.sendMessage(chatId, t(lang, 'remind_sent'));
        return;
      }

    } catch (err) {
      console.error('Callback query error:', err);
      await bot.sendMessage(chatId, t(lang, 'error_generic'));
    }
  });

  // ===== FLOW FUNCTIONS =====

  async function showGroups(chatId, from) {
    const user = userService.ensureUser(from);
    const lang = user.language;
    const groups = groupService.getUserGroups(user.id);

    if (groups.length === 0) {
      await bot.sendMessage(chatId, t(lang, 'groups_empty'), {
        reply_markup: {
          inline_keyboard: [[{ text: t(lang, 'group_create'), callback_data: 'group:create' }]],
        },
      });
    } else {
      await bot.sendMessage(chatId, t(lang, 'groups_title'), {
        parse_mode: 'Markdown',
        ...kb.groupListKeyboard(groups, lang),
      });
    }
  }

  async function showGroupsInline(chatId, msgId, user) {
    const lang = user.language;
    const groups = groupService.getUserGroups(user.id);
    if (groups.length === 0) {
      await bot.editMessageText(t(lang, 'groups_empty'), {
        chat_id: chatId, message_id: msgId,
        reply_markup: { inline_keyboard: [[{ text: t(lang, 'group_create'), callback_data: 'group:create' }]] },
      });
    } else {
      await bot.editMessageText(t(lang, 'groups_title'), {
        chat_id: chatId, message_id: msgId, parse_mode: 'Markdown',
        ...kb.groupListKeyboard(groups, lang),
      });
    }
  }

  async function showGroupDetail(chatId, msgId, user, groupId) {
    const lang = user.language;
    const group = groupService.getGroupById(groupId);
    if (!group) return bot.sendMessage(chatId, t(lang, 'group_not_found'));

    const members = groupService.getGroupMembers(groupId);
    const debts = balanceService.calculatePairwiseDebts(groupId);

    let text = `${kb.typeIcon(group.type)} *${group.name}*\n`;
    text += `👥 ${members.length} ${lang === 'ru' ? 'участников' : 'members'}\n`;
    text += `💱 ${group.currency}\n`;
    text += `🔗 ${lang === 'ru' ? 'Код' : 'Code'}: \`${group.invite_code}\`\n\n`;

    if (debts.length === 0) {
      text += t(lang, 'balance_settled');
    } else {
      text += t(lang, 'simplify_title') + '\n';
      for (const d of debts) {
        const fromUser = userService.getUserById(d.from);
        const toUser = userService.getUserById(d.to);
        text += t(lang, 'simplify_transaction', {
          from: userService.getDisplayName(fromUser),
          to: userService.getDisplayName(toUser),
          amount: d.amount.toFixed(2),
          currency: group.currency,
        }) + '\n';
      }
    }

    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: t(lang, 'menu_add_expense'), callback_data: `expgroup:${groupId}` },
            { text: t(lang, 'menu_settle'), callback_data: `settlegroup:${groupId}` },
          ],
          [{ text: '⚙️', callback_data: `gsettings:show:${groupId}` }],
          [{ text: t(lang, 'btn_back'), callback_data: 'groups:list' }],
        ],
      },
    };

    try {
      await bot.editMessageText(text, { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', ...keyboard });
    } catch {
      await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', ...keyboard });
    }
  }

  async function handleGroupSettings(bot, chatId, msgId, user, data) {
    const lang = user.language;
    const parts = data.split(':');
    const action = parts[1];
    const groupId = parseInt(parts[2]);

    if (action === 'show') {
      const group = groupService.getGroupById(groupId);
      if (!group) return;
      await bot.editMessageText(t(lang, 'group_settings', { name: group.name }), {
        chat_id: chatId, message_id: msgId, parse_mode: 'Markdown',
        ...kb.groupSettingsKeyboard(group, lang),
      });
    } else if (action === 'simplify') {
      const group = groupService.getGroupById(groupId);
      groupService.updateGroupSettings(groupId, { simplify_debts: !group.simplify_debts });
      const updated = groupService.getGroupById(groupId);
      await bot.editMessageText(t(lang, 'group_settings', { name: updated.name }), {
        chat_id: chatId, message_id: msgId, parse_mode: 'Markdown',
        ...kb.groupSettingsKeyboard(updated, lang),
      });
    } else if (action === 'members') {
      const members = groupService.getGroupMembers(groupId);
      const group = groupService.getGroupById(groupId);
      let text = t(lang, 'group_members', { name: group.name }) + '\n\n';
      for (const m of members) {
        const name = userService.getDisplayName(m);
        const role = m.role === 'admin' ? ' 👑' : '';
        text += `• ${name}${role}\n`;
      }
      await bot.editMessageText(text, {
        chat_id: chatId, message_id: msgId, parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[{ text: t(lang, 'btn_back'), callback_data: `gsettings:show:${groupId}` }]],
        },
      });
    } else if (action === 'leave') {
      groupService.removeMember(groupId, user.id);
      await bot.editMessageText(t(lang, 'group_left'), { chat_id: chatId, message_id: msgId });
    } else if (action === 'delete') {
      const group = groupService.getGroupById(groupId);
      await bot.editMessageText(t(lang, 'group_delete_confirm', { name: group.name }), {
        chat_id: chatId, message_id: msgId,
        ...kb.confirmDeleteKeyboard(groupId, lang),
      });
    } else if (action === 'confirmdelete') {
      groupService.deleteGroup(groupId);
      await bot.editMessageText(t(lang, 'group_deleted'), { chat_id: chatId, message_id: msgId });
    }
  }

  async function startExpenseFlow(chatId, from) {
    const user = userService.ensureUser(from);
    const lang = user.language;
    const groups = groupService.getUserGroups(user.id);

    if (groups.length === 0) {
      return bot.sendMessage(chatId, t(lang, 'groups_empty'));
    }

    const buttons = groups.map(g => ([{
      text: `${kb.typeIcon(g.type)} ${g.name}`,
      callback_data: `expgroup:${g.id}`,
    }]));

    await bot.sendMessage(chatId, t(lang, 'expense_select_group'), {
      reply_markup: { inline_keyboard: buttons },
    });
  }

  async function showBalance(chatId, from) {
    const user = userService.ensureUser(from);
    const lang = user.language;
    const { owes, owed } = balanceService.getUserTotalBalance(user.id);

    let text = t(lang, 'balance_title') + '\n\n';

    if (owes.length === 0 && owed.length === 0) {
      text += t(lang, 'balance_settled');
    } else {
      let totalOwed = 0;
      let totalOwe = 0;

      for (const d of owed) {
        const other = userService.getUserById(d.userId);
        text += t(lang, 'balance_owed_to_you', {
          name: userService.getDisplayName(other),
          amount: d.amount.toFixed(2),
          currency: '',
        }) + '\n';
        totalOwed += d.amount;
      }

      for (const d of owes) {
        const other = userService.getUserById(d.userId);
        text += t(lang, 'balance_you_owe', {
          name: userService.getDisplayName(other),
          amount: d.amount.toFixed(2),
          currency: '',
        }) + '\n';
        totalOwe += d.amount;
      }

      text += '\n';
      if (totalOwed > 0) text += t(lang, 'balance_total_owed', { amount: totalOwed.toFixed(2), currency: '' }) + '\n';
      if (totalOwe > 0) text += t(lang, 'balance_total_owe', { amount: totalOwe.toFixed(2), currency: '' }) + '\n';
    }

    // Buttons for per-group view
    const groups = groupService.getUserGroups(user.id);
    const buttons = groups.map(g => ([{
      text: `${kb.typeIcon(g.type)} ${g.name}`,
      callback_data: `balgroup:${g.id}`,
    }]));

    await bot.sendMessage(chatId, text, {
      parse_mode: 'Markdown',
      reply_markup: buttons.length > 0 ? { inline_keyboard: buttons } : undefined,
    });
  }

  async function showGroupBalance(chatId, user, groupId) {
    const lang = user.language;
    const group = groupService.getGroupById(groupId);
    if (!group) return;

    const { owes, owed } = balanceService.getUserGroupDebts(groupId, user.id);
    let text = t(lang, 'balance_group_title', { name: group.name }) + '\n\n';

    if (owes.length === 0 && owed.length === 0) {
      text += t(lang, 'balance_settled');
    } else {
      for (const d of owed) {
        const other = userService.getUserById(d.to === user.id ? d.from : d.to);
        text += t(lang, 'balance_owed_to_you', {
          name: userService.getDisplayName(other),
          amount: d.amount.toFixed(2),
          currency: group.currency,
        }) + '\n';
      }
      for (const d of owes) {
        const other = userService.getUserById(d.to);
        text += t(lang, 'balance_you_owe', {
          name: userService.getDisplayName(other),
          amount: d.amount.toFixed(2),
          currency: group.currency,
        }) + '\n';
      }
    }

    // Add remind buttons
    const inlineButtons = [];
    for (const d of owed) {
      const other = userService.getUserById(d.from);
      inlineButtons.push([{
        text: `⏰ ${t(lang, 'remind')} ${userService.getDisplayName(other)}`,
        callback_data: `remind:${d.from}:${d.amount}:${group.currency}`,
      }]);
    }
    inlineButtons.push([{ text: t(lang, 'btn_back'), callback_data: 'main' }]);

    await bot.sendMessage(chatId, text, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: inlineButtons },
    });
  }

  async function startSettleFlow(chatId, from) {
    const user = userService.ensureUser(from);
    const lang = user.language;
    const groups = groupService.getUserGroups(user.id);

    if (groups.length === 0) {
      return bot.sendMessage(chatId, t(lang, 'groups_empty'));
    }

    const buttons = groups.map(g => ([{
      text: `${kb.typeIcon(g.type)} ${g.name}`,
      callback_data: `settlegroup:${g.id}`,
    }]));

    await bot.sendMessage(chatId, t(lang, 'settle_select_group'), {
      reply_markup: { inline_keyboard: buttons },
    });
  }

  async function showSettleOptions(bot, chatId, from, groupId) {
    const user = userService.ensureUser(from);
    const lang = user.language;
    const group = groupService.getGroupById(groupId);
    const debts = balanceService.calculatePairwiseDebts(groupId);
    const myDebts = debts.filter(d => d.from === user.id);

    if (myDebts.length === 0) {
      return bot.sendMessage(chatId, t(lang, 'balance_settled'));
    }

    setState(chatId, from.id, { action: 'settle', groupId, groupCurrency: group.currency });

    const members = groupService.getGroupMembers(groupId);
    const debtsWithCurrency = myDebts.map(d => ({ ...d, currency: group.currency }));
    await bot.sendMessage(chatId, t(lang, 'settle_select_person'),
      kb.settlePersonKeyboard(debtsWithCurrency, members, lang));
  }

  async function finalizeSettle(bot, chatId, from, method) {
    const user = userService.ensureUser(from);
    const lang = user.language;
    const state = getState(chatId, from.id);
    if (!state) return;

    const { groupId, toUserId, settleAmount, groupCurrency } = state;

    expenseService.createSettlement({
      groupId,
      fromUserId: user.id,
      toUserId,
      amount: settleAmount,
      currency: groupCurrency,
      method,
    });

    const toUser = userService.getUserById(toUserId);
    const methods = { cash: '💵', transfer: '🏦', other: '📱' };

    const confirmText = t(lang, 'settle_confirmed', {
      from: userService.getDisplayName(user),
      to: userService.getDisplayName(toUser),
      amount: settleAmount.toFixed(2),
      currency: groupCurrency || '',
      method: methods[method] || method,
    });

    clearState(chatId, from.id);
    await bot.sendMessage(chatId, confirmText, { parse_mode: 'Markdown', ...kb.mainMenu(lang) });

    // Notify the other person
    await notificationService.sendNotification(toUserId,
      t(toUser.language || 'ru', 'notif_settlement', {
        name: userService.getDisplayName(user),
        amount: `${settleAmount.toFixed(2)} ${groupCurrency}`,
      })
    );
  }

  async function showHistory(chatId, from, page) {
    const user = userService.ensureUser(from);
    const lang = user.language;
    const groups = groupService.getUserGroups(user.id);
    const pageSize = 10;

    let allExpenses = [];
    for (const g of groups) {
      const expenses = expenseService.getGroupExpenses(g.id, 100, 0);
      allExpenses = allExpenses.concat(expenses.map(e => ({ ...e, groupName: g.name })));
    }

    allExpenses.sort((a, b) => new Date(b.date) - new Date(a.date));
    const totalPages = Math.ceil(allExpenses.length / pageSize);
    const pageExpenses = allExpenses.slice(page * pageSize, (page + 1) * pageSize);

    if (pageExpenses.length === 0) {
      return bot.sendMessage(chatId, t(lang, 'history_empty'));
    }

    let text = t(lang, 'history_title') + `\n(${page + 1}/${totalPages})\n\n`;

    for (const exp of pageExpenses) {
      if (exp.is_settlement) {
        text += `💸 *Settlement* — ${exp.total_amount.toFixed(2)} ${exp.currency} | 📅 ${exp.date}\n`;
      } else {
        const icon = exp.category_icon || '📦';
        text += t(lang, 'history_expense', {
          icon,
          description: exp.description,
          amount: exp.total_amount.toFixed(2),
          currency: exp.currency,
          payer: '',
          date: exp.date,
        }) + `\n  📁 ${exp.groupName}\n`;
      }
      text += '\n';
    }

    await bot.sendMessage(chatId, text, {
      parse_mode: 'Markdown',
      ...kb.paginationKeyboard(page, totalPages, 'history', lang),
    });
  }

  async function showFriends(chatId, from) {
    const user = userService.ensureUser(from);
    const lang = user.language;
    const friends = userService.getAllFriends(user.id);

    if (friends.length === 0) {
      return bot.sendMessage(chatId, t(lang, 'friends_empty'));
    }

    let text = t(lang, 'friends_title') + '\n\n';
    const { owes, owed } = balanceService.getUserTotalBalance(user.id);

    const balanceMap = {};
    for (const d of owed) balanceMap[d.userId] = d.amount;
    for (const d of owes) balanceMap[d.userId] = -d.amount;

    for (const f of friends) {
      const name = userService.getDisplayName(f);
      const bal = balanceMap[f.id] || 0;
      const sign = bal > 0 ? '🟢' : bal < 0 ? '🔴' : '⚪';
      text += `${sign} *${name}*: ${bal > 0 ? '+' : ''}${bal.toFixed(2)}\n`;
    }

    await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  }

  async function showSettings(chatId, from) {
    const user = userService.ensureUser(from);
    const lang = user.language;

    await bot.sendMessage(chatId, t(lang, 'settings_title'), {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: t(lang, 'settings_language'), callback_data: 'settings:lang' }],
          [{ text: t(lang, 'settings_currency'), callback_data: 'settings:currency' }],
          [{ text: t(lang, 'settings_export'), callback_data: 'settings:export' }],
        ],
      },
    });
  }

  // Settings callbacks handled inside main callback handler
  bot.on('callback_query', async (query) => {
    const data = query.data;
    const chatId = query.message.chat.id;
    const user = userService.ensureUser(query.from);
    const lang = user.language;

    if (data === 'settings:lang') {
      await bot.sendMessage(chatId, t(lang, 'select_language'), kb.languageKeyboard());
    } else if (data === 'settings:currency') {
      const { locales } = require('../i18n');
      const currencies = locales[lang].currencies;
      await bot.sendMessage(chatId, t(lang, 'currency_popular'), kb.currencyKeyboard(currencies, lang));
    } else if (data === 'settings:export') {
      await doExport(chatId, query.from);
    }
  });

  async function doExport(chatId, from) {
    const user = userService.ensureUser(from);
    const lang = user.language;

    await bot.sendMessage(chatId, t(lang, 'export_generating'));

    const csv = exportService.exportUserExpensesToCSV(user.id, lang);
    const dir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const filePath = path.join(dir, `export_${user.id}_${Date.now()}.csv`);
    fs.writeFileSync(filePath, csv);

    await bot.sendDocument(chatId, filePath, { caption: t(lang, 'export_ready') });

    // Clean up after sending
    setTimeout(() => {
      try { fs.unlinkSync(filePath); } catch {}
    }, 60000);
  }

  async function finalizeExpense(bot, chatId, from) {
    const user = userService.ensureUser(from);
    const lang = user.language;
    const state = getState(chatId, from.id);
    if (!state) return;

    const {
      groupId, description, amount, payers, splitType,
      participants, categoryId, note, receiptPhoto, isRecurring, frequency,
      splitData,
    } = state;

    const group = groupService.getGroupById(groupId);
    const participantList = (participants || []).map(uid => ({ userId: uid }));
    const splits = calculateSplits(amount, participantList, splitType || 'equal', splitData || {});

    const expense = expenseService.createExpense({
      groupId,
      description,
      totalAmount: amount,
      currency: group.currency,
      categoryId: categoryId || null,
      splitType: splitType || 'equal',
      createdBy: user.id,
      payers: payers || [{ userId: user.id, amount }],
      splits,
      note: note || null,
      receiptPhoto: receiptPhoto || null,
    });

    // Handle recurring
    if (isRecurring && frequency) {
      const nextDate = new Date();
      switch (frequency) {
        case 'weekly': nextDate.setDate(nextDate.getDate() + 7); break;
        case 'biweekly': nextDate.setDate(nextDate.getDate() + 14); break;
        case 'monthly': nextDate.setMonth(nextDate.getMonth() + 1); break;
        case 'yearly': nextDate.setFullYear(nextDate.getFullYear() + 1); break;
      }

      recurringService.createRecurring({
        groupId,
        description,
        totalAmount: amount,
        currency: group.currency,
        categoryId,
        splitType: splitType || 'equal',
        splitData: splits,
        payerData: payers || [{ userId: user.id, amount }],
        createdBy: user.id,
        frequency,
        startDate: nextDate.toISOString().split('T')[0],
      });
    }

    const categories = expenseService.getCategories();
    const cat = categories.find(c => c.id === categoryId);
    const catName = cat ? (lang === 'ru' ? cat.name_ru : cat.name_en) : '';
    const payerUser = userService.getUserById((payers && payers[0]) ? payers[0].userId : user.id);

    const confirmText = t(lang, 'expense_created', {
      description,
      amount: amount.toFixed(2),
      currency: group.currency,
      payer: userService.getDisplayName(payerUser),
      split_type: t(lang, `split_types.${splitType || 'equal'}`),
      category: catName ? `${cat.icon} ${catName}` : '',
    });

    clearState(chatId, from.id);
    await bot.sendMessage(chatId, confirmText, { parse_mode: 'Markdown', ...kb.mainMenu(lang) });

    // Notify group members
    await notificationService.notifyGroupMembers(groupId, user.id,
      t(lang, 'notif_new_expense', {
        group: group.name,
        description,
        amount: amount.toFixed(2),
        currency: group.currency,
        payer: userService.getDisplayName(user),
      })
    );
  }

  // ===== STATE INPUT HANDLER =====

  async function handleStateInput(bot, chatId, from, state, text) {
    const user = userService.ensureUser(from);
    const lang = user.language;

    // Create group: name
    if (state.action === 'create_group' && state.step === 'name') {
      updateState(chatId, from.id, { groupName: text, step: 'type' });
      await bot.sendMessage(chatId, t(lang, 'group_type_prompt'), kb.groupTypeKeyboard(lang));
      return;
    }

    // Add expense: description
    if (state.action === 'add_expense' && state.step === 'description') {
      updateState(chatId, from.id, { description: text, step: 'amount' });
      await bot.sendMessage(chatId, t(lang, 'expense_amount_prompt'));
      return;
    }

    // Add expense: amount
    if (state.action === 'add_expense' && state.step === 'amount') {
      const amount = parseFloat(text.replace(',', '.'));
      if (isNaN(amount) || amount <= 0) {
        await bot.sendMessage(chatId, t(lang, 'expense_amount_invalid'));
        return;
      }
      updateState(chatId, from.id, { amount, step: 'payer' });
      const members = groupService.getGroupMembers(state.groupId);
      await bot.sendMessage(chatId, t(lang, 'expense_payer_prompt'),
        kb.memberListKeyboard(members, state.groupId, lang, 'payer'));
      return;
    }

    // Add expense: note
    if (state.action === 'add_expense' && state.step === 'note') {
      updateState(chatId, from.id, { note: text, step: 'photo' });
      await bot.sendMessage(chatId, t(lang, 'expense_add_photo'), {
        reply_markup: {
          inline_keyboard: [
            [{ text: t(lang, 'expense_skip'), callback_data: 'skip:photo' }],
          ],
        },
      });
      return;
    }

    // Enter exact amounts
    if (state.action === 'add_expense' && state.step === 'enter_exact') {
      const members = groupService.getGroupMembers(state.groupId);
      const parsed = parseSplitInput(text, members);
      if (!parsed) {
        await bot.sendMessage(chatId, t(lang, 'expense_amount_invalid'));
        return;
      }
      const participants = Object.keys(parsed).map(uid => ({ userId: parseInt(uid) }));
      const splitData = { amounts: {} };
      for (const [uid, val] of Object.entries(parsed)) {
        splitData.amounts[parseInt(uid)] = val;
      }
      updateState(chatId, from.id, { participants: participants.map(p => p.userId), splitData, step: 'category' });
      const categories = expenseService.getCategories();
      await bot.sendMessage(chatId, t(lang, 'expense_category_prompt'), kb.categoryKeyboard(categories, lang));
      return;
    }

    // Enter percentages
    if (state.action === 'add_expense' && state.step === 'enter_percent') {
      const members = groupService.getGroupMembers(state.groupId);
      const parsed = parseSplitInput(text, members);
      if (!parsed) {
        await bot.sendMessage(chatId, t(lang, 'expense_amount_invalid'));
        return;
      }
      const participants = Object.keys(parsed).map(uid => ({ userId: parseInt(uid) }));
      const splitData = { percentages: {} };
      for (const [uid, val] of Object.entries(parsed)) {
        splitData.percentages[parseInt(uid)] = val;
      }
      updateState(chatId, from.id, { participants: participants.map(p => p.userId), splitData, step: 'category' });
      const categories = expenseService.getCategories();
      await bot.sendMessage(chatId, t(lang, 'expense_category_prompt'), kb.categoryKeyboard(categories, lang));
      return;
    }

    // Enter shares
    if (state.action === 'add_expense' && state.step === 'enter_shares') {
      const members = groupService.getGroupMembers(state.groupId);
      const parsed = parseSplitInput(text, members);
      if (!parsed) {
        await bot.sendMessage(chatId, t(lang, 'expense_amount_invalid'));
        return;
      }
      const participants = Object.keys(parsed).map(uid => ({ userId: parseInt(uid) }));
      const splitData = { shares: {} };
      for (const [uid, val] of Object.entries(parsed)) {
        splitData.shares[parseInt(uid)] = val;
      }
      updateState(chatId, from.id, { participants: participants.map(p => p.userId), splitData, step: 'category' });
      const categories = expenseService.getCategories();
      await bot.sendMessage(chatId, t(lang, 'expense_category_prompt'), kb.categoryKeyboard(categories, lang));
      return;
    }

    // Enter adjustments
    if (state.action === 'add_expense' && state.step === 'enter_adjustment') {
      const members = groupService.getGroupMembers(state.groupId);
      const parsed = parseSplitInput(text, members);
      if (!parsed) {
        await bot.sendMessage(chatId, t(lang, 'expense_amount_invalid'));
        return;
      }
      const participants = members.map(m => m.id);
      const splitData = { adjustments: {} };
      for (const [uid, val] of Object.entries(parsed)) {
        splitData.adjustments[parseInt(uid)] = val;
      }
      updateState(chatId, from.id, { participants, splitData, step: 'category' });
      const categories = expenseService.getCategories();
      await bot.sendMessage(chatId, t(lang, 'expense_category_prompt'), kb.categoryKeyboard(categories, lang));
      return;
    }

    // Multiple payers
    if (state.action === 'add_expense' && state.step === 'multiple_payers') {
      const members = groupService.getGroupMembers(state.groupId);
      const parsed = parseSplitInput(text, members);
      if (!parsed) {
        await bot.sendMessage(chatId, t(lang, 'expense_amount_invalid'));
        return;
      }
      const payers = Object.entries(parsed).map(([uid, amt]) => ({
        userId: parseInt(uid), amount: amt,
      }));
      updateState(chatId, from.id, { payers, step: 'split_type' });
      await bot.sendMessage(chatId, t(lang, 'expense_split_type_prompt'), kb.splitTypeKeyboard(lang));
      return;
    }

    // Settle: custom amount
    if (state.action === 'settle' && state.step === 'settle_custom_amount') {
      const amount = parseFloat(text.replace(',', '.'));
      if (isNaN(amount) || amount <= 0 || amount > state.maxAmount) {
        await bot.sendMessage(chatId, t(lang, 'expense_amount_invalid'));
        return;
      }
      updateState(chatId, from.id, { settleAmount: amount, step: 'settle_method' });
      await bot.sendMessage(chatId, t(lang, 'settle_method_prompt'), kb.settleMethodKeyboard(lang));
      return;
    }
  }

  /**
   * Parse "Name:value, Name:value" input against group members.
   */
  function parseSplitInput(text, members) {
    const result = {};
    const parts = text.split(',').map(s => s.trim());

    for (const part of parts) {
      const [namePart, valuePart] = part.split(':').map(s => s.trim());
      if (!namePart || !valuePart) return null;

      const value = parseFloat(valuePart.replace(',', '.'));
      if (isNaN(value)) return null;

      // Find member by name
      const member = members.find(m => {
        const fn = (m.first_name || '').toLowerCase();
        const un = (m.username || '').toLowerCase();
        const input = namePart.toLowerCase().replace('@', '');
        return fn === input || un === input || fn.startsWith(input);
      });

      if (!member) return null;
      result[member.id] = value;
    }

    return Object.keys(result).length > 0 ? result : null;
  }

  return bot;
}

module.exports = { createBot };
