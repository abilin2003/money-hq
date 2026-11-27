// Turns dropped bank files into an import plan. Nothing is saved here; the import screen saves it.
//
// Every statement line ends up as exactly one of:
//   duplicate  - already in Money HQ (same bank line imported before, from this or an overlapping file): skipped
//   link       - clearly the same payment as one entry you recorded yourself: the bank's version is attached to
//                your entry (kept separately in `bank`), your entry is marked verified, nothing new is added and
//                nothing is counted twice. Your description, category, notes, splits and funds are not touched.
//   match      - might be one of your entries, but not certainly (several candidates, or a different amount):
//                added as pending, in the Review inbox, with the possible match to confirm or reject
//   ready      - new, with a confident suggestion: added as pending, in the inbox, approved in one tap
//   info       - new, and Money HQ isn't sure what it is: added as pending, in the inbox, asking
// Nothing new is ever approved without you. Pending lines aren't counted in any totals.
import { parseBankFile } from './parse.js';
import { classify, groupKeyOf } from './classify.js';
import { addFingerprints } from '../fingerprint.js';
import { dayDiff, addDays } from '../dates.js';
import { merchantKey, normKey } from '../text.js';

// Entries that didn't come from a bank file (typed by hand, your own list, the old dashboard).
export const isLoose = (t) => !String(t.source || '').startsWith('import:');
// A card payment can reach the statement a few days after you made it, never before (one day of slack for
// time zones and late-night purchases).
export const SETTLE_BEFORE = 1;
export const SETTLE_AFTER = 4;
const inWindow = (typedDate, bankDate) => { const d = dayDiff(typedDate, bankDate); return d >= -SETTLE_BEFORE && d <= SETTLE_AFTER; };
// "Might be the same payment typed slightly differently": a few pounds or 5%, whichever is more.
const CLOSE_PENCE = 500;
const closeEnough = (a, b) => a !== b && Math.sign(a) === Math.sign(b) && Math.abs(a - b) <= Math.max(CLOSE_PENCE, Math.round(Math.abs(b) * 0.05));
const shopKey = (s) => merchantKey(s) || normKey(s);
const pounds = (p) => `£${(Math.abs(p) / 100).toFixed(2)}`;

export const NOT_ON_STATEMENT = 'Not on your statement for these dates. Was it right?';

// The bank's own record of a line, kept unchanged for auditing.
export const bankRecord = (r, file, now = new Date().toISOString()) => ({
  description: r.bankText || r.raw_description, date: r.date, amount_pence: r.amount_pence, account: r.account,
  ref: r.ref || null, fingerprint: r.fingerprint, file, imported_at: now,
});

