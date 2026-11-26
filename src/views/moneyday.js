// Money day: the guided monthly routine, on or after payday. Seven steps:
//   1 import statements · 2 reconcile balances · 3 review last cycle's spending · 4 update savings and wealth
//   5 check IOUs · 6 plan this payday (the Payday plan) · 7 confirm the plan's transfers went through
// Steps tick themselves when Money HQ can see they're done; the rest you tick. Step 7 shows each plan line as
// planned, completed (seen in your bank lines) or verified (you confirmed it) separately.
import { h } from '../ui/dom.js';
import { formatPence, parsePence } from '../lib/money.js';
import { cycleFor, cycleName } from '../lib/cycles.js';
import { addDays } from '../lib/dates.js';
import { summarise, ranked } from '../lib/summary.js';
import { netWorth } from '../lib/analytics.js';
import { matchPlanLines } from '../lib/planning.js';
import { head, shortDay, pounds, inCycle, alertLine } from '../ui/parts.js';
import { saveSettings, addSnapshot } from '../lib/data.js';
import { currentCycle, budgetsFor, paydaysOf, usualDay } from './state.js';
import { historyRows } from './history.js';
import { stateHref } from './explorer.js';
import { PLAN_KINDS } from './plan.js';

const kindName = (k) => Object.fromEntries(PLAN_KINDS)[k] || k; // looked up when used: plan.js and this file import each other
export const STATE_LABEL = { planned: 'Planned', completed: 'Completed', verified: 'Verified', stays: 'Stays put' };

// The plan's lines for a cycle with their state, and counts of each.
export function planProgress(ctx, cycle) {
  const plan = ctx.ref.settings?.extra?.plans?.[cycle.start];
  const lines = plan ? matchPlanLines(plan.items || [], ctx.transactions, cycle, ctx.today) : [];
  const moving = lines.filter((l) => l.state !== 'stays');
  return { plan, lines, counts: { planned: moving.filter((l) => l.state === 'planned').length, completed: moving.filter((l) => l.state === 'completed').length, verified: moving.filter((l) => l.state === 'verified').length, total: moving.length } };
}
export const stateBadge = (l) => h('span', { class: `ktag k-${l.state === 'verified' ? 'verified' : l.state === 'completed' ? 'actual' : l.state === 'planned' ? 'planned' : 'stale'}` }, STATE_LABEL[l.state]);

