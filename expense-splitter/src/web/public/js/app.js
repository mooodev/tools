// ===== STATE =====
let state = {
  user: null,
  telegramId: null,
  groups: [],
  currentGroup: null,
  categories: [],
};

const API = '';

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
  // Try to get Telegram WebApp data
  if (window.Telegram && window.Telegram.WebApp) {
    const tg = window.Telegram.WebApp;
    tg.expand();
    tg.ready();

    if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
      state.telegramId = String(tg.initDataUnsafe.user.id);

      // Apply Telegram theme
      if (tg.colorScheme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
      }
    }
  }

  // Fallback: use demo user
  if (!state.telegramId) {
    state.telegramId = 'demo_user';
  }

  // Load user data
  try {
    const res = await fetch(`${API}/api/user/${state.telegramId}`);
    if (res.ok) {
      state.user = await res.json();
      setLang(state.user.language || 'ru');
    }
  } catch {}

  // Load categories
  try {
    const res = await fetch(`${API}/api/categories`);
    if (res.ok) {
      state.categories = await res.json();
    }
  } catch {}

  updateUI();
  navigateTo('groups');
});

// ===== NAVIGATION =====
function navigateTo(page, data) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const pageEl = document.getElementById(`page-${page}`);
  if (pageEl) {
    pageEl.classList.add('active');
  }

  const navEl = document.querySelector(`[data-nav="${page}"]`);
  if (navEl) navEl.classList.add('active');

  switch (page) {
    case 'groups': loadGroups(); break;
    case 'balance': loadBalance(); break;
    case 'history': loadHistory(); break;
    case 'settings': loadSettings(); break;
    case 'add-expense': loadExpenseForm(data); break;
    case 'group-detail': loadGroupDetail(data); break;
    case 'settle': loadSettleForm(data); break;
  }
}

// ===== UPDATE UI LABELS =====
function updateUI() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = _(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = _(el.dataset.i18nPlaceholder);
  });
}

// ===== GROUPS PAGE =====
async function loadGroups() {
  const container = document.getElementById('groups-list');
  container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  try {
    const res = await fetch(`${API}/api/user/${state.telegramId}/groups`);
    state.groups = await res.json();
  } catch {
    state.groups = [];
  }

  if (state.groups.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="emoji">👥</div>
        <p>${_('noGroups')}</p>
        <p style="font-size:14px">${_('noGroupsDesc')}</p>
        <button class="btn btn-primary" onclick="showCreateGroupModal()">${_('createGroup')}</button>
        <br><br>
        <button class="btn btn-outline" onclick="showJoinGroupModal()">${_('joinGroup')}</button>
      </div>
    `;
    return;
  }

  const typeIcons = { home: '🏠', trip: '✈️', couple: '💑', other: '📦' };

  container.innerHTML = state.groups.map(g => `
    <div class="card card-clickable" onclick="navigateTo('group-detail', ${g.id})">
      <div class="group-card">
        <div class="group-icon">${typeIcons[g.type] || '📦'}</div>
        <div class="group-info">
          <div class="group-name">${esc(g.name)}</div>
          <div class="group-meta">💱 ${g.currency}</div>
        </div>
      </div>
    </div>
  `).join('');
}

// ===== CREATE GROUP =====
function showCreateGroupModal() {
  const types = [
    { key: 'home', icon: '🏠' },
    { key: 'trip', icon: '✈️' },
    { key: 'couple', icon: '💑' },
    { key: 'other', icon: '📦' },
  ];

  const currencies = ['RUB', 'USD', 'EUR', 'GBP', 'TRY', 'KZT', 'UAH', 'GEL'];

  document.getElementById('modal-content').innerHTML = `
    <div class="modal-header">
      <div class="modal-title">${_('createGroup')}</div>
      <button class="modal-close" onclick="closeModal()">&times;</button>
    </div>
    <div class="form-group">
      <label class="form-label">${_('groupName')}</label>
      <input type="text" class="form-input" id="new-group-name" placeholder="${_('groupName')}">
    </div>
    <div class="form-group">
      <label class="form-label">${_('groupType')}</label>
      <div class="chip-group" id="group-type-chips">
        ${types.map(t => `
          <div class="chip ${t.key === 'other' ? 'active' : ''}" data-type="${t.key}" onclick="selectGroupType('${t.key}')">
            ${t.icon} ${_(t.key)}
          </div>
        `).join('')}
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">${_('currency')}</label>
      <select class="form-select" id="new-group-currency">
        ${currencies.map(c => `<option value="${c}" ${c === 'RUB' ? 'selected' : ''}>${c}</option>`).join('')}
      </select>
    </div>
    <button class="btn btn-primary btn-full" onclick="createGroup()">${_('create')}</button>
  `;

  openModal();
}

let selectedGroupType = 'other';

function selectGroupType(type) {
  selectedGroupType = type;
  document.querySelectorAll('#group-type-chips .chip').forEach(c => {
    c.classList.toggle('active', c.dataset.type === type);
  });
}

async function createGroup() {
  const name = document.getElementById('new-group-name').value.trim();
  if (!name) return;

  const currency = document.getElementById('new-group-currency').value;

  try {
    const res = await fetch(`${API}/api/groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        telegramId: state.telegramId,
        name,
        type: selectedGroupType,
        currency,
      }),
    });

    if (res.ok) {
      closeModal();
      showToast(`${_('createGroup')}: ${name}`);
      loadGroups();
    }
  } catch {}
}

