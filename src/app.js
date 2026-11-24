'use strict';

const byId = id => document.getElementById(id);
const form = byId('transaction-form');
const editor = byId('editor');
const upload = byId('upload');
const money = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
let ledger = null;
let editing = null;
let initialText = {};
let busy = false;
let noticeTimer;
const filterIds = ['search', 'filter', 'month', 'account-filter', 'category-filter',
  'from-filter', 'to-filter', 'min-filter', 'max-filter', 'sort-filter'];
const debtTypes = ['lend', 'borrow', 'collect', 'repay'];
const typeLabels = {
  credit: 'Income', debit: 'Expense', transfer: 'Transfer', lend: 'Money lent',
  borrow: 'Money borrowed', collect: 'Repayment received', repay: 'Repayment sent'
};
const accountName = id => ledger?.settings.accounts.find(account => account.id === (id || 'default'))?.name || 'General';
const accountOptions = () => ledger.settings.accounts.map(account => [account.id, account.name]);

function localClock(now = new Date()) {
  const pad = value => String(value).padStart(2, '0');
  return {
    date: [now.getFullYear(), pad(now.getMonth() + 1), pad(now.getDate())].join('-'),
    time: [now.getHours(), now.getMinutes(), now.getSeconds()].map(pad).join(':')
  };
}

function replaceOptions(select, options, selected = select.value) {
  if (options.length !== select.options.length || options.some(([value, label], index) =>
    select.options[index].value !== value || select.options[index].text !== label)) {
    select.replaceChildren(...options.map(([value, label]) => new Option(label, value)));
  }
  select.value = options.some(([value]) => value === selected) ? selected : options[0]?.[0] || '';
}

function totals(entries) {
  let income = 0n;
  let expense = 0n;
  for (const entry of entries) {
    if (entry.type === 'credit') income += BigInt(entry.cents);
    if (entry.type === 'debit') expense += BigInt(entry.cents);
  }
  return { income, expense, net: income - expense };
}

function notify(message) {
  const notice = byId('notice');
  notice.textContent = message;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { notice.textContent = ''; }, 8500);
}

function setDirty(dirty) {
  ledger.dirty = dirty;
  ledger.downloadPending = false;
  window.removeEventListener('beforeunload', warnUnsaved);
  if (dirty) window.addEventListener('beforeunload', warnUnsaved);
}

function warnUnsaved(event) {
  event.preventDefault();
  event.returnValue = true;
}

function allowSwitch() {
  return !ledger?.dirty || window.confirm('This ledger has unsaved changes. Discard those changes?');
}

function resetFilters() {
  for (const id of filterIds) byId(id).value = id === 'filter' ? 'all' : '';
}

function activate(next, dirty = false) {
  ledger = next;
  ledger.settings ??= Ledger.emptySettings();
  resetFeatureState();
  setDirty(dirty);
  resetFilters();
  render();
}

function newFile() {
  if (!busy && allowSwitch()) {
    activate({ name: 'Daybook.csv', entries: [], handle: null, legacy: false }, true);
    notify('Ledger created. Select Save to choose where to keep the CSV.');
  }
}

async function perform(action) {
  if (busy) return;
  busy = true;
  render();
  try {
    await action();
  } catch (error) {
    if (error.name !== 'AbortError') notify(error.message || 'The file operation failed.');
  } finally {
    busy = false;
    render();
  }
}

async function openFile(file, handle = null, restore = false) {
  const bytes = await file.arrayBuffer();
  let source;
  try {
    source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new Error('Save the file as UTF-8 CSV, then open it again.');
  }
  const { entries, canonical, settings } = Ledger.read(source);
  if (restore) {
    const name = file.name.replace(/\.csv$/i, '') + '-restored.csv';
    activate({ name, entries, settings, handle: null, legacy: false }, true);
    notify('Backup opened as a separate ledger. Save it under a new name.');
    return;
  }
  activate({ name: file.name, entries, settings, handle, source, legacy: !canonical });
  notify(canonical ? 'CSV opened.' : 'Legacy CSV opened. Save as will create a Daybook copy.');
}

function pickFile() {
  if (busy) return;
  if (!window.showOpenFilePicker) {
    upload.click();
    return;
  }
  if (!allowSwitch()) return;
  perform(async () => {
    let selected;
    try {
      [selected] = await window.showOpenFilePicker({ types: csvTypes });
    } catch (error) {
      if (['SecurityError', 'NotSupportedError'].includes(error.name)) {
        upload.click();
        return;
      }
      throw error;
    }
    await openFile(await selected.getFile(), selected);
  });
}

