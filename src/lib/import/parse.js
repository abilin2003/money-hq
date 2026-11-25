// Reading bank files. The bank is worked out from the header row, never from column positions.
// Ported from the previous app; amounts are whole pence, signed (money out is negative).
import { parsePence } from '../money.js';
import { parseDate, cleanName } from '../text.js';

// Handles quotes, BOMs and comma, semicolon or tab separators.
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
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false; } else cell += c;
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

export const normHeader = (h) => String(h).toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();

export function detectBank(headerRow) {
  const H = headerRow.map(normHeader);
  const has = (...names) => names.every((n) => H.includes(n));
  if (has('date', 'description', 'amount', 'account')) return 'list';
  if (has('date', 'description', 'money out', 'money in', 'section')) return 'revolut';
  if (has('started date', 'description', 'amount')) return 'revolut-app';
  if (has('transaction id', 'name', 'amount')) return 'monzo';
  if (has('date', 'description') && (H.includes('paid out') || H.includes('money out'))) return 'ulster';
  return null;
}

// Account names as they are in Supabase.
const ACCOUNT_OF = { ulster: 'Ulster Bank', monzo: 'Monzo savings', revolut: 'Revolut', 'revolut-app': 'Revolut' };
export function normAccount(text) {
  const l = String(text ?? '').trim().toLowerCase();
  if (l.includes('ulster')) return 'Ulster Bank';
  if (l.includes('pocket')) return 'Revolut Pockets';
  if (l.includes('revolut')) return 'Revolut';
  if (l.includes('monzo')) return 'Monzo savings';
  if (l.includes('credit') || l.includes('capital one')) return 'Capital One';
  return null;
}

const amt = (v) => { const p = parsePence(v); return p === null ? 0 : p; };
const make = (account, date, rawDesc, pence, extra = {}) => ({ account, date, raw_description: cleanName(rawDesc) || 'Unknown', amount_pence: pence, ...extra });

// Returns { bank, account, rows, skipped, unreadable }. Each row: { account, date, amount_pence, raw_description, ... }.
export function parseBankFile(text) {
  const table = parseCSV(text);
  if (table.length < 2) throw new Error('That file has no transactions in it.');
  const bank = detectBank(table[0]);
  if (!bank) throw new Error("I couldn't tell which bank this file is from. I can read Ulster Bank, Revolut and Monzo CSV files, or a list with the columns Date, Description, Amount, Account, Category and Note. Capital One comes once I've seen a sample of its header row.");
  const headers = table[0].map(normHeader);
  const col = (...names) => headers.findIndex((h) => names.includes(h));
  const account = ACCOUNT_OF[bank] || null;
  const rows = [];
  let skipped = 0;
  let unreadable = 0;

  for (const r of table.slice(1)) {
    let row = null;
    let date;
    if (bank === 'list') {
      date = parseDate(r[col('date')]);
      if (!date) { unreadable++; continue; }
      const note = String(r[col('note')] ?? '').trim();
      if (/duplicate entry|exclude from actual spending/i.test(note)) { skipped++; continue; }
      const pence = amt(r[col('amount')]);
      const acc = normAccount(r[col('account')]);
      if (pence !== 0 && acc) row = make(acc, date, r[col('description')], pence, { userCategory: String(r[col('category')] ?? '').trim(), note: note || null });
    } else if (bank === 'ulster') {
      date = parseDate(r[col('date')]);
      if (!date) { unreadable++; continue; }
      const out = Math.abs(amt(r[col('paid out', 'money out')]));
      const inn = Math.abs(amt(r[col('paid in', 'money in')]));
      const desc = r[col('description', 'details', 'narrative')];
      if (out > 0) row = make(account, date, desc, -out, { type: r[col('type')] || '' });
      else if (inn > 0) row = make(account, date, desc, inn, { type: r[col('type')] || '' });
    } else if (bank === 'monzo') {
      date = parseDate(r[col('date')]);
      if (!date) { unreadable++; continue; }
      const pence = amt(r[col('amount')]);
      const type = r[col('type')] || '';
      if (pence !== 0) {
        row = make(account, date, r[col('name')] || r[col('description')], pence, {
          type, ref: r[col('transaction id')] || null, bankCategory: r[col('category')] || '',
          ...(/pot transfer/i.test(type) ? { internalHint: 'Pot transfer' } : {}),
        });
      }
    } else if (bank === 'revolut') {
      // The statement's "Money out" already includes any fee.
      date = parseDate(r[col('date')]);
      if (!date) { unreadable++; continue; }
      const out = Math.abs(amt(r[col('money out')]));
      const inn = Math.abs(amt(r[col('money in')]));
      const section = r[col('section')] || '';
      const extra = /pocket/i.test(section) ? { internalHint: 'Pocket move' } : {};
      if (out > 0) row = make(account, date, r[col('description')], -out, extra);
      else if (inn > 0) row = make(account, date, r[col('description')], inn, extra);
    } else {
      // The Revolut app export: Started Date (completed dates lag and bunch weekend spending onto Monday),
      // COMPLETED rows only, and the Fee is added to money going out.
      date = parseDate(r[col('started date')] || r[col('completed date')]);
      if (!date) { unreadable++; continue; }
      const state = String(r[col('state')] || '').toUpperCase();
      if (state && state !== 'COMPLETED') { skipped++; continue; }
      const pence = amt(r[col('amount')]);
      const fee = col('fee') >= 0 ? Math.abs(amt(r[col('fee')])) : 0;
      const isMove = /savings|pocket/i.test(r[col('product')] || '') || /exchange/i.test(r[col('type')] || '');
      if (pence !== 0) row = make(account, date, r[col('description')], pence < 0 ? pence - fee : pence, isMove ? { internalHint: 'Pocket move' } : {});
    }
    if (row) rows.push(row);
    else skipped++;
  }
  return { bank, account, rows, skipped, unreadable };
}
