// Payday plan: enter your pay, give every pound a job (transfers, investing, sinking funds, bucket budgets),
// and see what's left to assign. Budgets change each payday, so it starts from last cycle's plan.
import { h } from '../ui/dom.js';
import { formatPence, parsePence } from '../lib/money.js';
import { planTotals, fundNeedPerCycle } from '../lib/budget.js';
import { head, shortDay, alertLine } from '../ui/parts.js';
import { saveSettings, saveBudgets, ensureCycle, saveFund, addSnapshot } from '../lib/data.js';
import { currentCycle, budgetsExact, budgetsFor, paydaysOf, usualDay, cardSpendBefore, fundsOf } from './state.js';
import { cycleFor, cycleName } from '../lib/cycles.js';
import { isIsoDate } from '../lib/dates.js';
import { fundStatus, cardOwed, isCardLine } from '../lib/position.js';
import { kindTag } from './overview.js';
import { payFlow } from '../ui/charts.js';
import { matchPlanLines } from '../lib/planning.js';
import { planProgress, stateBadge } from './moneyday.js';

const KIND_FLOW = { invested: ['Invested', '#5BD6A0'], saved: ['Sinking funds', '#B79CFF'], transfer: ['Card and transfers', '#7AA2FF'], paid: ['One-off payments', '#F472B6'], kept: ['Left in Ulster', '#5F6B7A'] };

export const PLAN_KINDS = [['transfer', 'Transfer (e.g. card repayment)'], ['invested', 'Invested'], ['saved', 'Saved (sinking fund)'], ['paid', 'Paid (one-off)'], ['kept', 'Left in Ulster']];
const money = (p) => (Number.isInteger(p) ? (p / 100).toFixed(2) : '');

// The plan for a cycle, or a copy of the most recent earlier plan (copied: true), or an empty one.
export function planFor(extra, start) {
  const plans = extra?.plans || {};
  if (plans[start]) return { funding: [], ...structuredClone(plans[start]), copied: false };
  const earlier = Object.keys(plans).filter((k) => k < start).sort().pop();
  // Extra money is one-off, and a line confirmed last cycle hasn't been confirmed this time, so neither is copied.
  if (earlier) { const p = structuredClone(plans[earlier]); return { ...p, items: (p.items || []).map(({ verified, ...it }) => it), funding: [], copied: earlier }; }
  return { pay_pence: null, items: [], funding: [], copied: false };
}

