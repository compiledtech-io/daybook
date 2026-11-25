'use strict';

let activeView = 'transactions';
let reportMonth = '';
let budgetMonth = '';
let submitFeature;

const features = {
  reports: ['Reports', 'Compare income and expenses across months and see where spending went.'],
  budgets: ['Budgets', 'Set a monthly limit for each spending category.'],
  accounts: ['Accounts', 'Track the balance of each cash, bank, or wallet account.'],
  recurring: ['Recurring', 'Review scheduled transactions and post each occurrence when it is due.'],
  debts: ['Money owed', 'Track money you lent or borrowed and record partial repayments.'],
  backups: ['Backups', 'Save a dated copy or reopen a backup as a separate ledger.']
};

function resetFeatureState() {
  reportMonth = '';
  budgetMonth = '';
}

function initFeatures() {
  for (const tab of document.querySelectorAll('[data-view]')) {
    tab.addEventListener('click', () => {
      activeView = tab.dataset.view;
      renderFeatureView();
    });
  }
  for (const id of ['feature-cancel', 'feature-close']) {
    byId(id).addEventListener('click', () => byId('feature-editor').close());
  }
  byId('feature-form').addEventListener('submit', event => {
    event.preventDefault();
    if (busy || !ledger) return;
    try {
      submitFeature(new FormData(event.currentTarget));
      byId('feature-editor').close();
      featureChanged();
    } catch (error) {
      byId('feature-error').textContent = error.message;
    }
  });
  byId('restore-upload').addEventListener('change', event => {
    const input = event.currentTarget;
    const file = input.files[0];
    input.value = '';
    if (file && allowSwitch()) perform(() => openFile(file, null, true));
  });
}

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function featureButton(label, action, primary = false, blocked = false) {
  const button = element('button', label, primary ? 'primary' : '');
  button.type = 'button';
  button.disabled = busy || blocked;
  button.addEventListener('click', action);
  return button;
}

function featureChanged() {
  setDirty(true);
  render();
  notify('Ledger updated. Save the CSV to keep this change.');
}

function openFeatureForm(title, fields, submit, submitLabel = 'Save') {
  const dialog = byId('feature-editor');
  byId('feature-editor-title').textContent = title;
  byId('feature-submit').textContent = submitLabel;
  byId('feature-error').textContent = '';
  submitFeature = submit;

  const inputs = fields.map(([label, name, value, kind = 'text', options]) => {
    const wrapper = element('label', label);
    const control = element(kind === 'select' ? 'select' : 'input');
    if (kind === 'select') replaceOptions(control, options, value);
    else {
      control.type = kind === 'money' ? 'text' : kind;
      if (kind === 'money') control.inputMode = 'decimal';
      control.value = value;
    }
    control.name = name;
    control.required = name !== 'category' && name !== 'time';
    if (kind === 'time') control.step = '1';
    wrapper.append(control);
    return wrapper;
  });
  byId('feature-fields').replaceChildren(...inputs);
  dialog.showModal();
}

