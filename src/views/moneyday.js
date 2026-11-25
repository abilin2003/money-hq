// Money day: a short guided session on or after payday. Import, reconcile, update balances, check IOUs,
// review the cycle that ended (with one change for next time), then plan the new payday.
import { h } from '../ui/dom.js';
import { formatPence, parsePence } from '../lib/money.js';
import { cycleFor, cycleName } from '../lib/cycles.js';
import { summarise, ranked } from '../lib/summary.js';
import { netWorth } from '../lib/analytics.js';
import { head, shortDay, pounds, inCycle, alertLine } from '../ui/parts.js';
import { saveSettings, addSnapshot } from '../lib/data.js';
import { currentCycle, budgetsFor } from './state.js';
import { historyRows } from './history.js';


export function moneydayPage(ctx, rerender) {
  const cur = currentCycle(ctx);
  const last = cycleFor(addDaysIso(cur.start, -1), ctx.ref.settings?.paydays || [], ctx.ref.settings?.payday_usual_day || 24);
  last.name = cycleName(last);
  const extra = ctx.ref.settings?.extra || {};
  const ticks = new Set(extra.moneyday?.[cur.start] || []);
  const tick = async (id, el) => {
    const next = ticks.has(id) ? [...ticks].filter((x) => x !== id) : [...ticks, id];
    try { ctx.ref.settings = await saveSettings(ctx.ref.settings, { extra: { moneyday: { ...(extra.moneyday || {}), [cur.start]: next } } }); rerender(); } catch (err) { alertLine(el, err.message); }
  };

  // ---- facts for each step
  const lastImport = ctx.transactions.filter((t) => String(t.source || '').startsWith('import:')).map((t) => t.date).sort().pop();
  const nw = netWorth(ctx.ref.accounts, ctx.ref.snapshots, ctx.today);
  const stale = nw.rows.filter((r) => r.stale).length;
  const openIous = (ctx.ref.splits || []).filter((s) => !s.settled_by_transaction_id).length;
  const lastRows = historyRows(ctx.all).filter((t) => inCycle(t, last));
  const s = summarise(lastRows, ctx.splitMap, ctx.settled);
  const { budgets } = budgetsFor(ctx, last);
  const reviews = extra.reviews || {};
  const prevReview = Object.keys(reviews).filter((k) => k < last.start).sort().pop();

  // ---- reconcile: type each imported account's statement closing balance and see any gap
  const reconcile = ctx.ref.accounts.filter((a) => ['current', 'credit_card'].includes(a.type)).map((a) => {
    const snaps = ctx.ref.snapshots.filter((x) => x.account_id === a.id);
    const prev = snaps[snaps.length - 1];
    const moved = prev ? ctx.transactions.filter((t) => t.account === a.name && t.date > prev.date).reduce((acc, t) => acc + t.amount_pence, 0) : null;
    const expected = prev ? (a.type === 'credit_card' ? prev.balance_pence - moved : prev.balance_pence + moved) : null;
    const input = h('input', { class: 'input money', inputmode: 'decimal', placeholder: 'Statement balance', 'aria-label': `${a.name} statement closing balance` });
    const btn = h('button', { class: 'btn', type: 'button', onclick: async () => {
      const p = parsePence(input.value);
      if (p === null) { alertLine(btn, 'Type the closing balance.'); return; }
      try { const snap = await addSnapshot(a.id, ctx.today, Math.abs(p)); ctx.ref.snapshots = [...ctx.ref.snapshots.filter((x) => x.id !== snap.id), snap].sort((x, y) => x.date.localeCompare(y.date)); ctx.lastRecon = { ...(ctx.lastRecon || {}), [a.id]: expected === null ? null : Math.abs(p) - expected }; rerender(); } catch (err) { alertLine(btn, err.message); }
    } }, 'Check');
    const gap = ctx.lastRecon?.[a.id];
    return h('div', { class: 'acctrow' },
      h('span', null, a.name, h('br'), h('span', { class: 'muted small' }, prev ? `Last balance ${formatPence(prev.balance_pence)} on ${shortDay(prev.date)}${expected !== null ? `; expected now ${formatPence(expected)}` : ''}` : 'No earlier balance: this one becomes the starting point')),
      h('span', { class: `r small ${gap ? 'over' : 'muted'}` }, gap === undefined ? '' : gap === null ? 'Saved' : gap === 0 ? 'Matches' : `Gap ${gap > 0 ? '+' : '−'}${formatPence(Math.abs(gap))}`),
      h('div', { class: 'edit-grid' }, input, btn));
  });

  // ---- cycle review
  const change = h('textarea', { class: 'input', rows: 2, placeholder: 'One change for next cycle, e.g. “Cap takeaways at £60”', 'aria-label': 'One change for next cycle' }, reviews[last.start]?.change || '');
  const saveReview = h('button', { class: 'btn primary', type: 'button', onclick: async () => {
    try { ctx.ref.settings = await saveSettings(ctx.ref.settings, { extra: { reviews: { ...reviews, [last.start]: { change: change.value.trim(), saved: ctx.today } } } }); await tick('review', saveReview); } catch (err) { alertLine(saveReview, err.message); }
  } }, 'Save my review');
  const overUnder = ctx.ref.buckets.filter((b) => budgets[b.name]).map((b) => {
    const spent = s.byBucket[b.name] || 0; const budget = budgets[b.name];
    return h('div', { class: 'billrow' }, h('span', { class: 'muted small' }, spent > budget ? 'Over' : 'Under'), h('span', null, b.name), h('span', { class: `r ${spent > budget ? 'over' : ''}` }, `${pounds(Math.abs(budget - spent))} ${spent > budget ? 'over' : 'under'}`));
  });
  const budgetTotal = Object.values(budgets).reduce((a, v) => a + v, 0);
  const review = h('div', null,
    prevReview && reviews[prevReview]?.change ? h('p', { class: 'notice' }, `Last time you decided: “${reviews[prevReview].change}”`) : null,
    h('div', { class: 'keynums' },
      h('div', null, h('span', { class: 'muted small' }, 'Spent'), h('span', { class: 'display' }, pounds(s.netSpent))),
      h('div', null, h('span', { class: 'muted small' }, 'Invested and saved'), h('span', { class: 'display' }, pounds(s.invested + s.saved))),
      h('div', null, h('span', { class: 'muted small' }, budgetTotal ? (s.netSpent > budgetTotal ? 'Over budget' : 'Under budget') : 'Biggest bucket'), h('span', { class: `display ${budgetTotal && s.netSpent > budgetTotal ? 'over' : ''}` }, budgetTotal ? pounds(Math.abs(budgetTotal - s.netSpent)) : (ranked(s.byBucket)[0]?.[0] || '–')))),
    overUnder,
    h('label', { class: 'field', style: { marginTop: '12px' } }, 'One change for next cycle', change),
    h('div', { class: 'chips' }, saveReview, h('a', { href: '#overview', class: 'btn tap' }, `See the ${last.name} cycle`)));

  const step = (id, title, body, auto, ...content) => {
    const done = auto ?? ticks.has(id);
    return h('section', { class: `card step ${done ? 'done' : ''}`, 'aria-label': title },
      h('div', { class: 'ch' }, h('h2', null, h('span', { class: 'stepdot', 'aria-hidden': 'true' }, done ? '✓' : ''), title),
        auto === undefined ? h('button', { class: 'linkbtn', type: 'button', onclick: (e) => tick(id, e.currentTarget) }, ticks.has(id) ? 'Mark not done' : 'Mark done') : null),
      h('p', { class: 'muted small', style: { marginTop: 0 } }, body), ...content);
  };

  return h('div', { class: 'page' },
    head('Money day', `${cur.name} cycle, paid ${shortDay(cur.start)}. About 20 minutes; do it on or after payday.`),
    step('import', '1. Import your statements', lastImport ? `Last imported line: ${shortDay(lastImport)}.` : 'Bring in your Ulster, Revolut and Monzo files.', undefined, h('a', { href: '#import', class: 'btn primary tap' }, 'Import statements'),
      ctx.inboxCount ? h('a', { href: '#inbox', class: 'btn tap', style: { marginLeft: '8px' } }, `Review ${ctx.inboxCount} line${ctx.inboxCount === 1 ? '' : 's'}`) : null),
    step('reconcile', '2. Reconcile', 'Type each statement’s closing balance. A gap means a line is missing or doubled.', undefined, reconcile),
    step('balances', '3. Update your balances', stale ? `${stale} balance${stale === 1 ? '' : 's'} older than 35 days (Monzo, ISAs, pension…).` : 'All balances are up to date.', stale === 0 ? true : undefined, h('a', { href: '#wealth', class: 'btn tap' }, 'Update balances'), h('a', { href: '#plan', class: 'btn tap', style: { marginLeft: '8px' } }, 'Sinking fund balances')),
    step('ious', '4. Check your IOUs', openIous ? `${openIous} still open.` : 'Nobody owes you anything.', openIous === 0 ? true : undefined, openIous ? h('a', { href: '#people', class: 'btn tap' }, 'See who owes you') : null),
    step('review', `5. Review the ${last.name} cycle`, `${shortDay(last.start)} to ${shortDay(last.end)}: what went well, what to change.`, undefined, review),
    step('plan', '6. Plan this payday', 'Give every pound of this pay a job and set this cycle’s budgets.', undefined, h('a', { href: '#plan', class: 'btn primary tap' }, 'Open payday plan')));
}

function addDaysIso(iso, n) { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
