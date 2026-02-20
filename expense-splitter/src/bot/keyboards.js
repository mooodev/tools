const { t } = require('../i18n');

function mainMenu(lang) {
  return {
    reply_markup: {
      keyboard: [
        [{ text: t(lang, 'menu_groups') }, { text: t(lang, 'menu_add_expense') }],
        [{ text: t(lang, 'menu_balance') }, { text: t(lang, 'menu_settle') }],
        [{ text: t(lang, 'menu_history') }, { text: t(lang, 'menu_friends') }],
        [{ text: t(lang, 'menu_settings') }, { text: t(lang, 'menu_help') }],
      ],
      resize_keyboard: true,
    },
    parse_mode: 'Markdown',
  };
}

function languageKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🇷🇺 Русский', callback_data: 'lang:ru' },
          { text: '🇬🇧 English', callback_data: 'lang:en' },
        ],
      ],
    },
  };
}

function groupListKeyboard(groups, lang, action = 'select') {
  const buttons = groups.map(g => ([{
    text: `${typeIcon(g.type)} ${g.name}`,
    callback_data: `group:${action}:${g.id}`,
  }]));

  buttons.push([{ text: t(lang, 'group_create'), callback_data: 'group:create' }]);
  return { reply_markup: { inline_keyboard: buttons } };
}

function groupTypeKeyboard(lang) {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: t(lang, 'group_type_home'), callback_data: 'gtype:home' },
          { text: t(lang, 'group_type_trip'), callback_data: 'gtype:trip' },
        ],
        [
          { text: t(lang, 'group_type_couple'), callback_data: 'gtype:couple' },
          { text: t(lang, 'group_type_other'), callback_data: 'gtype:other' },
        ],
      ],
    },
  };
}

function groupSettingsKeyboard(group, lang) {
  const simplifyText = group.simplify_debts
    ? t(lang, 'group_simplify_on')
    : t(lang, 'group_simplify_off');

  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: simplifyText, callback_data: `gsettings:simplify:${group.id}` }],
        [{ text: t(lang, 'group_members', { name: group.name }).replace('*', ''), callback_data: `gsettings:members:${group.id}` }],
        [{ text: t(lang, 'group_leave'), callback_data: `gsettings:leave:${group.id}` }],
        [{ text: t(lang, 'group_delete'), callback_data: `gsettings:delete:${group.id}` }],
        [{ text: t(lang, 'btn_back'), callback_data: 'groups:list' }],
      ],
    },
  };
}

function memberListKeyboard(members, groupId, lang, action = 'payer') {
  const buttons = members.map(m => ([{
    text: `${m.first_name || m.username || 'User'}`,
    callback_data: `${action}:${groupId}:${m.id}`,
  }]));

  if (action === 'payer') {
    buttons.push([{
      text: t(lang, 'expense_payer_multiple'),
      callback_data: `${action}:${groupId}:multiple`,
    }]);
  }

  buttons.push([{ text: t(lang, 'btn_cancel'), callback_data: 'cancel' }]);
  return { reply_markup: { inline_keyboard: buttons } };
}

function splitTypeKeyboard(lang) {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: t(lang, 'expense_split_equal'), callback_data: 'split:equal' }],
        [{ text: t(lang, 'expense_split_exact'), callback_data: 'split:exact' }],
        [{ text: t(lang, 'expense_split_percent'), callback_data: 'split:percent' }],
        [{ text: t(lang, 'expense_split_shares'), callback_data: 'split:shares' }],
        [{ text: t(lang, 'expense_split_adjustment'), callback_data: 'split:adjustment' }],
      ],
    },
  };
}

function participantSelectionKeyboard(members, selected, groupId, lang) {
  const buttons = members.map(m => {
    const isSelected = selected.includes(m.id);
    return [{
      text: `${isSelected ? '✅' : '⬜'} ${m.first_name || m.username || 'User'}`,
      callback_data: `participant:toggle:${groupId}:${m.id}`,
    }];
  });

  buttons.push([{
    text: t(lang, 'expense_confirm_participants'),
    callback_data: `participant:confirm:${groupId}`,
  }]);

  return { reply_markup: { inline_keyboard: buttons } };
}

function categoryKeyboard(categories, lang) {
  const buttons = [];
  for (let i = 0; i < categories.length; i += 2) {
    const row = [{ text: `${categories[i].icon} ${lang === 'ru' ? categories[i].name_ru : categories[i].name_en}`, callback_data: `cat:${categories[i].id}` }];
    if (categories[i + 1]) {
      row.push({ text: `${categories[i + 1].icon} ${lang === 'ru' ? categories[i + 1].name_ru : categories[i + 1].name_en}`, callback_data: `cat:${categories[i + 1].id}` });
    }
    buttons.push(row);
  }
  return { reply_markup: { inline_keyboard: buttons } };
}