export function moneydayPage(ctx, rerender) {
  const cur = currentCycle(ctx);
  const last = cycleFor(addDays(cur.start, -1), paydaysOf(ctx), usualDay(ctx));
  last.name = cycleName(last);
  const extra = ctx.ref.settings?.extra || {};
  const ticks = new Set(extra.moneyday?.[cur.start] || []);
  const save = async (patch, el) => { try { ctx.ref.settings = await saveSettings(ctx.ref.settings, { extra: patch }); rerender(); } catch (err) { alertLine(el, err.message); } };
  const tick = (id, el) => save({ moneyday: { ...(extra.moneyday || {}), [cur.start]: ticks.has(id) ? [...ticks].filter((x) => x !== id) : [...ticks, id] } }, el);

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
  const prog = planProgress(ctx, cur);

  // ---- 2. reconcile: type each imported account's statement closing balance and see any gap
  const reconcile = ctx.ref.accounts.filter((a) => ['current', 'credit_card'].includes(a.type) && a.is_active !== false).map((a) => {
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

  // ---- 3. review last cycle's spending
  const change = h('textarea', { class: 'input', rows: 2, placeholder: 'One change for next cycle, e.g. “Cap takeaways at £60”', 'aria-label': 'One change for next cycle' }, reviews[last.start]?.change || '');
  const saveReview = h('button', { class: 'btn primary', type: 'button', onclick: (e) => save({ reviews: { ...reviews, [last.start]: { change: change.value.trim(), saved: ctx.today } } }, e.currentTarget) }, reviews[last.start] ? 'Update my review' : 'Save my review');
  const overUnder = ctx.ref.buckets.filter((b) => budgets[b.name]).map((b) => {
    const spent = s.byBucket[b.name] || 0; const budget = budgets[b.name];
    return h('div', { class: 'billrow' }, h('span', { class: 'muted small' }, spent > budget ? 'Over' : 'Under'), h('span', null, b.name), h('span', { class: `r ${spent > budget ? 'over' : ''}` }, `${pounds(Math.abs(budget - spent))} ${spent > budget ? 'over' : 'under'}`));
  });
  const budgetTotal = Object.values(budgets).reduce((a, v) => a + v, 0);
  const lastSel = { kind: 'cycle', start: last.start };
  const review = h('div', null,
    prevReview && reviews[prevReview]?.change ? h('p', { class: 'notice' }, `Last time you decided: “${reviews[prevReview].change}”`) : null,
    h('div', { class: 'keynums' },
      h('div', null, h('span', { class: 'muted small' }, 'Spent'), h('span', { class: 'display' }, pounds(s.totalSpent))),
      h('div', null, h('span', { class: 'muted small' }, 'Invested and saved'), h('span', { class: 'display' }, pounds(s.invested + s.saved))),
      h('div', null, h('span', { class: 'muted small' }, budgetTotal ? (s.netSpent > budgetTotal ? 'Over budget' : 'Under budget') : 'Biggest bucket'), h('span', { class: `display ${budgetTotal && s.netSpent > budgetTotal ? 'over' : ''}` }, budgetTotal ? pounds(Math.abs(budgetTotal - s.netSpent)) : (ranked(s.byBucket)[0]?.[0] || '–')))),
    overUnder,
    h('div', { class: 'chips' }, h('a', { href: stateHref('spending', lastSel), class: 'btn tap' }, 'Analyse it'), h('a', { href: stateHref('insights', lastSel), class: 'btn tap' }, 'Insights'), h('a', { href: stateHref('compare', lastSel, {}, null, { b: `c.${last.start}` }), class: 'btn tap' }, 'Compare with the cycle before')),
    h('label', { class: 'field', style: { marginTop: '12px' } }, 'One change for next cycle', change),
    h('div', { class: 'chips' }, saveReview));

  // ---- 7. confirm the plan's transfers
  const setVerified = (i, on, el) => {
    const plans = { ...(extra.plans || {}) };
    const items = (plans[cur.start].items || []).map((it, k) => (k === i ? (on ? { ...it, verified: ctx.today } : (({ verified, ...rest }) => rest)(it)) : it));
    plans[cur.start] = { ...plans[cur.start], items };
    return save({ plans }, el);
  };
  const confirm = prog.plan ? h('div', null,
    h('div', { class: 'tiles three', style: { marginBottom: '12px' } },
      ['planned', 'completed', 'verified'].map((k) => h('div', { class: 'card tile' }, h('span', { class: 'muted small' }, STATE_LABEL[k]), h('span', { class: 'tile-v display' }, String(prog.counts[k])),
        h('span', { class: 'muted small' }, pounds(prog.lines.filter((l) => l.state === k).reduce((a, l) => a + (l.amount_pence || 0), 0)))))),
    prog.lines.map((l, i) => h('div', { class: 'planline' },
      h('span', null, h('span', { style: { fontWeight: 500 } }, l.name || kindName(l.kind)), stateBadge(l), h('br'),
        h('span', { class: 'muted small' }, `${kindName(l.kind)} · ${formatPence(l.amount_pence || 0)}`, l.tx ? ` · seen ${shortDay(l.tx.date)} (${l.tx.raw_description})` : l.state === 'planned' ? ' · not in your bank lines yet' : '', l.verified ? ` · confirmed ${shortDay(l.verified)}` : '')),
      l.state === 'stays' ? h('span') : h('button', { class: `btn ${l.state === 'verified' ? '' : 'primary'}`, type: 'button', onclick: (e) => setVerified(i, l.state !== 'verified', e.currentTarget) }, l.state === 'verified' ? 'Undo' : 'Confirm'))),
    h('p', { class: 'muted small' }, 'Completed means a matching payment (same kind and amount, money going out) is in your imported lines this cycle. Confirm a line once you’ve checked the money reached the account or pot it was meant for.'))
    : h('p', { class: 'muted', style: { margin: 0 } }, 'Make this payday’s plan first (step 6).');

  const step = (id, n, title, body, auto, ...content) => {
    const done = auto ?? ticks.has(id);
    return { done, el: h('section', { class: `card step ${done ? 'done' : ''}`, 'aria-label': title, id: `md-${id}` },
      h('div', { class: 'ch' }, h('h2', null, h('span', { class: 'stepdot', 'aria-hidden': 'true' }, done ? '✓' : n), title),
        auto === undefined ? h('button', { class: 'linkbtn', type: 'button', onclick: (e) => tick(id, e.currentTarget) }, ticks.has(id) ? 'Mark not done' : 'Mark done') : h('span', { class: 'muted small' }, done ? 'Done' : '')),
      h('p', { class: 'muted small', style: { marginTop: 0 } }, body), ...content) };
  };
  const steps = [
    step('import', 1, 'Import your statements', lastImport ? `Last imported line: ${shortDay(lastImport)}.${lastImport >= cur.start ? ' Up to date since payday.' : ''}` : 'Bring in your Ulster, Revolut and Monzo files.', lastImport && lastImport >= cur.start ? true : undefined,
      h('a', { href: '#import', class: 'btn primary tap' }, 'Import statements'), ctx.inboxCount ? h('a', { href: '#inbox', class: 'btn tap', style: { marginLeft: '8px' } }, `Review ${ctx.inboxCount} line${ctx.inboxCount === 1 ? '' : 's'}`) : null),
    step('reconcile', 2, 'Reconcile your account balances', 'Type each statement’s closing balance. A gap means a line is missing or doubled.', undefined, reconcile),
    step('review', 3, `Review the ${last.name} cycle`, `${shortDay(last.start)} to ${shortDay(last.end)}: what went well, and one thing to change.`, reviews[last.start] ? true : undefined, review),
    step('balances', 4, 'Update your savings and wealth', stale ? `${stale} balance${stale === 1 ? '' : 's'} older than 35 days (Monzo, ISAs, pension…). Update them all in one go on Wealth, and your sinking funds on the Payday plan.` : 'All balances are up to date.', stale === 0 ? true : undefined,
      h('a', { href: '#wealth', class: 'btn tap' }, 'Update balances'), h('a', { href: '#plan', class: 'btn tap', style: { marginLeft: '8px' } }, 'Sinking funds')),
    step('ious', 5, 'Check outstanding IOUs', openIous ? `${openIous} still open.` : 'Nobody owes you anything.', openIous === 0 ? true : undefined, openIous ? h('a', { href: '#people', class: 'btn tap' }, 'See who owes you') : null),
    step('plan', 6, 'Plan this payday', prog.plan ? `Saved: ${prog.counts.total} line${prog.counts.total === 1 ? '' : 's'} to move, plus your bucket budgets.` : 'Give every pound of this pay a job and set this cycle’s budgets.', prog.plan ? true : undefined,
      h('a', { href: '#plan', class: 'btn primary tap' }, prog.plan ? 'Open payday plan' : 'Make the plan')),
    step('confirm', 7, 'Confirm your allocations', prog.plan ? `${prog.counts.verified} of ${prog.counts.total} confirmed · ${prog.counts.completed} seen in your bank, waiting for you · ${prog.counts.planned} not seen yet.` : 'After the plan, check each transfer went through.', prog.plan && prog.counts.total && prog.counts.verified === prog.counts.total ? true : undefined, confirm),
  ];
  const doneCount = steps.filter((x) => x.done).length;

  return h('div', { class: 'page' },
    head('Money day', `${cur.name} cycle, paid ${shortDay(cur.start)}. ${doneCount} of 7 steps done. About 20 minutes; do it on or after payday.`),
    h('div', { class: 'md-progress', role: 'img', 'aria-label': `${doneCount} of 7 steps done` }, steps.map((x, i) => h('a', { href: `#moneyday`, class: x.done ? 'done' : '', onclick: (e) => { e.preventDefault(); document.querySelector(`#md-${['import', 'reconcile', 'review', 'balances', 'ious', 'plan', 'confirm'][i]}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }, String(i + 1)))),
    steps.map((x) => x.el));
}