export function planPage(ctx, rerender, param) {
  // #plan/<date>: the next payday's plan, opened from an end-of-cycle review before payday comes.
  const now = currentCycle(ctx);
  const ahead = param && isIsoDate(param) && param > now.start ? cycleFor(param, paydaysOf(ctx), usualDay(ctx)) : null;
  const c = ahead ? { ...ahead, name: cycleName(ahead) } : now;
  const draft = ctx.planDraft?.start === c.start ? ctx.planDraft : (ctx.planDraft = { start: c.start, ...planFor(ctx.ref.settings?.extra, c.start), budgets: { ...(Object.keys(budgetsExact(ctx, c)).length ? budgetsExact(ctx, c) : budgetsFor(ctx, c).budgets) }, dirty: false });
  const touch = () => { draft.dirty = true; rerender(); };
  const amountInput = (value, onSet, label) => h('input', { class: 'input money', inputmode: 'decimal', 'aria-label': label, value: money(value), placeholder: '0.00',
    onchange: (e) => { const p = e.target.value.trim() === '' ? null : parsePence(e.target.value); if (p === undefined || (p !== null && (Number.isNaN(p) || p < 0))) { e.target.select(); return; } onSet(p); touch(); } });

  draft.funding = draft.funding || [];
  // The card repayment follows what you spent on the card in the cycle before this payday (see cardSpendIn).
  const { card, spend } = cardSpendBefore(ctx, c);
  for (const it of draft.items) if (isCardLine(it, card) && it.auto !== false && !it.verified) it.amount_pence = spend.pence;
  const t = planTotals(draft.pay_pence || 0, draft.items, Object.fromEntries(Object.entries(draft.budgets).filter(([, v]) => Number.isInteger(v))), draft.funding);

  const states = matchPlanLines(draft.items, ctx.transactions, c, ctx.today);
  const items = draft.items.map((it, i) => h('div', { class: 'planitem' }, h('div', { class: 'planrow' },
    h('input', { class: 'input', 'aria-label': 'What for', value: it.name, onchange: (e) => { it.name = e.target.value; touch(); } }),
    h('select', { class: 'input', 'aria-label': 'Kind', onchange: (e) => { it.kind = e.target.value; touch(); } }, PLAN_KINDS.map(([v, l]) => h('option', { value: v, selected: v === it.kind }, l))),
    amountInput(it.amount_pence, (p) => { it.amount_pence = p || 0; if (isCardLine(it, card)) it.auto = false; }, `${it.name || 'Item'} amount`),
    h('button', { class: 'linkbtn', type: 'button', 'aria-label': `Remove ${it.name}`, onclick: () => { draft.items.splice(i, 1); touch(); } }, 'Remove')),
    it.amount_pence && it.kind !== 'kept' ? h('p', { class: 'muted small planstate' }, stateBadge(states[i]), states[i].tx ? ` Seen in your bank ${shortDay(states[i].tx.date)}: ${states[i].tx.raw_description}` : ' Not in your bank lines yet', states[i].verified ? `, confirmed ${shortDay(states[i].verified)}` : '') : null,
    isCardLine(it, card) ? cardNote(it, card, spend, touch) : null));

  const bucketRows = ctx.ref.buckets.map((b) => h('div', { class: 'planrow bucketrow' },
    h('span', { class: 'bname' }, h('span', { class: 'dot', style: { background: b.colour } }), b.name),
    h('span', { class: 'muted small' }, Number.isInteger(draft.budgets[b.name]) ? 'Budget' : 'No budget (tracked only)'),
    amountInput(draft.budgets[b.name], (p) => { draft.budgets[b.name] = p; }, `${b.name} budget`)));

  const save = h('button', { class: 'btn primary', type: 'button', onclick: async () => {
    save.disabled = true;
    save.textContent = 'Saving…';
    try {
      const row = await ensureCycle(c);
      if (!ctx.ref.cycles.some((x) => x.id === row.id)) ctx.ref.cycles = [...ctx.ref.cycles, row].sort((a, b) => a.start_date.localeCompare(b.start_date));
      const byId = Object.fromEntries(ctx.ref.buckets.map((b) => [b.id, Number.isInteger(draft.budgets[b.name]) ? draft.budgets[b.name] : null]));
      ctx.ref.budgets = await saveBudgets(row.id, byId);
      const plans = { ...(ctx.ref.settings?.extra?.plans || {}), [c.start]: { pay_pence: draft.pay_pence, items: draft.items.filter((i) => i.name || i.amount_pence), funding: draft.funding.filter((f) => f.amount_pence) } };
      ctx.ref.settings = await saveSettings(ctx.ref.settings, { extra: { plans } });
      ctx.planDraft = null;
      rerender();
    } catch (err) { save.disabled = false; save.textContent = 'Save plan'; alertLine(save, err.message); }
  } }, draft.dirty || draft.copied ? 'Save plan' : 'Saved');
  if (!draft.dirty && !draft.copied) save.disabled = true;

  const plansNow = { ...(ctx.ref.settings?.extra?.plans || {}), [c.start]: { items: draft.items } };
  const funds = fundsOf(ctx).map((f) => {
    const need = fundNeedPerCycle(f, ctx.today);
    const fs = fundStatus(f, plansNow, ctx.today);
    return h('div', { class: 'planrow fundrow' },
      h('span', null, h('span', { style: { fontWeight: 500 } }, f.name, kindTag(fs.status)), h('br'),
        h('span', { class: 'muted small' }, fs.verified ? `Verified ${formatPence(fs.verified.pence)} on ${shortDay(fs.verified.date)}` : 'Balance never typed in', fs.plannedThisPayday ? ` · this payday’s plan puts in ${formatPence(fs.plannedThisPayday)}` : '', fs.planned ? ` · expected ${formatPence(fs.expected)} (not checked)` : ''),
        f.mirrors ? [h('br'), h('span', { class: 'muted small' }, `Same money as your ${f.mirrors.name}: its balance on Wealth is this fund’s balance.`)] : null,
        h('br'), h('span', { class: 'muted small' }, `${f.target_pence ? `Target ${formatPence(f.target_pence)}` : 'No target'}${f.due_date ? ` by ${shortDay(f.due_date)}` : ''}${need !== null ? ` · needs ${formatPence(need)} a payday` : ''}`)),
      h('label', { class: 'field' }, 'In it now', h('input', { class: 'input money', inputmode: 'decimal', value: money(f.balance_pence), 'aria-label': `${f.name} balance`, onchange: async (e) => {
        const p = parsePence(e.target.value);
        if (p === null || p < 0) { e.target.select(); return; }
        if (f.mirrors) { // typed here, saved as the account's balance, so the two can't disagree
          const snap = await addSnapshot(f.mirrors.id, ctx.today, p);
          ctx.ref.snapshots = [...(ctx.ref.snapshots || []).filter((s) => s.id !== snap.id && !(s.account_id === snap.account_id && s.date === snap.date)), snap].sort((x, y) => x.date.localeCompare(y.date));
          rerender();
          return;
        }
        const saved = await saveFund({ id: f.id, balance_pence: p, balance_date: ctx.today });
        ctx.ref.funds = ctx.ref.funds.map((x) => (x.id === saved.id ? saved : x));
        // Keep a history of each fund's balance, so goals linked to it can show progress over time.
        const hist = ctx.ref.settings?.extra?.fund_history || {};
        ctx.ref.settings = await saveSettings(ctx.ref.settings, { extra: { fund_history: { ...hist, [f.id]: [...(hist[f.id] || []).filter((x) => x.date !== ctx.today), { date: ctx.today, pence: p }].sort((a, b) => a.date.localeCompare(b.date)) } } });
        rerender();
      } })));
  });
  const newFund = h('input', { class: 'input', placeholder: 'New fund name, e.g. Holiday fund', 'aria-label': 'New sinking fund name' });
  const addFund = h('button', { class: 'btn', type: 'button', onclick: async () => {
    if (!newFund.value.trim()) return;
    const saved = await saveFund({ name: newFund.value.trim(), target_pence: 0, monthly_pence: 0 });
    ctx.ref.funds = [...(ctx.ref.funds || []), saved].sort((a, b) => a.name.localeCompare(b.name));
    rerender();
  } }, 'Add fund');

  const sum = (label, pence, strong) => h('div', { style: strong ? { fontWeight: 600 } : null }, h('span', { class: strong ? '' : 'muted' }, label), h('span', { class: strong && pence < 0 ? 'over' : '' }, `${pence < 0 ? '−' : ''}${formatPence(Math.abs(pence))}`));

  return h('div', { class: 'page' },
    head('Payday plan', `${c.name} cycle, paid ${shortDay(c.start)}. Give every pound a job.`, save),
    moneydayLink(ctx, c),
    draft.copied ? h('section', { class: 'card notice-card' }, h('p', { style: { margin: 0 } }, `Copied from the cycle that started ${shortDay(draft.copied)}. Change what's different this time, then save.`)) : null,
    h('section', { class: 'card', 'aria-labelledby': 'pay' },
      h('h2', { id: 'pay' }, 'Pay'),
      h('div', { class: 'planrow' }, h('span', null, 'Take-home pay this payday'), h('span'), amountInput(draft.pay_pence, (p) => { draft.pay_pence = p; }, 'Pay'))),
    h('section', { class: 'card', 'aria-labelledby': 'out' },
      h('h2', { id: 'out' }, 'Where it goes on payday'),
      draft.items.some((it) => isCardLine(it, card)) ? null : cardHint(ctx),
      items,
      h('button', { class: 'btn', type: 'button', style: { marginTop: '10px' }, onclick: () => { draft.items.push({ name: '', kind: 'saved', amount_pence: 0 }); touch(); } }, 'Add a line')),
    h('section', { class: 'card', 'aria-labelledby': 'bb' },
      h('h2', { id: 'bb' }, 'Bucket budgets for this cycle'),
      h('p', { class: 'muted small', style: { marginTop: 0 } }, 'Leave a bucket empty to track it without a budget (like Fuel). Bills come out of Essentials.'),
      bucketRows),
    h('section', { class: 'card', 'aria-labelledby': 'tot' },
      h('h2', { id: 'tot' }, 'Totals'),
      h('div', { class: 'stats' }, sum('Pay', t.pay),
        draft.funding.map((f, i) => h('div', null, h('span', { class: 'muted' }, `+ ${f.name}`, h('button', { class: 'linkbtn', type: 'button', onclick: () => { draft.funding.splice(i, 1); touch(); } }, 'Remove')), h('span', null, formatPence(f.amount_pence)))),
        sum('Payday lines', -t.items), sum('Bucket budgets', -t.buckets),
        sum(t.unassigned < 0 ? 'Over-assigned: not explained yet' : t.unassigned === 0 && t.extra ? 'Left to assign (reconciled)' : 'Left to assign', t.unassigned, true)),
      t.unassigned < 0 ? reconcile(ctx, draft, -t.unassigned, touch) : null),
    flowCard(draft, t.buckets),
    h('section', { class: 'card', 'aria-labelledby': 'sf' },
      h('h2', { id: 'sf' }, 'Sinking funds'),
      h('p', { class: 'muted small', style: { marginTop: 0 } }, 'Type what’s in each fund on money day (Monzo isn’t imported).'),
      funds.length ? funds : h('p', { class: 'muted' }, 'No sinking funds yet.'),
      h('div', { class: 'planrow', style: { marginTop: '10px' } }, newFund, h('span'), addFund)));
}