function recurringKeyboard(lang) {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: t(lang, 'expense_recurring_yes'), callback_data: 'recurring:yes' },
          { text: t(lang, 'expense_recurring_no'), callback_data: 'recurring:no' },
        ],
      ],
    },
  };
}

function frequencyKeyboard(lang) {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: t(lang, 'expense_freq_weekly'), callback_data: 'freq:weekly' }],
        [{ text: t(lang, 'expense_freq_biweekly'), callback_data: 'freq:biweekly' }],
        [{ text: t(lang, 'expense_freq_monthly'), callback_data: 'freq:monthly' }],
        [{ text: t(lang, 'expense_freq_yearly'), callback_data: 'freq:yearly' }],
      ],
    },
  };
}

function settlePersonKeyboard(debts, members, lang) {
  const memberMap = {};
  for (const m of members) memberMap[m.id] = m;

  const buttons = debts.map(d => {
    const person = memberMap[d.to];
    const name = person ? (person.first_name || person.username) : 'Unknown';
    return [{
      text: `${name} — ${d.amount} ${d.currency || ''}`,
      callback_data: `settle:person:${d.to}:${d.amount}`,
    }];
  });

  buttons.push([{ text: t(lang, 'btn_cancel'), callback_data: 'cancel' }]);
  return { reply_markup: { inline_keyboard: buttons } };
}

function settleAmountKeyboard(maxAmount, lang) {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: t(lang, 'settle_full') + ` (${maxAmount})`, callback_data: `settle:amount:${maxAmount}` }],
        [{ text: t(lang, 'settle_partial'), callback_data: 'settle:amount:custom' }],
      ],
    },
  };
}

function settleMethodKeyboard(lang) {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: t(lang, 'settle_method_cash'), callback_data: 'settle:method:cash' }],
        [{ text: t(lang, 'settle_method_transfer'), callback_data: 'settle:method:transfer' }],
        [{ text: t(lang, 'settle_method_other'), callback_data: 'settle:method:other' }],
      ],
    },
  };
}

function currencyKeyboard(currencies, lang) {
  const keys = Object.keys(currencies);
  const buttons = [];
  for (let i = 0; i < keys.length; i += 2) {
    const row = [{ text: currencies[keys[i]], callback_data: `currency:${keys[i]}` }];
    if (keys[i + 1]) {
      row.push({ text: currencies[keys[i + 1]], callback_data: `currency:${keys[i + 1]}` });
    }
    buttons.push(row);
  }
  return { reply_markup: { inline_keyboard: buttons } };
}

function confirmDeleteKeyboard(groupId, lang) {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: t(lang, 'btn_yes'), callback_data: `gsettings:confirmdelete:${groupId}` },
          { text: t(lang, 'btn_no'), callback_data: `group:select:${groupId}` },
        ],
      ],
    },
  };
}

function backButton(lang, callback = 'main') {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: t(lang, 'btn_back'), callback_data: callback }],
      ],
    },
  };
}

function webAppButton(url, lang) {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: t(lang, 'menu_webapp'), web_app: { url } }],
      ],
    },
  };
}

function paginationKeyboard(page, totalPages, prefix, lang) {
  const buttons = [];
  if (page > 0) {
    buttons.push({ text: t(lang, 'history_prev'), callback_data: `${prefix}:${page - 1}` });
  }
  if (page < totalPages - 1) {
    buttons.push({ text: t(lang, 'history_next'), callback_data: `${prefix}:${page + 1}` });
  }
  return buttons.length > 0 ? { reply_markup: { inline_keyboard: [buttons] } } : {};
}

function typeIcon(type) {
  const icons = { home: '🏠', trip: '✈️', couple: '💑', other: '📦' };
  return icons[type] || '📦';
}

module.exports = {
  mainMenu,
  languageKeyboard,
  groupListKeyboard,
  groupTypeKeyboard,
  groupSettingsKeyboard,
  memberListKeyboard,
  splitTypeKeyboard,
  participantSelectionKeyboard,
  categoryKeyboard,
  recurringKeyboard,
  frequencyKeyboard,
  settlePersonKeyboard,
  settleAmountKeyboard,
  settleMethodKeyboard,
  currencyKeyboard,
  confirmDeleteKeyboard,
  backButton,
  webAppButton,
  paginationKeyboard,
  typeIcon,
};