// ===== JOIN GROUP =====
function showJoinGroupModal() {
  document.getElementById('modal-content').innerHTML = `
    <div class="modal-header">
      <div class="modal-title">${_('joinGroup')}</div>
      <button class="modal-close" onclick="closeModal()">&times;</button>
    </div>
    <div class="form-group">
      <label class="form-label">${_('enterInviteCode')}</label>
      <input type="text" class="form-input" id="join-code" placeholder="ABCD1234" style="text-transform:uppercase; text-align:center; font-size:24px; letter-spacing:3px">
    </div>
    <button class="btn btn-primary btn-full" onclick="joinGroup()">${_('join')}</button>
  `;
  openModal();
}

async function joinGroup() {
  const code = document.getElementById('join-code').value.trim();
  if (!code) return;

  try {
    const res = await fetch(`${API}/api/groups/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telegramId: state.telegramId, inviteCode: code }),
    });

    const data = await res.json();
    if (data.success) {
      closeModal();
      showToast(`✅ ${data.group.name}`);
      loadGroups();
    }
  } catch {}
}

// ===== GROUP DETAIL =====
async function loadGroupDetail(groupId) {
  const page = document.getElementById('page-group-detail');
  page.classList.add('active');
  document.getElementById('page-groups').classList.remove('active');

  const container = document.getElementById('group-detail-content');
  container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  try {
    const res = await fetch(`${API}/api/groups/${groupId}`);
    const group = await res.json();
    state.currentGroup = group;

    const balRes = await fetch(`${API}/api/groups/${groupId}/balance`);
    const balData = await balRes.json();

    const expRes = await fetch(`${API}/api/groups/${groupId}/expenses?limit=5`);
    const expData = await expRes.json();

    const typeIcons = { home: '🏠', trip: '✈️', couple: '💑', other: '📦' };

    container.innerHTML = `
      <div class="group-header">
        <div class="group-header-icon">${typeIcons[group.type] || '📦'}</div>
        <div class="group-header-info">
          <h2>${esc(group.name)}</h2>
          <div class="meta">${group.members.length} ${_('members')} · ${group.currency}</div>
        </div>
      </div>

      <div class="invite-code" onclick="copyInviteCode('${group.invite_code}')" title="Click to copy">
        ${group.invite_code}
      </div>
      <p style="text-align:center; font-size:12px; color:var(--text-secondary); margin: 4px 0 16px;">
        ${_('inviteCode')} — ${_('tapToCopy') || 'tap to copy'}
      </p>

      <div class="action-buttons">
        <button class="btn btn-primary btn-sm" onclick="navigateTo('add-expense', ${groupId})">
          💰 ${_('addExpenseBtn')}
        </button>
        <button class="btn btn-success btn-sm" onclick="navigateTo('settle', ${groupId})">
          💸 ${_('settleUp')}
        </button>
      </div>

      ${renderGroupBalance(balData)}
      ${renderRecentExpenses(expData.expenses, group)}

      <div class="section-title">${_('members')}</div>
      <div class="card">
        ${group.members.map(m => `
          <div class="debt-item">
            <div class="debt-avatar">${(m.first_name || 'U')[0]}</div>
            <div class="debt-info">
              <div class="debt-name">${esc(m.first_name || m.username || 'User')}</div>
              <div class="debt-detail">${m.role === 'admin' ? '👑 Admin' : ''}</div>
            </div>
          </div>
        `).join('')}
      </div>

      <div style="margin-top:16px">
        <button class="btn btn-outline btn-full btn-sm" onclick="showGroupSettingsModal(${groupId})">
          ⚙️ ${_('groupSettings')}
        </button>
      </div>
    `;
  } catch {
    container.innerHTML = '<div class="empty-state"><p>Error loading group</p></div>';
  }
}

function renderGroupBalance(balData) {
  if (!balData.debts || balData.debts.length === 0) {
    return `<div class="card" style="text-align:center; padding:24px;">
      <div style="font-size:32px">✅</div>
      <p style="font-weight:600; margin-top:8px">${_('allSettled')}</p>
    </div>`;
  }

  return `
    <div class="section-title">${_('simplifiedDebts')}</div>
    <div class="card">
      ${balData.debts.map(d => `
        <div class="simplify-arrow">
          <span class="simplify-from">${esc(d.fromName)}</span>
          <span class="simplify-arrow-icon">→</span>
          <span class="simplify-to">${esc(d.toName)}</span>
          <span class="simplify-amount">${d.amount.toFixed(2)}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function renderRecentExpenses(expenses, group) {
  if (!expenses || expenses.length === 0) return '';

  return `
    <div class="section-title">${_('expenseHistory')}</div>
    <div class="card">
      ${expenses.map(e => `
        <div class="expense-item">
          <div class="expense-icon">${e.category_icon || '📦'}</div>
          <div class="expense-info">
            <div class="expense-desc">${esc(e.description)}</div>
            <div class="expense-meta">${e.date}</div>
          </div>
          <div class="expense-amount-col">
            <div class="expense-total">${e.total_amount.toFixed(2)}</div>
            <div class="expense-your-share">${group.currency}</div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function copyInviteCode(code) {
  navigator.clipboard.writeText(code).then(() => {
    showToast(_('inviteCodeCopied'));
  }).catch(() => {});
}

// ===== ADD EXPENSE =====
async function loadExpenseForm(groupId) {
  const page = document.getElementById('page-add-expense');
  page.classList.add('active');

  // Hide other pages
  document.querySelectorAll('.page').forEach(p => {
    if (p.id !== 'page-add-expense') p.classList.remove('active');
  });

  if (!groupId && state.groups.length > 0) {
    groupId = state.groups[0].id;
  }

  let members = [];
  let group = null;
  try {
    const gRes = await fetch(`${API}/api/groups/${groupId}`);
    group = await gRes.json();
    members = group.members || [];
    state.currentGroup = group;
  } catch {}

  const container = document.getElementById('expense-form-content');

  container.innerHTML = `
    <h2 style="margin-bottom: 16px">💰 ${_('addExpenseBtn')}</h2>

    ${state.groups.length > 1 ? `
      <div class="form-group">
        <label class="form-label">${_('groups')}</label>
        <select class="form-select" id="exp-group" onchange="loadExpenseForm(parseInt(this.value))">
          ${state.groups.map(g => `
            <option value="${g.id}" ${g.id === groupId ? 'selected' : ''}>${g.name}</option>
          `).join('')}
        </select>
      </div>
    ` : ''}

    <div class="form-group">
      <label class="form-label">${_('description')}</label>
      <input type="text" class="form-input" id="exp-desc" placeholder="${_('description')}">
    </div>

    <div class="form-group">
      <label class="form-label">${_('amount')} (${group ? group.currency : 'RUB'})</label>
      <input type="number" class="form-input" id="exp-amount" placeholder="0.00" step="0.01" min="0" inputmode="decimal">
    </div>

    <div class="form-group">
      <label class="form-label">${_('paidBy')}</label>
      <select class="form-select" id="exp-payer">
        ${members.map(m => `
          <option value="${m.id}" ${state.user && m.telegram_id === state.telegramId ? 'selected' : ''}>
            ${esc(m.first_name || m.username || 'User')}
          </option>
        `).join('')}
      </select>
    </div>

    <div class="form-group">
      <label class="form-label">${_('splitMethod')}</label>
      <div id="split-options">
        <div class="split-option active" data-split="equal" onclick="selectSplit('equal')">
          <span class="icon">➗</span>
          <div><div class="label">${_('equal')}</div><div class="desc">${_('equalDesc')}</div></div>
        </div>
        <div class="split-option" data-split="exact" onclick="selectSplit('exact')">
          <span class="icon">🔢</span>
          <div><div class="label">${_('exact')}</div><div class="desc">${_('exactDesc')}</div></div>
        </div>
        <div class="split-option" data-split="percent" onclick="selectSplit('percent')">
          <span class="icon">📊</span>
          <div><div class="label">${_('percent')}</div><div class="desc">${_('percentDesc')}</div></div>
        </div>
        <div class="split-option" data-split="shares" onclick="selectSplit('shares')">
          <span class="icon">📏</span>
          <div><div class="label">${_('shares')}</div><div class="desc">${_('sharesDesc')}</div></div>
        </div>
        <div class="split-option" data-split="adjustment" onclick="selectSplit('adjustment')">
          <span class="icon">±</span>
          <div><div class="label">${_('adjustment')}</div><div class="desc">${_('adjustmentDesc')}</div></div>
        </div>
      </div>
    </div>

    <div class="form-group" id="split-details" style="display:none">
      <label class="form-label">${_('participants')}</label>
      <div id="split-inputs"></div>
      <div style="display:flex; justify-content:space-between; margin-top:8px; font-size:14px; font-weight:600">
        <span>${_('total')}: <span id="split-total">0</span></span>
        <span>${_('remaining')}: <span id="split-remaining">0</span></span>
      </div>
    </div>

    <div class="form-group">
      <label class="form-label">${_('category')}</label>
      <div class="category-grid" id="category-grid">
        ${state.categories.map(c => `
          <div class="category-item" data-cat="${c.id}" onclick="selectCategory(${c.id})">
            <span class="cat-icon">${c.icon}</span>
            <span>${getLang() === 'ru' ? c.name_ru : c.name_en}</span>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="form-group">
      <label class="form-label">${_('note')} (${_('optional')})</label>
      <textarea class="form-textarea" id="exp-note" rows="2"></textarea>
    </div>

    <button class="btn btn-primary btn-full" onclick="submitExpense(${groupId})">
      ✅ ${_('submit')}
    </button>
    <button class="btn btn-outline btn-full" style="margin-top:8px" onclick="navigateTo('groups')">
      ${_('cancel')}
    </button>
  `;

  window._expMembers = members;
  window._selectedSplit = 'equal';
  window._selectedCategory = null;
}

function selectSplit(type) {
  window._selectedSplit = type;
  document.querySelectorAll('.split-option').forEach(el => {
    el.classList.toggle('active', el.dataset.split === type);
  });

  const details = document.getElementById('split-details');
  const inputs = document.getElementById('split-inputs');

  if (type === 'equal') {
    details.style.display = 'none';
    return;
  }

  details.style.display = 'block';
  const members = window._expMembers || [];

  let placeholder = '';
  if (type === 'exact') placeholder = '0.00';
  else if (type === 'percent') placeholder = '0%';
  else if (type === 'shares') placeholder = '1';
  else if (type === 'adjustment') placeholder = '±0';

  inputs.innerHTML = members.map(m => `
    <div class="participant-split-row">
      <input type="checkbox" checked data-uid="${m.id}" onchange="updateSplitTotals()">
      <span class="name">${esc(m.first_name || m.username || 'User')}</span>
      <input type="number" step="0.01" placeholder="${placeholder}" data-uid-val="${m.id}" oninput="updateSplitTotals()">
    </div>
  `).join('');
}

function updateSplitTotals() {
  const amount = parseFloat(document.getElementById('exp-amount').value) || 0;
  const inputs = document.querySelectorAll('[data-uid-val]');
  let total = 0;

  inputs.forEach(inp => {
    const val = parseFloat(inp.value) || 0;
    if (window._selectedSplit === 'percent') {
      total += (amount * val / 100);
    } else if (window._selectedSplit === 'shares') {
      // Will calculate later
      total += val;
    } else {
      total += val;
    }
  });

  document.getElementById('split-total').textContent = total.toFixed(2);
  document.getElementById('split-remaining').textContent = (amount - total).toFixed(2);
}

function selectCategory(id) {
  window._selectedCategory = id;
  document.querySelectorAll('.category-item').forEach(el => {
    el.classList.toggle('active', parseInt(el.dataset.cat) === id);
  });
}

async function submitExpense(groupId) {
  const description = document.getElementById('exp-desc').value.trim();
  const amount = parseFloat(document.getElementById('exp-amount').value);
  const payerId = parseInt(document.getElementById('exp-payer').value);
  const note = document.getElementById('exp-note').value.trim();

  if (!description || !amount || amount <= 0) return;

  const splitType = window._selectedSplit;
  let splitData = {};

  if (splitType !== 'equal') {
    const inputs = document.querySelectorAll('[data-uid-val]');
    const checkboxes = document.querySelectorAll('[data-uid]');

    if (splitType === 'exact') {
      splitData.amounts = {};
      inputs.forEach(inp => {
        const uid = inp.dataset.uidVal;
        splitData.amounts[uid] = parseFloat(inp.value) || 0;
      });
    } else if (splitType === 'percent') {
      splitData.percentages = {};
      inputs.forEach(inp => {
        const uid = inp.dataset.uidVal;
        splitData.percentages[uid] = parseFloat(inp.value) || 0;
      });
    } else if (splitType === 'shares') {
      splitData.shares = {};
      inputs.forEach(inp => {
        const uid = inp.dataset.uidVal;
        splitData.shares[uid] = parseFloat(inp.value) || 1;
      });
    } else if (splitType === 'adjustment') {
      splitData.adjustments = {};
      inputs.forEach(inp => {
        const uid = inp.dataset.uidVal;
        const val = parseFloat(inp.value);
        if (val) splitData.adjustments[uid] = val;
      });
    }
  }

  try {
    const res = await fetch(`${API}/api/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        telegramId: state.telegramId,
        groupId,
        description,
        amount,
        splitType,
        splitData,
        payerIds: [payerId],
        categoryId: window._selectedCategory,
        note: note || undefined,
      }),
    });

    if (res.ok) {
      showToast('✅ ' + _('addExpenseBtn'));
      navigateTo('group-detail', groupId);
    }
  } catch {}
}

// ===== BALANCE PAGE =====
async function loadBalance() {
  const container = document.getElementById('balance-content');
  container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  try {
    const res = await fetch(`${API}/api/user/${state.telegramId}/balance`);
    const data = await res.json();

    const totalOwed = data.owed.reduce((s, d) => s + d.amount, 0);
    const totalOwe = data.owes.reduce((s, d) => s + d.amount, 0);
    const net = totalOwed - totalOwe;

    container.innerHTML = `
      <div class="balance-overview">
        <div class="balance-label">${_('totalBalance')}</div>
        <div class="balance-amount">${net >= 0 ? '+' : ''}${net.toFixed(2)}</div>
        <div class="balance-row">
          <div class="balance-col">
            <div class="label">${_('owedToYou')}</div>
            <div class="value green">+${totalOwed.toFixed(2)}</div>
          </div>
          <div class="balance-col">
            <div class="label">${_('youOwe')}</div>
            <div class="value red">-${totalOwe.toFixed(2)}</div>
          </div>
        </div>
      </div>

      ${data.owes.length === 0 && data.owed.length === 0 ? `
        <div class="empty-state">
          <div class="emoji">✅</div>
          <p>${_('allSettled')}</p>
          <p style="font-size:14px">${_('allSettledDesc')}</p>
        </div>
      ` : `
        ${data.owed.length > 0 ? `
          <div class="section-title">${_('owedToYou')}</div>
          <div class="card">
            ${data.owed.map(d => `
              <div class="debt-item">
                <div class="debt-avatar">${(d.name || 'U')[0]}</div>
                <div class="debt-info">
                  <div class="debt-name">${esc(d.name)}</div>
                </div>
                <div class="debt-amount positive">+${d.amount.toFixed(2)}</div>
              </div>
            `).join('')}
          </div>
        ` : ''}

        ${data.owes.length > 0 ? `
          <div class="section-title">${_('youOwe')}</div>
          <div class="card">
            ${data.owes.map(d => `
              <div class="debt-item">
                <div class="debt-avatar">${(d.name || 'U')[0]}</div>
                <div class="debt-info">
                  <div class="debt-name">${esc(d.name)}</div>
                </div>
                <div class="debt-amount negative">-${d.amount.toFixed(2)}</div>
              </div>
            `).join('')}
          </div>
        ` : ''}
      `}
    `;
  } catch {
    container.innerHTML = '<div class="empty-state"><p>Error loading balance</p></div>';
  }
}

// ===== HISTORY PAGE =====
async function loadHistory() {
  const container = document.getElementById('history-content');
  container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  let allExpenses = [];

  try {
    for (const g of state.groups) {
      const res = await fetch(`${API}/api/groups/${g.id}/expenses?limit=20`);
      const data = await res.json();
      allExpenses = allExpenses.concat(data.expenses.map(e => ({ ...e, groupName: g.name, groupCurrency: g.currency })));
    }

    allExpenses.sort((a, b) => new Date(b.date) - new Date(a.date));
  } catch {}

  if (allExpenses.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="emoji">📋</div>
        <p>${_('noExpenses')}</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <h2 style="margin-bottom:16px">${_('expenseHistory')}</h2>
    <div class="card">
      ${allExpenses.map(e => `
        <div class="expense-item">
          <div class="expense-icon">${e.is_settlement ? '💸' : (e.category_icon || '📦')}</div>
          <div class="expense-info">
            <div class="expense-desc">${e.is_settlement ? _('settlement') : esc(e.description)}</div>
            <div class="expense-meta">${esc(e.groupName)} · ${e.date}</div>
          </div>
          <div class="expense-amount-col">
            <div class="expense-total">${e.total_amount.toFixed(2)}</div>
            <div class="expense-your-share">${e.groupCurrency || e.currency}</div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// ===== SETTLE PAGE =====
async function loadSettleForm(groupId) {
  const page = document.getElementById('page-settle');
  page.classList.add('active');
  document.querySelectorAll('.page').forEach(p => {
    if (p.id !== 'page-settle') p.classList.remove('active');
  });

  const container = document.getElementById('settle-content');

  if (!groupId) {
    // Show group selector
    container.innerHTML = `
      <h2 style="margin-bottom:16px">💸 ${_('settleUp')}</h2>
      ${state.groups.map(g => `
        <div class="card card-clickable" onclick="navigateTo('settle', ${g.id})">
          <div class="group-card">
            <div class="group-icon">${{home:'🏠',trip:'✈️',couple:'💑',other:'📦'}[g.type] || '📦'}</div>
            <div class="group-info">
              <div class="group-name">${esc(g.name)}</div>
            </div>
          </div>
        </div>
      `).join('')}
    `;
    return;
  }

  container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  try {
    const balRes = await fetch(`${API}/api/groups/${groupId}/balance`);
    const balData = await balRes.json();
    const gRes = await fetch(`${API}/api/groups/${groupId}`);
    const group = await gRes.json();

    // Find debts where current user owes
    const myDebts = balData.debts.filter(d => {
      const fromMember = group.members.find(m => m.id === d.from);
      return fromMember && fromMember.telegram_id === state.telegramId;
    });

    if (myDebts.length === 0) {
      container.innerHTML = `
        <h2 style="margin-bottom:16px">💸 ${_('settleUp')}</h2>
        <div class="empty-state">
          <div class="emoji">✅</div>
          <p>${_('allSettled')}</p>
        </div>
        <button class="btn btn-outline btn-full" onclick="navigateTo('groups')">${_('back')}</button>
      `;
      return;
    }

    container.innerHTML = `
      <h2 style="margin-bottom:16px">💸 ${_('settleUp')} — ${esc(group.name)}</h2>

      ${myDebts.map(d => `
        <div class="card">
          <div class="debt-item" style="border:none">
            <div class="debt-avatar">${(d.toName || 'U')[0]}</div>
            <div class="debt-info">
              <div class="debt-name">${esc(d.toName)}</div>
              <div class="debt-detail">${d.amount.toFixed(2)} ${group.currency}</div>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">${_('payAmount')}</label>
            <input type="number" class="form-input" id="settle-amount-${d.to}" value="${d.amount.toFixed(2)}" step="0.01" min="0">
          </div>

          <div class="form-group">
            <label class="form-label">${_('payMethod')}</label>
            <div class="chip-group">
              <div class="chip active" data-method="cash" onclick="selectSettleMethod(this, ${d.to})">${_('cash')}</div>
              <div class="chip" data-method="transfer" onclick="selectSettleMethod(this, ${d.to})">${_('bankTransfer')}</div>
              <div class="chip" data-method="other" onclick="selectSettleMethod(this, ${d.to})">${_('otherMethod')}</div>
            </div>
          </div>

          <button class="btn btn-success btn-full" onclick="submitSettle(${groupId}, ${d.to})">
            💸 ${_('settleUp')}
          </button>
        </div>
      `).join('')}

      <button class="btn btn-outline btn-full" style="margin-top:8px" onclick="navigateTo('groups')">
        ${_('back')}
      </button>
    `;

    window._settleMethods = {};
  } catch {
    container.innerHTML = '<div class="empty-state"><p>Error</p></div>';
  }
}

function selectSettleMethod(el, toUserId) {
  el.parentElement.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  if (!window._settleMethods) window._settleMethods = {};
  window._settleMethods[toUserId] = el.dataset.method;
}

async function submitSettle(groupId, toUserId) {
  const amount = parseFloat(document.getElementById(`settle-amount-${toUserId}`).value);
  if (!amount || amount <= 0) return;

  const method = (window._settleMethods && window._settleMethods[toUserId]) || 'cash';

  try {
    const res = await fetch(`${API}/api/settlements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        telegramId: state.telegramId,
        groupId,
        toUserId,
        amount,
        method,
      }),
    });

    if (res.ok) {
      showToast('✅ ' + _('settleConfirm'));
      navigateTo('group-detail', groupId);
    }
  } catch {}
}

// ===== SETTINGS =====
function loadSettings() {
  const container = document.getElementById('settings-content');

  const currencies = ['RUB', 'USD', 'EUR', 'GBP', 'TRY', 'KZT', 'UAH', 'GEL', 'THB', 'CNY'];

  container.innerHTML = `
    <h2 style="margin-bottom:16px">⚙️ ${_('settings')}</h2>

    <div class="card">
      <div class="settings-item" onclick="toggleLanguage()">
        <div class="settings-left">
          <span class="settings-icon">🌐</span>
          <span class="settings-label">${_('language')}</span>
        </div>
        <div class="lang-switch">
          <button class="lang-btn ${getLang() === 'ru' ? 'active' : ''}" onclick="event.stopPropagation(); setAppLang('ru')">RU</button>
          <button class="lang-btn ${getLang() === 'en' ? 'active' : ''}" onclick="event.stopPropagation(); setAppLang('en')">EN</button>
        </div>
      </div>

      <div class="settings-item">
        <div class="settings-left">
          <span class="settings-icon">💱</span>
          <span class="settings-label">${_('defaultCurrency')}</span>
        </div>
        <select class="form-select" style="width:auto" onchange="setCurrency(this.value)">
          ${currencies.map(c => `
            <option value="${c}" ${state.user && state.user.currency === c ? 'selected' : ''}>${c}</option>
          `).join('')}
        </select>
      </div>

      <div class="settings-item" onclick="exportData()">
        <div class="settings-left">
          <span class="settings-icon">📤</span>
          <span class="settings-label">${_('exportData')}</span>
        </div>
        <span style="color:var(--text-secondary)">CSV</span>
      </div>
    </div>
  `;
}

async function setAppLang(lang) {
  setLang(lang);
  updateUI();

  try {
    await fetch(`${API}/api/user/${state.telegramId}/language`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: lang }),
    });
  } catch {}

  loadSettings();
}

async function setCurrency(currency) {
  try {
    // Update via user endpoint would go here
    if (state.user) state.user.currency = currency;
  } catch {}
}

function exportData() {
  window.open(`${API}/api/export/${state.telegramId}`, '_blank');
}

// ===== GROUP SETTINGS MODAL =====
function showGroupSettingsModal(groupId) {
  const group = state.currentGroup;
  if (!group) return;

  document.getElementById('modal-content').innerHTML = `
    <div class="modal-header">
      <div class="modal-title">${_('groupSettings')}</div>
      <button class="modal-close" onclick="closeModal()">&times;</button>
    </div>

    <div class="card">
      <div class="settings-item" onclick="toggleSimplify(${groupId})">
        <div class="settings-left">
          <span class="settings-icon">🔄</span>
          <span class="settings-label">${_('simplifyDebts')}</span>
        </div>
        <span id="simplify-status">${group.simplify_debts ? _('enabled') : _('disabled')}</span>
      </div>
    </div>

    <button class="btn btn-danger btn-full" style="margin-top:16px" onclick="confirmDeleteGroup(${groupId})">
      🗑 ${_('deleteGroup')}
    </button>
  `;

  openModal();
}

async function toggleSimplify(groupId) {
  const current = state.currentGroup.simplify_debts;
  try {
    await fetch(`${API}/api/groups/${groupId}/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ simplify_debts: !current }),
    });
    state.currentGroup.simplify_debts = !current;
    document.getElementById('simplify-status').textContent = !current ? _('enabled') : _('disabled');
  } catch {}
}

function confirmDeleteGroup(groupId) {
  if (confirm(_('confirmDelete'))) {
    deleteGroupAction(groupId);
  }
}

async function deleteGroupAction(groupId) {
  try {
    await fetch(`${API}/api/groups/${groupId}`, { method: 'DELETE' });
    closeModal();
    navigateTo('groups');
    showToast('✅');
  } catch {}
}

// ===== MODAL =====
function openModal() {
  document.getElementById('modal-overlay').classList.add('active');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('active');
}

// ===== TOAST =====
function showToast(text) {
  const toast = document.getElementById('toast');
  toast.textContent = text;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

// ===== HELPERS =====
function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
