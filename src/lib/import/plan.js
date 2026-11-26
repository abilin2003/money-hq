// Turns dropped files into an import plan: what's new, what's a duplicate, what needs a look.
// Nothing is saved here; the import screen saves the plan's new rows.
import { parseBankFile } from './parse.js';
import { classify, groupKeyOf } from './classify.js';
import { addFingerprints } from '../fingerprint.js';
import { dayDiff, addDays } from '../dates.js';

// Entries that didn't come from a bank file (your own list, the old dashboard, typed by hand) have looser
// wording, so they're matched by account, amount and a date within 3 days instead of by fingerprint.
const isLoose = (t) => !String(t.source || '').startsWith('import:');

// files: [{ name, text }]
// existing: [{ id, account, date, amount_pence, fingerprint, source, archived }] already in Supabase.
// Statements check what you typed. A typed entry within a day or two and a few pounds of a statement line is
// the same payment typed slightly differently: the statement's amount and date are used, and the entry goes to
// the inbox so you can see what changed. A typed entry the statement doesn't have (in the dates it covers, apart
// from its last 3 days, which may not have gone through yet) also goes to the inbox, as a question.
const CLOSE_PENCE = 500;
const closeEnough = (a, b) => Math.sign(a) === Math.sign(b) && Math.abs(a - b) <= Math.max(CLOSE_PENCE, Math.round(Math.abs(b) * 0.05));
export const CHECK_NOT_ON = 'Question: this isn’t on your statement. Was it right?';
const withNote = (note, add) => (note && note.includes(add) ? note : note ? `${add} (${note})` : add);

export function buildImportPlan(files, rules, existing = []) {
  const fileInfo = [];
  const rows = [];
  const checks = [];
  const ranges = [];
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
    // Only a bank's own file can check what you typed (your own list is typed entries too).
    if (parsed.bank !== 'list' && withPrints[0] && dates.length) ranges.push({ account: withPrints[0].account, from: dates[0], to: addDays(dates[dates.length - 1], -3) });
    fileInfo.push({ name: file.name, bank: parsed.bank, account: parsed.account, rows: parsed.rows.length, from: dates[0] || '', to: dates[dates.length - 1] || '', duplicates, skipped: parsed.skipped, unreadable: parsed.unreadable });
  }

  // After every exact match: a statement line close to a typed entry (a few pounds, up to 3 days) corrects it.
  for (const r of rows) {
    if (r.duplicate || !ranges.some((g) => g.account === r.account)) continue;
    const near = loosePool
      .filter((t) => !looseMatched.has(t.id) && t.account === r.account && closeEnough(t.amount_pence, r.amount_pence) && Math.abs(dayDiff(t.date, r.date)) <= 3)
      .sort((a, b) => Math.abs(a.amount_pence - r.amount_pence) - Math.abs(b.amount_pence - r.amount_pence) || Math.abs(dayDiff(a.date, r.date)) - Math.abs(dayDiff(b.date, r.date)))[0];
    if (!near) continue;
    looseMatched.add(near.id);
    r.duplicate = 'corrects an entry you typed';
    const info = fileInfo.find((x) => x.name === r.file);
    if (info) info.duplicates++;
    const said = `You typed £${(Math.abs(near.amount_pence) / 100).toFixed(2)} on ${near.date}; the statement says £${(Math.abs(r.amount_pence) / 100).toFixed(2)} on ${r.date}, so it now says that.`;
    checks.push({ id: near.id, kind: 'corrected', patch: { amount_pence: r.amount_pence, date: r.date, status: 'needs_review', note: withNote(near.note, said) } });
  }
  // Typed entries in the dates a statement covers that it doesn't have: asked about in the inbox.
  for (const t of loosePool) {
    if (looseMatched.has(t.id) || t.status === 'needs_review' || checks.some((c) => c.id === t.id)) continue;
    if (!ranges.some((g) => g.account === t.account && t.date >= g.from && t.date <= g.to)) continue;
    checks.push({ id: t.id, kind: 'missing', patch: { status: 'needs_review', note: withNote(t.note, CHECK_NOT_ON) } });
  }
  pairTransfers(rows.filter((r) => !r.duplicate));
  const fresh = rows.filter((r) => !r.duplicate);
  return {
    files: fileInfo,
    rows,
    checks,
    counts: {
      new: fresh.length,
      duplicates: rows.length - fresh.length,
      needsReview: fresh.filter((r) => r.status === 'needs_review').length,
      sorted: fresh.filter((r) => r.status === 'reviewed').length,
      transfers: fresh.filter((r) => r.kind === 'transfer').length,
      corrected: checks.filter((c) => c.kind === 'corrected').length,
      notOnStatement: checks.filter((c) => c.kind === 'missing').length,
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
