// Turns dropped files into an import plan: what's new, what's a duplicate, what needs a look.
// Nothing is saved here; the import screen saves the plan's new rows.
import { parseBankFile } from './parse.js';
import { classify, groupKeyOf } from './classify.js';
import { addFingerprints } from '../fingerprint.js';
import { dayDiff } from '../dates.js';

// Entries that didn't come from a bank file (your own list, the old dashboard, typed by hand) have looser
// wording, so they're matched by account, amount and a date within 3 days instead of by fingerprint.
const isLoose = (t) => !String(t.source || '').startsWith('import:');

// files: [{ name, text }]
// existing: [{ id, account, date, amount_pence, fingerprint, source, archived }] already in Supabase.
export function buildImportPlan(files, rules, existing = []) {
  const fileInfo = [];
  const rows = [];
  const fingerprints = new Set(existing.map((t) => t.fingerprint));
  const looseMatched = new Set();
  const loosePool = existing.filter((t) => !t.archived && isLoose(t));

  for (const file of files) {
    let parsed;
    try {
      parsed = parseBankFile(file.text);
    } catch (err) {
      fileInfo.push({ name: file.name, error: err.message });
      continue;
    }
    const withPrints = addFingerprints(parsed.rows);
    let duplicates = 0;
    for (const r of withPrints) {
      const c = classify(r, rules);
      let duplicate = null;
      if (fingerprints.has(r.fingerprint)) duplicate = 'already imported';
      else {
        // Closest loose match: same account and amount, up to 3 days apart, each existing entry used once.
        const match = loosePool
          .filter((t) => !looseMatched.has(t.id) && t.account === r.account && t.amount_pence === r.amount_pence && Math.abs(dayDiff(t.date, r.date)) <= 3)
          .sort((a, b) => Math.abs(dayDiff(a.date, r.date)) - Math.abs(dayDiff(b.date, r.date)))[0];
        if (match) { looseMatched.add(match.id); duplicate = 'matches an entry you already have'; }
      }
      if (duplicate) duplicates++;
      else fingerprints.add(r.fingerprint);
      rows.push({ ...r, ...c, duplicate, file: file.name, group: groupKeyOf(r) });
    }
    const dates = parsed.rows.map((r) => r.date).sort();
    fileInfo.push({ name: file.name, bank: parsed.bank, account: parsed.account, rows: parsed.rows.length, from: dates[0] || '', to: dates[dates.length - 1] || '', duplicates, skipped: parsed.skipped, unreadable: parsed.unreadable });
  }

  pairTransfers(rows.filter((r) => !r.duplicate));
  const fresh = rows.filter((r) => !r.duplicate);
  return {
    files: fileInfo,
    rows,
    counts: {
      new: fresh.length,
      duplicates: rows.length - fresh.length,
      needsReview: fresh.filter((r) => r.status === 'needs_review').length,
      sorted: fresh.filter((r) => r.status === 'reviewed').length,
      transfers: fresh.filter((r) => r.kind === 'transfer').length,
    },
  };
}

// Transfer pairing (spec 7.5.2): the same amount going out of one of your accounts and into another within
// 3 days. Lines already confidently sorted as spending, income or a payback are never paired, so a friend
// paying you back the same amount you just spent can't hide that spending.
export function pairTransfers(rows) {
  const pairable = (r) => r.kind === 'transfer' || r.status === 'needs_review';
  const outs = rows.filter((r) => r.amount_pence < 0 && pairable(r) && !r.pairWith);
  for (const o of outs) {
    const match = rows
      .filter((i) => i.amount_pence === -o.amount_pence && i.account !== o.account && pairable(i) && !i.pairWith && Math.abs(dayDiff(o.date, i.date)) <= 3)
      .sort((a, b) => Math.abs(dayDiff(o.date, a.date)) - Math.abs(dayDiff(o.date, b.date)))[0];
    if (!match) continue;
    // Trusted when either side was already known to be a move; two unknown lines that happen to match are
    // marked as a transfer but still go to the inbox for a quick yes.
    const trusted = [o, match].some((r) => r.kind === 'transfer' && r.status === 'reviewed');
    for (const [a, b] of [[o, match], [match, o]]) {
      a.pairWith = b;
      a.kind = 'transfer';
      a.category = null;
      a.status = trusted ? 'reviewed' : 'needs_review';
      a.reason = `matched with ${b.amount_pence > 0 ? 'money into' : 'money out of'} ${b.account} on ${b.date}${trusted ? '' : ': a move between your accounts?'}`;
    }
  }
  return rows;
}