function renderFeatureView() {
  const isTransactions = activeView === 'transactions';
  byId('transactions-view').hidden = !isTransactions;
  byId('feature-view').hidden = isTransactions;
  for (const tab of document.querySelectorAll('[data-view]')) {
    if (tab.dataset.view === activeView) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
  if (isTransactions) return;
  const [heading, description] = features[activeView];
  byId('feature-heading').textContent = heading;
  byId('feature-description').textContent = description;
  const actions = byId('feature-actions');
  const content = byId('feature-content');
  actions.replaceChildren();
  content.replaceChildren();
  if (!ledger && activeView !== 'backups') {
    content.append(element('p', 'Open or create a CSV to use this view.', 'muted'));
    return;
  }
  const renderers = {
    reports: renderReports, budgets: renderBudgets, accounts: renderAccounts,
    recurring: renderRecurring, debts: renderDebts, backups: renderBackups
  };
  renderers[activeView](content, actions);
}

function featureTable(headers, rows, empty) {
  if (!rows.length) return element('p', empty, 'muted');
  const wrapper = element('div', undefined, 'table-wrap feature-table');
  const table = wrapper.appendChild(element('table'));
  const header = table.createTHead().insertRow();
  for (const name of headers) {
    const cell = element('th', name);
    cell.scope = 'col';
    header.append(cell);
  }
  const body = table.createTBody();
  for (const row of rows) {
    const tr = body.insertRow();
    row.forEach((value, index) => {
      const cell = index === 0 ? element('th') : element('td');
      if (index === 0) cell.scope = 'row';
      if (typeof value === 'string') cell.textContent = value;
      else cell.append(value);
      tr.append(cell);
    });
  }
  return wrapper;
}

function rowButtons(...buttons) {
  const wrapper = element('div', undefined, 'filters');
  wrapper.append(...buttons);
  return wrapper;
}

function monthPicker(selected, change) {
  const current = localClock().date.slice(0, 7);
  const months = [...new Set([current, selected, ...ledger.entries.map(entry => entry.date.slice(0, 7))])]
    .filter(Boolean).sort().reverse();
  const label = element('label', 'Month', 'month-picker');
  const select = element('select');
  replaceOptions(select, months.map(month => [month, month]), selected || current);
  select.disabled = busy;
  select.addEventListener('change', () => {
    change(select.value);
    renderFeatureView();
    byId('feature-actions').querySelector('select')?.focus();
  });
  label.append(select);
  return label;
}

const selectedMonth = month => month || localClock().date.slice(0, 7);
const inMonth = (entry, month) => entry.date.startsWith(month + '-');
const amountText = cents => (cents / 100).toFixed(2);
const moneyText = cents => formatTotal(BigInt(cents));
const FREQUENCIES = [['monthly', 'Monthly'], ['weekly', 'Weekly']];
const DIRECTIONS = [['debit', 'Expense'], ['credit', 'Income']];
const DEBT_DIRECTIONS = [['lend', 'I lent money'], ['borrow', 'I borrowed money']];

function renderReports(content, actions) {
  actions.append(monthPicker(reportMonth, value => { reportMonth = value; }));
  const month = selectedMonth(reportMonth);
  const records = ledger.entries.filter(entry => entry.type === 'credit' || entry.type === 'debit');
  const grouped = new Map();
  for (const entry of records) {
    const key = entry.date.slice(0, 7);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(entry);
  }
  const categoryTotals = new Map();
  for (const entry of grouped.get(month) || []) {
    if (entry.type !== 'debit') continue;
    const label = entry.category.trim() || 'Uncategorized';
    const key = Ledger.categoryKey(label);
    const group = categoryTotals.get(key) || { label, cents: 0n };
    group.cents += BigInt(entry.cents);
    categoryTotals.set(key, group);
  }
  const months = [...new Set([month, ...grouped.keys()])].sort().reverse();
  const monthRows = months.map(key => {
    const { income, expense, net } = totals(grouped.get(key) || []);
    return [key, moneyText(income), moneyText(expense), moneyText(net)];
  });
  const categories = [...categoryTotals.values()].sort((a, b) => a.cents < b.cents ? 1 : a.cents > b.cents ? -1 : 0);
  content.append(
    element('h3', 'Spending by category · ' + month),
    featureTable(['Category', 'Spent'], categories.map(item => [item.label, moneyText(item.cents)]), 'No expenses in this month.'),
    element('h3', 'Monthly comparison'),
    featureTable(['Month', 'Income', 'Expenses', 'Net'], monthRows, '')
  );
}

function renderBudgets(content, actions) {
  actions.append(monthPicker(budgetMonth, value => { budgetMonth = value; }),
    featureButton('Add budget', () => editBudget(), true));
  const month = selectedMonth(budgetMonth);
  const spending = new Map();
  for (const entry of ledger.entries) {
    if (entry.type !== 'debit' || !inMonth(entry, month)) continue;
    const key = Ledger.categoryKey(entry.category);
    spending.set(key, (spending.get(key) || 0n) + BigInt(entry.cents));
  }
  const rows = ledger.settings.budgets.map(budget => {
    const spent = spending.get(Ledger.categoryKey(budget.category)) || 0n;
    const left = BigInt(budget.cents) - spent;
    const status = left < 0n ? moneyText(-left) + ' over' : moneyText(left) + ' left';
    const buttons = rowButtons(
      featureButton('Edit', () => editBudget(budget)),
      featureButton('Remove', () => removeSetting('budgets', budget, 'Remove this category budget?'))
    );
    return [budget.category, moneyText(budget.cents), moneyText(spent), status, buttons];
  });
  content.append(featureTable(['Category', 'Monthly limit', 'Spent', 'Remaining', 'Actions'], rows, 'No budgets yet.'));
}

function editBudget(budget) {
  openFeatureForm(budget ? 'Edit budget' : 'Add budget', [
    ['Category', 'budget-category', budget?.category ?? ''],
    ['Monthly limit', 'amount', budget ? amountText(budget.cents) : '', 'money']
  ], fields => {
    const category = requiredText(fields.get('budget-category'));
    const duplicate = ledger.settings.budgets.some(item => item !== budget &&
      Ledger.categoryKey(item.category) === Ledger.categoryKey(category));
    if (duplicate) throw new Error('A budget already exists for this category.');
    saveSetting('budgets', budget, { category, cents: Ledger.amount(fields.get('amount')) });
  });
}

function accountBalances(settings, entries) {
  const balances = new Map(settings.accounts.map(account => [account.id, BigInt(account.opening)]));
  for (const entry of entries) {
    const id = entry.account || 'default';
    const value = BigInt(entry.cents);
    const outgoing = ['debit', 'transfer', 'lend', 'repay'].includes(entry.type);
    balances.set(id, balances.get(id) + (outgoing ? -value : value));
    if (entry.type === 'transfer') balances.set(entry.to, balances.get(entry.to) + value);
  }
  return balances;
}

function renderAccounts(content, actions) {
  actions.append(featureButton('Add account', () => editAccount(), true));
  const balances = accountBalances(ledger.settings, ledger.entries);
  const total = [...balances.values()].reduce((sum, value) => sum + value, 0n);
  content.append(element('h3', 'Total account balance · ' + moneyText(total)));
  const rows = ledger.settings.accounts.map(account => {
    const buttons = [featureButton('Edit', () => editAccount(account))];
    if (account.id !== 'default') buttons.push(featureButton('Remove', () => removeAccount(account)));
    return [account.name, moneyText(account.opening), moneyText(balances.get(account.id)), rowButtons(...buttons)];
  });
  content.append(featureTable(['Account', 'Opening balance', 'Recorded balance', 'Actions'], rows, ''));
}

function editAccount(account) {
  openFeatureForm(account ? 'Edit account' : 'Add account', [
    ['Account name', 'name', account?.name ?? ''],
    ['Opening balance', 'opening', account ? amountText(account.opening) : '0.00', 'money']
  ], fields => {
    const name = requiredText(fields.get('name'));
    if (ledger.settings.accounts.some(item => item !== account && Ledger.categoryKey(item.name) === Ledger.categoryKey(name))) {
      throw new Error('An account already uses this name.');
    }
    saveSetting('accounts', account, { name, opening: Ledger.amount(fields.get('opening'), true) });
  });
}

function removeAccount(account) {
  const used = ledger.entries.some(entry => entry.account === account.id || entry.to === account.id) ||
    ledger.settings.recurring.some(item => item.account === account.id);
  if (used) {
    notify('This account is used by a transaction or schedule and cannot be removed.');
    return;
  }
  removeSetting('accounts', account, 'Remove this account?');
}

function advanceDue(date, frequency, anchorDay) {
  const [year, month, day] = date.split('-').map(Number);
  const utc = new Date('2000-01-01T00:00:00Z');
  if (frequency === 'weekly') utc.setUTCFullYear(year, month - 1, day + 7);
  else {
    utc.setUTCFullYear(year, month + 1, 0);
    const daysInNextMonth = utc.getUTCDate();
    utc.setUTCDate(Math.min(daysInNextMonth, anchorDay));
  }
  const next = utc.toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(next)) throw new Error('The next date is outside the supported calendar.');
  return next;
}