// Where your pay goes on payday, drawn from the plan you're editing (moved here from the Overview in Phase 2).
function flowCard(draft, bucketTotal) {
  if (!draft.pay_pence) return null;
  const groups = {};
  for (const it of draft.items || []) { const [n, col] = KIND_FLOW[it.kind] || ['Other', '#5F6B7A']; groups[n] = groups[n] || { name: n, pence: 0, colour: col }; groups[n].pence += it.amount_pence || 0; }
  const flows = [{ name: 'Buckets', pence: bucketTotal, colour: '#F7B955' }, ...Object.values(groups)].filter((x) => x.pence > 0).sort((a, b) => b.pence - a.pence);
  if (!flows.length) return null;
  return h('section', { class: 'card', 'aria-labelledby': 'pf' }, h('h2', { id: 'pf' }, 'Where your pay goes'), payFlow({ total: draft.pay_pence, flows }));
}

// The plan is step 6 of Money day; step 7 confirms its lines went through. A strip linking the two.
function moneydayLink(ctx, c) {
  const { plan, counts } = planProgress(ctx, c);
  const ticks = ctx.ref.settings?.extra?.moneyday?.[c.start] || [];
  return h('section', { class: 'card strip md-strip' },
    h('span', null, h('span', { style: { fontWeight: 600 } }, 'Money day, step 6 of 7'), h('br'),
      h('span', { class: 'muted small' }, plan ? `${counts.planned} planned · ${counts.completed} completed in your bank · ${counts.verified} verified, of ${counts.total} to move` : 'Save this plan, then confirm each transfer in step 7.', ticks.length ? ` · ${ticks.length} step${ticks.length === 1 ? '' : 's'} ticked` : '')),
    h('a', { href: '#moneyday', class: 'btn tap' }, plan && counts.total ? 'Confirm transfers' : 'Back to Money day'));
}