const csvTypes = [{ description: 'CSV ledger', accept: { 'text/csv': ['.csv'] } }];
const filename = name => /\.csv$/i.test(name) ? name : name + '.csv';

function downloadCsv(contents, name) {
  const url = URL.createObjectURL(new Blob([contents], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  // The browser does not report whether the user completed or canceled a download.
  notify('Download requested. Keep the CSV from your browser’s downloads.');
}

async function saveFile(saveAs) {
  if (!ledger) return;
  const contents = Ledger.write(ledger.entries, ledger.settings);
  let handle = saveAs || ledger.legacy ? null : ledger.handle;
  const name = ledger.legacy ? ledger.name.replace(/\.csv$/i, '') + '-daybook.csv' : filename(ledger.name);
  if (!handle && window.showSaveFilePicker) {
    try {
      handle = await window.showSaveFilePicker({ suggestedName: name, types: csvTypes });
    } catch (error) {
      if (!['SecurityError', 'NotSupportedError'].includes(error.name)) throw error;
    }
  }
  if (!handle) {
    downloadCsv(contents, name);
    ledger.downloadPending = ledger.dirty;
    return;
  }

  if (ledger.handle && await handle.isSameEntry(ledger.handle)) {
    if (ledger.legacy) throw new Error('Choose a different filename to preserve the original CSV.');
    const currentFile = await handle.getFile();
    const current = new TextDecoder('utf-8', { ignoreBOM: true }).decode(await currentFile.arrayBuffer());
    if (current !== ledger.source) {
      throw new Error('This CSV changed outside Daybook. Use Save as and choose another filename.');
    }
  }

  const writer = await handle.createWritable();
  try {
    await writer.write(contents);
    await writer.close();
  } catch (error) {
    await writer.abort().catch(() => {});
    throw error;
  }
  Object.assign(ledger, { name: handle.name, handle, source: contents, legacy: false });
  setDirty(false);
  notify('CSV saved.');
}

function render() {
  const entries = ledger?.entries ?? [];
  const months = [...new Set(entries.map(entry => entry.date.slice(0, 7)))].sort().reverse();
  const categories = [...new Set(entries.map(entry => entry.category).filter(Boolean))].sort();
  replaceOptions(byId('month'), [['', 'All months'], ...months.map(month => [month, month])]);
  replaceOptions(byId('account-filter'), [['', 'All accounts'], ...(ledger ? accountOptions() : [])]);
  replaceOptions(byId('category-filter'), [['', 'All categories'], ...categories.map(category => [category, category])]);
  const [rawQuery, type, month, account, category, from, to, min, max, sort] =
    filterIds.map(id => byId(id).value);
  const query = rawQuery.trim().toLowerCase();
  byId('filter-error').textContent = from && to && from > to ? 'The start date must be on or before the end date.' :
    min && max && Number(min) > Number(max) ? 'The minimum amount must be below or equal to the maximum.' : '';
  const filtered = Boolean(query || type !== 'all' || month || account || category || from || to || min || max);
  const visible = entries.filter(entry => {
    const haystack = [entry.counterparty, entry.category, entry.notes, accountName(entry.account),
      entry.to ? accountName(entry.to) : '', typeLabels[entry.type]].join(' ').toLowerCase();
    return (!query || haystack.includes(query)) &&
      (type === 'all' || type === entry.type || (type === 'debt' && debtTypes.includes(entry.type))) &&
      (!month || entry.date.startsWith(month + '-')) &&
      (!account || account === (entry.account || 'default') || account === entry.to) &&
      (!category || entry.category === category) &&
      (!from || entry.date >= from) && (!to || entry.date <= to) &&
      (!min || entry.cents >= Math.round(Number(min) * 100)) &&
      (!max || entry.cents <= Math.round(Number(max) * 100));
  });
  const newestFirst = (a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time);
  visible.sort((a, b) => {
    if (sort === 'oldest') return newestFirst(b, a);
    if (sort === 'high') return b.cents - a.cents || newestFirst(a, b);
    if (sort === 'low') return a.cents - b.cents || newestFirst(a, b);
    return newestFirst(a, b);
  });

  const { income, expense, net } = totals(entries);
  byId('balance').textContent = formatTotal(net);
  byId('income').textContent = formatTotal(income);
  byId('expense').textContent = formatTotal(expense);
  byId('count').textContent = filtered ? `${visible.length} of ${entries.length} entries` :
    `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`;
  byId('file-status').textContent = ledger ?
    ledger.name + (ledger.dirty ? ' · Unsaved changes' : ' · Open') : 'No CSV open';
  byId('confirm-download').hidden = !ledger?.downloadPending;
  byId('confirm-download').disabled = busy;
  byId('dot').className = ledger?.dirty ? 'dirty' : ledger ? 'ready' : '';
  ['save', 'save-as', 'add'].forEach(id => { byId(id).disabled = !ledger || busy; });
  ['open', 'new', 'empty-action'].forEach(id => { byId(id).disabled = busy; });
  byId('clear-filters').hidden = !filtered && !sort;
  byId('empty').hidden = visible.length > 0;
  byId('empty-title').textContent = !ledger ? 'Start with a CSV' : filtered ? 'No matching transactions' : 'No transactions yet';
  byId('empty-text').textContent = !ledger ? 'Create a ledger or open a CSV you already have.' :
    filtered ? 'Clear the filters to see all entries.' : 'Add income or an expense to start tracking your money.';
  byId('empty-action').textContent = !ledger ? 'Create a ledger' : filtered ? 'Clear filters' : 'Add transaction';
  const rows = document.createDocumentFragment();
  for (const entry of visible) rows.append(renderEntry(entry));
  byId('entries').replaceChildren(rows);
  renderFeatureView();
}

function formatTotal(cents) {
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  const whole = absolute / 100n;
  const fraction = String(absolute % 100n).padStart(2, '0');
  return money.formatToParts(negative && whole === 0n ? -0 : negative ? -whole : whole)
    .map(part => part.type === 'fraction' ? fraction : part.value).join('');
}

function renderEntry(entry) {
  const row = document.createElement('tr');
  const outgoing = ['debit', 'lend', 'repay'].includes(entry.type);
  const transfer = entry.type === 'transfer';
  const principal = ['lend', 'borrow'].includes(entry.type);
  const description = row.insertCell();
  const detail = document.createElement('div');
  detail.className = 'entry-detail';
  const icon = document.createElement('span');
  icon.className = transfer ? 'entry-icon' : outgoing ? 'entry-icon out' : 'entry-icon in';
  icon.textContent = transfer ? '↔' : outgoing ? '↗' : '↙';
  icon.setAttribute('aria-hidden', 'true');
  const label = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = entry.counterparty;
  const notes = document.createElement('small');
  notes.textContent = debtTypes.includes(entry.type) ? [typeLabels[entry.type], entry.notes].filter(Boolean).join(' · ') : entry.notes;
  label.append(title, notes);
  detail.append(icon, label);
  description.append(detail);
  row.insertCell().textContent = entry.category || '—';
  row.insertCell().textContent = transfer ? accountName(entry.account) + ' → ' + accountName(entry.to) : accountName(entry.account);
  const timestamp = row.insertCell();
  timestamp.textContent = entry.date;
  if (entry.time) {
    const time = document.createElement('small');
    time.textContent = entry.time;
    timestamp.append(time);
  }
  const amount = row.insertCell();
  amount.className = 'numeric ' + (transfer ? '' : outgoing ? 'expense' : 'income');
  amount.textContent = (transfer ? '' : outgoing ? '−' : '+') + formatTotal(BigInt(entry.cents));
  const actions = row.insertCell();
  actions.className = 'row-actions';
  if (principal) {
    actions.textContent = 'Money owed';
    return row;
  }
  if (!debtTypes.includes(entry.type)) addRowAction(actions, 'Edit', entry, () => openEditor(entry));
  addRowAction(actions, 'Remove', entry, () => {
    if (window.confirm(`Remove the transaction for “${entry.counterparty}”?`)) {
      ledger.entries = ledger.entries.filter(item => item.id !== entry.id);
      setDirty(true);
      render();
      notify('Transaction removed. Save the CSV to keep this change.');
    }
  });
  return row;
}

function addRowAction(cell, text, entry, action) {
  const button = document.createElement('button');
  button.textContent = text;
  button.disabled = busy;
  button.setAttribute('aria-label', `${text} transaction for ${entry.counterparty}`);
  button.addEventListener('click', action);
  cell.append(button);
}

function syncPartyLabel() {
  const type = form.elements.type.value;
  const transfer = type === 'transfer';
  byId('counterparty-label').textContent = type === 'debit' ? 'Payee' : 'Income source';
  form.elements.counterparty.placeholder = type === 'debit' ? 'Who received the money?' : 'Where did the money come from?';
  byId('counterparty-field').hidden = transfer;
  form.elements.counterparty.required = !transfer;
  byId('account-label').textContent = transfer ? 'From account' : 'Account';
  byId('transfer-destination').hidden = !transfer;
  form.elements.to.required = transfer;
  form.elements.to.disabled = !transfer;
  if (transfer) {
    const destinations = accountOptions().filter(([id]) => id !== form.elements.account.value);
    replaceOptions(form.elements.to, [['', 'Choose another account'], ...destinations]);
  }
}

function openEditor(entry = null) {
  if (!ledger || busy) return;
  editing = entry;
  form.reset();
  const { date, time } = localClock();
  form.elements.date.value = entry?.date ?? date;
  form.elements.time.value = entry?.time ?? time;
  replaceOptions(form.elements.account, accountOptions(), entry?.account || 'default');
  if (entry) {
    form.elements.type.value = entry.type;
    form.elements.amount.value = (entry.cents / 100).toFixed(2);
    for (const key of ['counterparty', 'category', 'notes']) form.elements[key].value = entry[key];
  }
  initialText = Object.fromEntries(['counterparty', 'category', 'notes'].map(key => [key, form.elements[key].value]));
  const categories = [...new Set(ledger.entries.map(item => item.category).filter(Boolean))].sort();
  byId('categories').replaceChildren(...categories.map(category => {
    const option = document.createElement('option');
    option.value = category;
    return option;
  }));
  syncPartyLabel();
  if (entry?.to) form.elements.to.value = entry.to;
  byId('editor-title').textContent = entry ? 'Edit transaction' : 'Add transaction';
  byId('form-error').textContent = '';
  editor.showModal();
  (entry?.type === 'transfer' ? form.elements.account : form.elements.counterparty).focus();
}

form.addEventListener('change', syncPartyLabel);
form.addEventListener('submit', event => {
  event.preventDefault();
  const fields = new FormData(form);
  const getText = key => {
    const value = form.elements[key].value;
    if (editing && value === initialText[key]) return editing[key];
    return key === 'notes' ? value : value.trim();
  };
  try {
    const type = fields.get('type');
    const account = fields.get('account');
    const to = type === 'transfer' ? fields.get('to') : '';
    if (type === 'transfer' && (!to || to === account)) throw new Error('Choose two different accounts.');
    const entry = Ledger.validate({
      id: editing?.id ?? Ledger.makeId(),
      type, account, to, debt: '', cents: Ledger.amount(fields.get('amount')),
      date: fields.get('date'), time: fields.get('time'),
      counterparty: type === 'transfer' ? 'Account transfer' : getText('counterparty'), category: getText('category'), notes: getText('notes')
    });
    if (editing) ledger.entries[ledger.entries.indexOf(editing)] = entry;
    else ledger.entries.push(entry);
    setDirty(true);
    editor.close();
    render();
    notify('Transaction recorded. Save the CSV to keep this change.');
  } catch (error) {
    byId('form-error').textContent = error.message;
  }
});
byId('open').addEventListener('click', pickFile);
byId('new').addEventListener('click', newFile);
byId('save').addEventListener('click', () => perform(() => saveFile(false)));
byId('save-as').addEventListener('click', () => perform(() => saveFile(true)));
byId('confirm-download').addEventListener('click', () => {
  setDirty(false);
  render();
  notify('Download confirmed. Use Save to download a fresh copy after editing.');
});
byId('add').addEventListener('click', () => openEditor());
for (const id of ['cancel', 'close-editor']) byId(id).addEventListener('click', () => editor.close());
for (const id of filterIds) byId(id).addEventListener('input', render);
byId('clear-filters').addEventListener('click', () => { resetFilters(); render(); });
byId('empty-action').addEventListener('click', () => {
  if (!ledger) newFile();
  else if (!byId('clear-filters').hidden) { resetFilters(); render(); }
  else openEditor();
});
upload.addEventListener('change', () => {
  const file = upload.files[0];
  upload.value = '';
  if (file && allowSwitch()) perform(() => openFile(file));
});
byId('more-filters').addEventListener('click', () => {
  const advanced = byId('advanced-filters');
  advanced.hidden = !advanced.hidden;
  byId('more-filters').setAttribute('aria-expanded', String(!advanced.hidden));
});
initFeatures();
render();