function renderRecurring(content, actions) {
  actions.append(featureButton('Add schedule', () => editRecurring(), true));
  const today = localClock().date;
  const rows = [...ledger.settings.recurring].sort((a, b) => a.next.localeCompare(b.next)).map(item => {
    const due = item.next <= today;
    return [
      item.counterparty, typeLabels[item.type], moneyText(item.cents), accountName(item.account),
      item.frequency === 'weekly' ? 'Weekly' : 'Monthly', item.next, due ? 'Due' : 'Upcoming',
      rowButtons(featureButton('Post', () => postRecurring(item), false, !due),
        featureButton('Edit', () => editRecurring(item)),
        featureButton('Remove', () => removeSetting('recurring', item, 'Remove this recurring schedule?')))
    ];
  });
  content.append(featureTable(['Description', 'Type', 'Amount', 'Account', 'Frequency', 'Next due', 'Status', 'Actions'], rows,
    'No recurring transactions scheduled.'));
}

function editRecurring(item) {
  openFeatureForm(item ? 'Edit schedule' : 'Add schedule', [
    ['Payee or income source', 'counterparty', item?.counterparty ?? ''],
    ['Type', 'type', item?.type ?? 'debit', 'select', DIRECTIONS],
    ['Amount', 'amount', item ? amountText(item.cents) : '', 'money'],
    ['Account', 'account', item?.account ?? 'default', 'select', accountOptions()],
    ['Category (optional)', 'category', item?.category ?? ''],
    ['Frequency', 'frequency', item?.frequency ?? 'monthly', 'select', FREQUENCIES],
    ['Next due date', 'next', item?.next ?? localClock().date, 'date']
  ], fields => {
    const next = fields.get('next');
    const frequency = fields.get('frequency');
    const day = next === item?.next && frequency === item?.frequency ? item.day : Number(next.slice(-2));
    saveSetting('recurring', item, {
      next, day, frequency, counterparty: requiredText(fields.get('counterparty')),
      type: fields.get('type'), account: fields.get('account'), category: fields.get('category').trim(),
      cents: Ledger.amount(fields.get('amount'))
    });
  });
}

