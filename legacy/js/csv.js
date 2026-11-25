// Reading bank CSV files. Works out which bank a file is from by its column names.
import { parseAmount, parseDate, r2, cleanName } from './money.js';
import { guessDetail } from './detail.js';
import { INVESTED_ACCOUNTS } from './seed.js';

// Adapted from the old dashboard: handles quotes, BOMs and comma, semicolon or tab separators.
export function parseCSV(text) {
  text = String(text ?? '').replace(/^﻿/, '');
  const first = text.split(/\r?\n/)[0] || '';
  const delim = [',', ';', '\t'].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

export const normHeader = (h) =>
  String(h).toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();

export function detectBank(headerRow) {
  const H = headerRow.map(normHeader);
  const has = (...names) => names.every((n) => H.includes(n));
  // A simple list you write yourself (or get from a chatbot): Date, Description, Amount, Account, Category, Note.
  if (has('date', 'description', 'amount', 'account')) return 'list';
  if (has('date', 'description', 'money out', 'money in', 'section')) return 'revolut';
  if (has('started date', 'description', 'amount')) return 'revolut-classic';
  if (has('transaction id', 'name', 'amount')) return 'monzo';
  if (has('date', 'description') && (H.includes('paid out') || H.includes('money out'))) return 'ulster';
  return null;
}

const ACCOUNT_OF = { ulster: 'Ulster Bank', monzo: 'Monzo', revolut: 'Revolut', 'revolut-classic': 'Revolut', list: 'Your list' };

// "ulster", "Ulster Bank", "ULSTER" all become "Ulster Bank". Anything else is kept as written.
function normAccount(text) {
  const t = String(text ?? '').trim();
  const l = t.toLowerCase();
  if (l.includes('ulster')) return 'Ulster Bank';
  if (l.includes('revolut')) return 'Revolut';
  if (l.includes('monzo')) return 'Monzo';
  if (l.includes('credit') || l.includes('capital one')) return 'Credit Card';
  if (l.includes('trading')) return 'Trading 212';
  if (l.includes('invest')) return 'InvestEngine';
  return t || 'Unknown';
}

function make(account, date, rawDesc, amount, direction, extra = {}) {
  return { account, date, desc: cleanName(rawDesc) || 'Unknown', amount: r2(Math.abs(amount)), direction, source: 'csv', ...extra };
}

// Returns { bank, account, rows, skipped, unreadable }.
//   rows: every money-out and money-in line, with amount always positive and direction 'out' or 'in'
//   skipped: lines with no amount, unreadable: lines whose date could not be read
export function parseBankCsv(text) {
  const table = parseCSV(text);
  if (table.length < 2) throw new Error('That file has no transactions in it.');
  const bank = detectBank(table[0]);
  if (!bank) throw new Error("I couldn't tell which bank this file is from. I can read Ulster Bank, Monzo and Revolut CSV files, or a simple list with the columns Date, Description, Amount, Account, Category and Note.");
  const headers = table[0].map(normHeader);
  const col = (...names) => headers.findIndex((h) => names.includes(h));
  const account = ACCOUNT_OF[bank];
  const rows = [];
  let skipped = 0;
  let unreadable = 0;

  for (const r of table.slice(1)) {
    let row = null;
    let date;
    if (bank === 'list') {
      date = parseDate(r[col('date')]);
      const amount = parseAmount(r[col('amount')]);
      if (!date) { unreadable++; continue; }
      const note = String(r[col('note')] ?? '').trim();
      // A line the writer has marked as a duplicate is left out, so it is never counted twice.
      if (/duplicate entry|exclude from actual spending/i.test(note)) { skipped++; continue; }
      if (Number.isFinite(amount) && amount !== 0) {
        const description = r[col('description')];
        const category = String(r[col('category')] ?? '').trim();
        row = make(normAccount(r[col('account')]), date, description, amount, amount < 0 ? 'out' : 'in', {
          userCategory: category,
          ...(note ? { note } : {}),
          detail: INVESTED_ACCOUNTS.includes(category) ? 'ISA deposit' : guessDetail(description),
        });
      }
    } else if (bank === 'ulster') {
      date = parseDate(r[col('date')]);
      const out = parseAmount(r[col('paid out', 'money out')]);
      const inn = parseAmount(r[col('paid in', 'money in')]);
      if (!date) { unreadable++; continue; }
      const desc = r[col('description', 'details', 'narrative')];
      const extra = { type: r[col('type')] || '' };
      if (out > 0) row = make(account, date, desc, out, 'out', extra);
      else if (inn > 0) row = make(account, date, desc, inn, 'in', extra);
    } else if (bank === 'monzo') {
      date = parseDate(r[col('date')]);
      const amount = parseAmount(r[col('amount')]);
      if (!date) { unreadable++; continue; }
      const type = r[col('type')] || '';
      if (Number.isFinite(amount) && amount !== 0) {
        row = make(account, date, r[col('name')] || r[col('description')], amount, amount < 0 ? 'out' : 'in', {
          type,
          ref: r[col('transaction id')] || undefined,
          bankCategory: r[col('category')] || '',
          ...(/pot transfer/i.test(type) ? { internalHint: 'Pot transfer' } : {}),
        });
      }
    } else if (bank === 'revolut') {
      // The statement's "Money out" already includes any fee, so fees are NOT added again.
      date = parseDate(r[col('date')]);
      const out = parseAmount(r[col('money out')]);
      const inn = parseAmount(r[col('money in')]);
      if (!date) { unreadable++; continue; }
      const desc = r[col('description')];
      const section = r[col('section')] || '';
      const extra = /pocket/i.test(section) ? { internalHint: 'Pocket move' } : {};
      if (out > 0) row = make(account, date, desc, out, 'out', extra);
      else if (inn > 0) row = make(account, date, desc, inn, 'in', extra);
    } else {
      // The older Revolut export: one signed Amount column, plus a separate Fee that is added on.
      date = parseDate(r[col('completed date')] || r[col('started date')]);
      const amount = parseAmount(r[col('amount')]);
      if (!date) { unreadable++; continue; }
      const state = String(r[col('state')] || '').toUpperCase();
      if (/REVERTED|DECLINED|FAILED/.test(state)) { skipped++; continue; }
      const feeCol = col('fee');
      const fee = feeCol >= 0 ? Math.abs(parseAmount(r[feeCol]) || 0) : 0;
      const isMove = /savings/i.test(r[col('product')] || '') || /exchange/i.test(r[col('type')] || '');
      if (Number.isFinite(amount) && amount !== 0) {
        row = make(account, date, r[col('description')], amount < 0 ? -amount + fee : amount, amount < 0 ? 'out' : 'in', isMove ? { internalHint: 'Move' } : {});
      }
    }
    if (row) rows.push(row);
    else skipped++;
  }
  return { bank, account, rows, skipped, unreadable };
}
