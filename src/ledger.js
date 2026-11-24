'use strict';

const Ledger = (() => {
  const previousHeaders = ['ID', 'Date', 'Time', 'Type', 'Amount', 'Counterparty', 'Category', 'Notes'];
  const headers = [...previousHeaders, 'Account', 'Transfer To', 'Debt ID', 'Settings'];
  const validId = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value);
  const validCents = value => Number.isSafeInteger(value) && value > 0 && value <= 999999999999;
  const validDate = value => {
    if (typeof value !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value + 'T00:00:00Z');
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
  };
  const text = value => typeof value === 'string' && Boolean(value.trim());
  const categoryKey = value => value.trim().toLowerCase();
  const emptySettings = () => ({
    accounts: [{ id: 'default', name: 'General', opening: 0 }],
    budgets: [], recurring: [], debts: []
  });

  function validateSettings(settings, entries) {
    if (!settings || !['accounts', 'budgets', 'recurring', 'debts'].every(key => Array.isArray(settings[key]))) {
      throw new Error('Daybook settings are missing or invalid.');
    }
    const ids = (items, check) => {
      const result = new Set();
      for (const item of items) {
        if (!item || !validId(item.id) || result.has(item.id) || !check(item)) {
          throw new Error('A Daybook account, budget, recurring item, or debt is invalid.');
        }
        result.add(item.id);
      }
      return result;
    };
    const accounts = ids(settings.accounts, item => text(item.name) &&
      (item.opening === 0 || validCents(item.opening)));
    if (!accounts.has('default')) throw new Error('The General account is missing.');
    if (new Set(settings.accounts.map(item => categoryKey(item.name))).size !== accounts.size) {
      throw new Error('Account names must be unique.');
    }
    ids(settings.budgets, item => text(item.category) && validCents(item.cents));
    if (new Set(settings.budgets.map(item => categoryKey(item.category))).size !== settings.budgets.length) {
      throw new Error('Budget categories must be unique.');
    }
    ids(settings.recurring, item => text(item.counterparty) && typeof item.category === 'string' &&
      accounts.has(item.account) && validCents(item.cents) && ['debit', 'credit'].includes(item.type) &&
      validDate(item.next) && ['weekly', 'monthly'].includes(item.frequency) &&
      Number.isInteger(item.day) && item.day >= 1 && item.day <= 31);
    const debts = ids(settings.debts, item => text(item.party) && ['lend', 'borrow'].includes(item.type));
    const principals = new Map();
    const payments = new Map();
    for (const entry of entries) {
      if (!accounts.has(entry.account || 'default') ||
          (entry.type === 'transfer' && (!accounts.has(entry.to) || entry.to === entry.account)) ||
          (entry.type !== 'transfer' && entry.to)) {
        throw new Error('A transaction refers to an invalid account or transfer destination.');
      }
      if (['lend', 'borrow', 'collect', 'repay'].includes(entry.type)) {
        if (!debts.has(entry.debt)) throw new Error('A debt transaction refers to an unknown debt.');
        const principal = ['lend', 'borrow'].includes(entry.type);
        if (principal && principals.has(entry.debt)) throw new Error('A debt has multiple starting transactions.');
        if (principal) principals.set(entry.debt, entry);
        else {
          if (!payments.has(entry.debt)) payments.set(entry.debt, []);
          payments.get(entry.debt).push(entry);
        }
      } else if (entry.debt) {
        throw new Error('An unrelated transaction refers to a debt.');
      }
    }
    for (const debt of settings.debts) {
      const start = principals.get(debt.id);
      if (start?.type !== debt.type) throw new Error('A debt is missing its starting transaction.');
      let outstanding = BigInt(start.cents);
      for (const payment of payments.get(debt.id) || []) {
        if (payment.date < start.date || payment.type !== (debt.type === 'lend' ? 'collect' : 'repay')) {
          throw new Error('A repayment date or direction is invalid.');
        }
        outstanding -= BigInt(payment.cents);
      }
      if (outstanding < 0n) throw new Error('A debt has been repaid beyond its original amount.');
    }
  }
  const formula = /^[\s\uFEFF]*[=+@-]|^[\t\r\n]/;
  const escapeText = value => value.startsWith("'") || formula.test(value) ? "'" + value : value;
  const unescapeText = value => value.startsWith("'") &&
    (value[1] === "'" || formula.test(value.slice(1))) ? value.slice(1) : value;
  const makeId = () => globalThis.crypto.randomUUID?.() ??
    Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');

  function amount(value, allowZero = false) {
    const match = /^(\d{1,10})(?:\.(\d{1,2}))?$/.exec(String(value).trim());
    if (!match) throw new Error('Enter an amount with up to 10 digits and two decimal places.');
    const cents = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'));
    if (!allowZero && cents === 0) throw new Error('Amount must be greater than zero.');
    return cents;
  }

  function validate(entry) {
    if (!validDate(entry.date)) throw new Error('Use a valid date in YYYY-MM-DD format.');
    if (entry.time && !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(entry.time)) {
      throw new Error('Use a valid 24-hour time.');
    }
    if (!['credit', 'debit', 'transfer', 'lend', 'borrow', 'collect', 'repay'].includes(entry.type)) throw new Error('Invalid transaction type.');
    if (!entry.counterparty.trim()) throw new Error('Enter a source or payee.');
    if (entry.time.length === 5) entry.time += ':00';
    return entry;
  }

  function parse(text) {
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    let closed = false;
    const pushField = () => {
      row.push(field);
      field = '';
      closed = false;
    };
    const pushRow = () => {
      pushField();
      rows.push(row);
      row = [];
    };
    const source = text.replace(/^\uFEFF/, '');
    for (let index = 0; index < source.length; index++) {
      const char = source[index];
      if (quoted) {
        if (char !== '"') field += char;
        else if (source[index + 1] === '"') {
          field += '"';
          index++;
        } else {
          quoted = false;
          closed = true;
        }
      } else if (char === ',') {
        pushField();
      } else if (char === '\r' || char === '\n') {
        if (char === '\r' && source[index + 1] === '\n') index++;
        pushRow();
      } else if (char === '"' && !field && !closed) {
        quoted = true;
      } else if (char === '"' || closed) {
        throw new Error(`CSV row ${rows.length + 1} has unexpected characters around a quoted field.`);
      } else {
        field += char;
      }
    }
    if (quoted) throw new Error(`CSV row ${rows.length + 1} contains an unclosed quote.`);
    if (row.length || field || closed) pushRow();
    return rows;
  }

  function read(csv) {
    const [rawHeader, ...rows] = parse(csv);
    const header = (rawHeader || []).map(value => value.trim().toLowerCase());
    const versionTwo = header.join(',') === headers.join(',').toLowerCase();
    const canonical = versionTwo || header.join(',') === previousHeaders.join(',').toLowerCase();
    if (header.includes('settings') && !versionTwo) throw new Error('The Daybook CSV header has changed. Restore the original column order.');
    const counterpartyColumn = header.includes('counterparty') ? 'counterparty' : 'description';
    const typed = header.includes('type') && header.includes('amount');
    const hasBothSides = header.includes('debit') && header.includes('credit');
    if (!header.includes('date') || !header.includes(counterpartyColumn) || (!typed && !hasBothSides)
        || new Set(header).size !== header.length) {
      throw new Error('CSV needs Date, Counterparty or Description, and either Type and Amount or Debit and Credit columns.');
    }

    const ids = new Set();
    const entries = [];
    let settings;
    rows.forEach((row, index) => {
      if (row.length === 1 && !row[0].trim()) return;
      try {
        if (row.length !== header.length) throw new Error('The number of fields does not match the header.');
        const get = key => row[header.indexOf(key)] ?? '';
        if (versionTwo && get('type') === 'settings') {
          if (settings !== undefined || row.some((value, column) => column !== 3 && column !== 11 && value)) {
            throw new Error('Invalid settings row.');
          }
          settings = JSON.parse(get('settings'));
          return;
        }
        if (versionTwo && get('settings')) throw new Error('Unexpected settings on a transaction.');
        const getText = canonical ? key => unescapeText(get(key)) : get;
        const id = canonical ? get('id') : makeId();
        if (!validId(id) || ids.has(id)) {
          throw new Error('Transaction ID is missing, invalid, or duplicated.');
        }
        let type;
        let cents;
        if (typed) {
          const rawType = get('type').trim().toLowerCase();
          type = ({ expense: 'debit', income: 'credit' })[rawType] || rawType;
          cents = amount(get('amount'));
        } else {
          const debit = get('debit').trim() ? amount(get('debit'), true) : 0;
          const credit = get('credit').trim() ? amount(get('credit'), true) : 0;
          if (Boolean(debit) === Boolean(credit)) throw new Error('Enter a positive amount on exactly one side.');
          type = debit ? 'debit' : 'credit';
          cents = debit || credit;
        }
        entries.push(validate({
          id, type, cents, date: get('date').trim(), time: get('time').trim(),
          counterparty: getText(counterpartyColumn), category: getText('category'), notes: getText('notes'),
          ...(versionTwo ? { account: get('account'), to: get('transfer to'), debt: get('debt id') } : {})
        }));
        ids.add(id);
      } catch (error) {
        throw new Error(`CSV row ${index + 2}: ${error.message}`);
      }
    });
    if (versionTwo && !settings) throw new Error('The Daybook settings row is missing.');
    settings = versionTwo ? settings : emptySettings();
    validateSettings(settings, entries);
    return { entries, canonical, settings };
  }

  function write(entries, settings = emptySettings()) {
    validateSettings(settings, entries);
    const quote = field => /[",\r\n]/.test(field) ? '"' + field.replaceAll('"', '""') + '"' : field;
    const rows = entries.map(entry => [
      entry.id, entry.date, entry.time, entry.type, (entry.cents / 100).toFixed(2),
      escapeText(entry.counterparty), escapeText(entry.category), escapeText(entry.notes),
      entry.account || 'default', entry.to || '', entry.debt || '', ''
    ]);
    const settingsRow = ['', '', '', 'settings', '', '', '', '', '', '', '', JSON.stringify(settings)];
    return '\uFEFF' + [headers, ...rows, settingsRow].map(row => row.map(quote).join(',')).join('\r\n') + '\r\n';
  }

  return { amount, validate, validateSettings, emptySettings, categoryKey, read, write, makeId };
})();

if (typeof module !== 'undefined') module.exports = Ledger;