function postRecurring(item) {
  if (busy || !ledger.settings.recurring.includes(item) || item.next > localClock().date) return;
  if (!window.confirm('Post the scheduled transaction dated ' + item.next + '?')) return;
  try {
    const next = advanceDue(item.next, item.frequency, item.day);
    const { counterparty, account, category, cents, type } = item;
    appendEntry({ date: item.next, counterparty, account, category, cents, type });
    item.next = next;
    featureChanged();
  } catch (error) {
    notify(error.message);
  }
}

function debtPositions(entries) {
  const positions = new Map();
  for (const entry of entries) {
    if (!entry.debt) continue;
    const position = positions.get(entry.debt) || { principal: null, paid: 0n };
    if (entry.type === 'lend' || entry.type === 'borrow') position.principal = entry;
    else position.paid += BigInt(entry.cents);
    positions.set(entry.debt, position);
  }
  return positions;
}

function renderDebts(content, actions) {
  actions.append(featureButton('Add money owed', () => addDebt(), true));
  const positions = debtPositions(ledger.entries);
  let receivable = 0n;
  let payable = 0n;
  const rows = ledger.settings.debts.map(debt => {
    const { principal, paid } = positions.get(debt.id);
    const outstanding = BigInt(principal.cents) - paid;
    if (debt.type === 'lend') receivable += outstanding;
    else payable += outstanding;
    return [
      debt.party, debt.type === 'lend' ? 'Owed to me' : 'I owe',
      principal.date, moneyText(principal.cents), moneyText(paid), moneyText(outstanding),
      featureButton(outstanding ? 'Record repayment' : 'Settled', () => repayDebt(debt, principal, outstanding), false, !outstanding)
    ];
  });
  content.append(element('h3', 'Owed to me · ' + moneyText(receivable) + '    |    I owe · ' + moneyText(payable)));
  content.append(featureTable(['Person or business', 'Direction', 'Started', 'Original amount', 'Repaid', 'Outstanding', 'Actions'],
    rows, 'No loans or debts recorded.'));
}