// More assigned than the pay means extra money came from somewhere. Ask where, and record it as a line,
// so the plan balances honestly instead of hiding the difference.
function reconcile(ctx, draft, gap, touch) {
  const source = h('select', { class: 'input', 'aria-label': 'Where the extra money came from' },
    [...ctx.ref.accounts.filter((a) => a.is_active !== false && !['credit_card', 'pension'].includes(a.type)).map((a) => `Existing ${a.name} balance`), 'Cash', 'Something else'].map((x) => h('option', { value: x }, x)));
  const amount = h('input', { class: 'input money', inputmode: 'decimal', value: (gap / 100).toFixed(2), 'aria-label': 'Amount of extra money' });
  return h('div', { class: 'notice', style: { marginTop: '12px' } },
    h('p', { style: { margin: '0 0 8px' } }, `You’ve assigned ${formatPence(gap)} more than this pay. That money came from somewhere, so record where, and the plan balances.`),
    h('div', { class: 'edit-grid' }, source, amount, h('button', { class: 'btn', type: 'button', onclick: () => {
      const p = parsePence(amount.value);
      if (!p || p <= 0) return;
      draft.funding.push({ name: source.value, amount_pence: p });
      touch();
    } }, 'Record it')));
}

// What's owed on the credit card, so the repayment line can be checked (an estimate until you type the balance).
function cardHint(ctx) {
  const card = ctx.ref.accounts.find((a) => a.type === 'credit_card' && a.is_active !== false);
  if (!card) return null;
  const o = cardOwed(card, ctx.ref.snapshots || [], ctx.all, ctx.today);
  if (o.status === 'unknown') return null;
  return h('p', { class: 'muted small', style: { marginTop: 0 } }, kindTag(o.status), ` ${card.name}: about ${formatPence(o.pence)} to repay${o.since ? ` (purchases since ${shortDay(o.since)})` : ''}. Repaying it is a transfer, not spending: the purchases were already counted when you made them. Type the card’s balance on Wealth to verify it.`);
}

// Under the card repayment line: where its amount comes from, and a warning if the card's statement for that
// cycle doesn't look imported yet (then the amount would be too low).
function cardNote(it, card, spend, touch) {
  const range = `${spend.name} cycle, ${shortDay(spend.from)} to ${shortDay(spend.to)}`;
  if (it.verified) return h('p', { class: 'muted small planstate' }, `Confirmed on Money day at ${formatPence(it.amount_pence || 0)}, so it no longer follows the card.`);
  if (it.auto === false) {
    return h('p', { class: 'muted small planstate' }, 'You typed this amount. ',
      h('button', { class: 'linkbtn', type: 'button', onclick: () => { delete it.auto; touch(); } }, `Use what you spent on ${card.name} instead (${formatPence(spend.pence)})`));
  }
  return h('p', { class: 'muted small planstate' },
    `The total of your ${card.name} purchases in the ${range}: ${spend.count} payment${spend.count === 1 ? '' : 's'}, less refunds. Add a ${card.name} transaction from those dates and this changes with it. Type an amount here only if you want to override it.`,
    spend.complete ? null : h('span', { class: 'warn' }, ` The last ${card.name} purchase Money HQ has is ${spend.lastImported ? shortDay(spend.lastImported) : 'none yet'}: if you used the card after that, add those purchases.`));
}
