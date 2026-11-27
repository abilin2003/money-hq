// Statement coverage: for each account, how far your imported statements reach and what's still to check.
// Pure, so it's tested. A statement file is only known to contain its first to last transaction; Money HQ never
// assumes it covers every day in between unless the bank's export states its period (period_from/period_to).
import { isLoose } from './import/plan.js';

const max = (list) => list.filter(Boolean).sort().pop() || null;
const min = (list) => list.filter(Boolean).sort()[0] || null;

// accounts: [{ id, name, type }]; batches: [{ id, imported_at, details: { files: [{ account, from, to, period_from, period_to }] } }]
// txs: live lines [{ account_id, date, source, status, bank, archived }]
export function accountCoverage(accounts, batches, txs) {
  return accounts.map((a) => {
    const files = batches.flatMap((b) => (b.details?.files || []).filter((f) => f.account === a.name && !f.error).map((f) => ({ ...f, imported_at: b.imported_at })));
    const mine = txs.filter((t) => t.account_id === a.id && !t.archived);
    const importedTo = max([...files.map((f) => f.period_to || f.to), ...mine.filter((t) => t.bank?.date).map((t) => t.bank.date)]);
    const importedFrom = min(files.map((f) => f.period_from || f.from));
    const typed = mine.filter((t) => isLoose(t));
    const latestManual = max(typed.map((t) => t.date));
    // Your own entries no statement has checked yet: after the latest imported date (or all, if never imported).
    const unchecked = typed.filter((t) => !t.bank && (!importedTo || t.date > importedTo)).length;
    const pending = mine.filter((t) => t.status === 'needs_review').length;
    const lastImport = max(files.map((f) => f.imported_at));
    const periodKnown = files.some((f) => f.period_to);
    const status = !files.length && !importedTo ? (typed.length ? 'never imported' : 'no activity')
      : pending ? `${pending} to review`
        : unchecked ? `${unchecked} of your entries since ${importedTo} not on a statement yet`
          : 'reconciled';
    return { id: a.id, name: a.name, type: a.type, lastImport, importedFrom, importedTo, periodKnown, latestManual, unchecked, pending, status };
  }).filter((r) => r.status !== 'no activity');
}

// One import's results, now: what it matched, added, and what has happened to the added lines since.
// txs: live lines with import_batch_id and bank.batch_id.
export function batchSummary(batch, txs) {
  const added = txs.filter((t) => t.import_batch_id === batch.id);
  const counts = batch.details?.counts || {};
  return {
    matched: txs.filter((t) => t.bank?.batch_id === batch.id && t.import_batch_id !== batch.id).length,
    added: added.length,
    pending: added.filter((t) => t.status === 'needs_review').length,
    approved: added.filter((t) => t.status === 'reviewed').length,
    uncertain: counts.possibleMatch || 0,
    duplicates: batch.duplicate_count || 0,
    rows: batch.row_count || 0,
  };
}
