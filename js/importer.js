// Turns bank files into an import plan, and a plan plus your choices into saved transactions.
import { parseBankCsv } from './csv.js';
import { classifyRow } from './classify.js';
import { findDuplicates } from './dedupe.js';
import { merchantKey, normKey, makeId } from './money.js';

// Rows that need the same decision share a group, e.g. 61 payments to the same shop.
export const groupKey = (row) => `${row.direction}|${merchantKey(row.desc) || normKey(row.desc) || row.desc}`;

// files: [{ name, text }]. existing: the transactions already saved.
// Duplicates are caught against what is saved AND against earlier files in the same batch.
export function buildImportPlan(files, settings, existing) {
  const pool = existing.slice();
  const fileInfo = [];
  const rows = [];

  for (const file of files) {
    let parsed;
    try {
      parsed = parseBankCsv(file.text);
    } catch (err) {
      fileInfo.push({ name: file.name, error: err.message });
      continue;
    }
    const classes = parsed.rows.map((r) => classifyRow(r, settings));
    const dup = findDuplicates(parsed.rows.map((r, i) => ({ ...r, kind: classes[i].kind })), pool);
    const fresh = [];
    parsed.rows.forEach((r, i) => {
      const c = classes[i];
      rows.push({ ...r, kind: c.kind, category: c.category, status: dup[i] ? 'duplicate' : c.status, reason: dup[i] === 'loose' ? 'matches an entry you typed by hand' : c.reason, duplicateOf: dup[i] || undefined, file: file.name, group: groupKey(r) });
      if (!dup[i]) fresh.push({ ...r, kind: c.kind });
    });
    pool.push(...fresh);
    const dates = parsed.rows.map((r) => r.date).sort();
    fileInfo.push({
      name: file.name,
      bank: parsed.account,
      rows: parsed.rows.length,
      from: dates[0] || '',
      to: dates[dates.length - 1] || '',
      duplicates: dup.filter(Boolean).length,
      matchedByHand: dup.filter((d) => d === 'loose').length,
      unreadable: parsed.unreadable,
    });
  }

  const count = (pred) => rows.filter(pred).length;
  return {
    files: fileInfo,
    rows,
    counts: {
      toImport: count((r) => r.status !== 'duplicate'),
      auto: count((r) => r.status === 'auto'),
      check: count((r) => r.status === 'review' || r.status === 'suggested'),
      duplicates: count((r) => r.status === 'duplicate'),
      matchedByHand: count((r) => r.duplicateOf === 'loose'),
      internal: count((r) => r.status !== 'duplicate' && r.kind === 'internal'),
    },
  };
}

// choices: { [groupKey]: { kind, category } } for the rows you decided about.
// Rows you did not decide keep their suggestion, or become "unsure" if there was none.
// Returns the new transactions and the shop rules to remember.
export function commitImport(plan, choices, settings, { tag = '' } = {}) {
  const merchantRules = { ...settings.merchantRules };
  const transactions = [];

  for (const row of plan.rows) {
    if (row.status === 'duplicate') continue;
    let { kind, category } = row;
    if (row.status === 'review' || row.status === 'suggested') {
      const choice = choices[row.group];
      if (choice) ({ kind, category = '' } = choice);
    }
    transactions.push({
      id: makeId(),
      date: row.date,
      desc: row.desc,
      amount: row.amount,
      direction: row.direction,
      kind,
      category: category ?? '',
      account: row.account,
      ...(tag ? { tag } : {}),
      source: 'csv',
      ...(row.ref ? { ref: row.ref } : {}),
    });
  }

  for (const [group, choice] of Object.entries(choices)) {
    if (!choice || choice.kind === 'unsure') continue;
    const [direction, ...rest] = group.split('|');
    const key = rest.join('|');
    if (!key) continue;
    merchantRules[direction === 'in' ? `in:${key}` : key] = { kind: choice.kind, category: choice.category ?? '' };
  }
  return { transactions, merchantRules };
}