// files: [{ name, text }]
// existing: [{ id, account, date, amount_pence, raw_description, fingerprint, source, archived, status, bank }]
export function buildImportPlan(files, rules, existing = []) {
  const fileInfo = [];
  const rows = [];
  const links = []; // { id, row } your entry + the statement line that verifies it
  const checks = []; // { id, kind: 'missing', review } your entries the statement doesn't have
  const ranges = [];
  const live = existing.filter((t) => !t.archived);
  // Everything already known about bank lines: fingerprints of imported rows and of statement lines already
  // linked to your entries, and bank references (e.g. Revolut transaction ids).
  const knownPrints = new Set([...existing.map((t) => t.fingerprint), ...existing.map((t) => t.bank?.fingerprint).filter(Boolean)]);
  const knownRefs = new Set(existing.flatMap((t) => [t.bank?.ref, t.ref]).filter(Boolean));
  const yours = live.filter((t) => isLoose(t) && !t.bank).map((t) => ({ ...t })); // your entries not yet verified (copies: marked as used below)
  const imported = live.filter((t) => !isLoose(t));

  for (const file of files) {
    let parsed;
    try { parsed = parseBankFile(file.text); } catch (err) { fileInfo.push({ name: file.name, error: err.message }); continue; }
    const withPrints = addFingerprints(parsed.rows);
    for (const r of withPrints) {
      const c = classify(r, rules);
      let duplicate = null;
      if (knownPrints.has(r.fingerprint) || (r.ref && knownRefs.has(r.ref))) duplicate = 'already imported';
      // The same bank line from a different kind of export (e.g. a Revolut statement after the app export):
      // same account, amount and shop, a day apart at most.
      else if (imported.some((t) => t.account === r.account && t.amount_pence === r.amount_pence && Math.abs(dayDiff(t.date, r.date)) <= 1 && shopKey(t.raw_description) === shopKey(r.raw_description))) duplicate = 'already imported (another file)';
      if (!duplicate) { knownPrints.add(r.fingerprint); if (r.ref) knownRefs.add(r.ref); }
      rows.push({ ...r, ...c, suggested: c.status, duplicate, file: file.name, group: groupKeyOf(r) });
    }
    const dates = parsed.rows.map((r) => r.date).sort();
    fileInfo.push({ name: file.name, bank: parsed.bank, account: parsed.account, rows: parsed.rows.length, from: dates[0] || '', to: dates[dates.length - 1] || '', skipped: parsed.skipped, unreadable: parsed.unreadable });
    // Only a bank's own file can say what's missing (your own list is typed entries too).
    if (parsed.bank !== 'list' && withPrints[0] && dates.length) ranges.push({ account: withPrints[0].account, from: dates[0], to: addDays(dates[dates.length - 1], -3) });
  }

  // ---- your entries: link only when it's unambiguous
  const fresh = () => rows.filter((r) => !r.duplicate && !r.linkTo);
  const candidatesFor = (r) => yours.filter((t) => !t.linked && t.account === r.account && t.amount_pence === r.amount_pence && inWindow(t.date, r.date));
  for (const r of fresh()) {
    const cands = candidatesFor(r);
    if (!cands.length) continue;
    // Unambiguous: one entry of yours fits this line, and no other line in these files fits that entry.
    const rivals = fresh().filter((o) => o !== r && o.account === r.account && o.amount_pence === r.amount_pence && cands.some((t) => inWindow(t.date, o.date)));
    if (cands.length === 1 && !rivals.length) {
      const t = cands[0];
      t.linked = true;
      r.linkTo = t.id;
      r.duplicate = 'matches an entry you recorded';
      links.push({ id: t.id, row: r, why: `same account and amount${t.date === r.date ? ', same day' : `, ${Math.abs(dayDiff(t.date, r.date))} day${Math.abs(dayDiff(t.date, r.date)) === 1 ? '' : 's'} apart`}` });
    } else {
      r.review = { group: 'match', match_ids: cands.map((t) => t.id), reason: cands.length > 1 ? `${cands.length} of your entries could be this one (same account and amount). Which is it, or is it new?` : 'Another line in this statement could be the same payment. Is it this one, or new?' };
    }
  }
  // Close but not equal amounts: possibly the same payment typed slightly differently. Never merged on its own.
  for (const r of fresh().filter((x) => !x.review)) {
    const near = yours.filter((t) => !t.linked && t.account === r.account && closeEnough(t.amount_pence, r.amount_pence) && inWindow(t.date, r.date));
    if (near.length) r.review = { group: 'match', match_ids: near.map((t) => t.id), reason: near.length === 1 ? `You recorded ${pounds(near[0].amount_pence)} on ${near[0].date}; the statement says ${pounds(r.amount_pence)}. The same payment?` : `${near.length} of your entries are close to this amount. Is one of them this payment?` };
  }

  // ---- your entries the statement doesn't have (in the dates it covers, apart from its last 3 days)
  for (const t of yours) {
    if (t.linked || t.status === 'needs_review') continue;
    if (rows.some((r) => r.review?.match_ids?.includes(t.id))) continue;
    if (!ranges.some((g) => g.account === t.account && t.date >= g.from && t.date <= g.to)) continue;
    checks.push({ id: t.id, kind: 'missing', review: { group: 'info', reason: NOT_ON_STATEMENT } });
  }

  // ---- everything new: pending, with Money HQ's suggestion filled in
  pairTransfers(fresh());
  for (const r of fresh()) {
    if (!r.review) r.review = r.status === 'reviewed' ? { group: 'ready', reason: r.reason || 'suggested' } : { group: 'info', reason: r.reason || 'Money HQ isn’t sure what this is' };
    r.status = 'needs_review'; // never approved without you
  }
  const added = fresh();
  for (const f of fileInfo) if (!f.error) f.duplicates = rows.filter((r) => r.file === f.name && r.duplicate && !r.linkTo).length;
  return {
    files: fileInfo,
    rows,
    links,
    checks,
    counts: {
      new: added.length,
      linked: links.length,
      duplicates: rows.filter((r) => r.duplicate && !r.linkTo).length,
      ready: added.filter((r) => r.review.group === 'ready').length,
      possibleMatch: added.filter((r) => r.review.group === 'match').length,
      needsInfo: added.filter((r) => r.review.group === 'info').length,
      transfers: added.filter((r) => r.kind === 'transfer').length,
      notOnStatement: checks.length,
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