function addDebt() {
  const { date, time } = localClock();
  openFeatureForm('Add money owed', [
    ['Person or business', 'party', ''],
    ['Direction', 'type', 'lend', 'select', DEBT_DIRECTIONS],
    ['Amount', 'amount', '', 'money'],
    ['Account', 'account', 'default', 'select', accountOptions()],
    ['Date', 'date', date, 'date'],
    ['Time (optional)', 'time', time, 'time']
  ], fields => {
    const debt = { id: Ledger.makeId(), party: requiredText(fields.get('party')), type: fields.get('type') };
    const cents = Ledger.amount(fields.get('amount'));
    appendEntry({
      counterparty: debt.party, type: debt.type, debt: debt.id, account: fields.get('account'), date: fields.get('date'), time: fields.get('time'), cents
    });
    ledger.settings.debts.push(debt);
  }, 'Record starting amount');
}

function repayDebt(debt, principal, outstanding) {
  const { date, time } = localClock();
  openFeatureForm('Repayment · ' + debt.party, [
    ['Amount', 'amount', amountText(Number(outstanding)), 'money'],
    ['Account', 'account', principal.account, 'select', accountOptions()],
    ['Date', 'date', date, 'date'],
    ['Time (optional)', 'time', time, 'time']
  ], fields => {
    const cents = Ledger.amount(fields.get('amount'));
    const date = fields.get('date');
    if (BigInt(cents) > outstanding) throw new Error('Enter an amount within the outstanding balance.');
    if (date < principal.date) throw new Error('The repayment cannot be earlier than the starting transaction.');
    appendEntry({
      counterparty: debt.party, type: debt.type === 'lend' ? 'collect' : 'repay', debt: debt.id,
      account: fields.get('account'), date, time: fields.get('time'), cents
    });
  }, 'Record repayment');
}

function renderBackups(content, actions) {
  actions.append(
    featureButton(window.DaybookFiles ? 'Save dated backup' : 'Download dated backup', () => perform(async () => {
      const stamp = localClock();
      const name = ledger.name.replace(/\.csv$/i, '') + '-backup-' + stamp.date + '-' + stamp.time.replaceAll(':', '') + '.csv';
      await downloadCsv(Ledger.write(ledger.entries, ledger.settings), name);
    }), true, !ledger),
    featureButton('Restore from CSV', () => {
      if (!window.DaybookFiles) {
        byId('restore-upload').click();
        return;
      }
      if (allowSwitch()) perform(async () => {
        const [handle] = await window.showOpenFilePicker({ types: csvTypes });
        await openFile(await handle.getFile(), null, true);
      });
    })
  );
  content.append(element('p', 'Backups include the current transactions and all ledger settings, including unsaved changes.'));
  content.append(element('p', 'When you restore a backup, Daybook opens a separate copy. Save the restored ledger under a new filename.'));
}

function appendEntry(values) {
  const entry = Ledger.validate({
    id: Ledger.makeId(), time: '', category: '', notes: '', to: '', debt: '', ...values
  });
  ledger.entries.push(entry);
}

function saveSetting(key, existing, values) {
  const collection = ledger.settings[key];
  if (existing) Object.assign(existing, values);
  else collection.push({ id: Ledger.makeId(), ...values });
}

function removeSetting(key, item, question) {
  if (!busy && window.confirm(question)) {
    ledger.settings[key] = ledger.settings[key].filter(value => value !== item);
    featureChanged();
  }
}

function requiredText(value) {
  const clean = value.trim();
  if (!clean) throw new Error('Enter a value in the required text field.');
  return clean;
}
