// Wealth: your accounts' balances (typed in on money day), net worth over time, and how it's split.
// A balance older than 35 days is flagged.
import { h } from '../ui/dom.js';
import { formatPence, parsePence } from '../lib/money.js';
import { dayDiff } from '../lib/dates.js';
import { netWorth, netWorthSeries } from '../lib/analytics.js';
import { head, shortDay, bar, alertLine } from '../ui/parts.js';
import { lineChart } from '../ui/charts.js';
import { addSnapshot } from '../lib/data.js';
import { balanceNow, cardOwed } from '../lib/position.js';
import { kindTag } from './overview.js';

const TYPE = { current: 'Current account', savings: 'Savings', credit_card: 'Credit card (owed)', isa: 'ISA', investment: 'Investments', pension: 'Pension', cash: 'Cash' };
const GROUP_COLOUR = { 'Cash and savings': '#7AA2FF', 'ISAs and investments': '#5BD6A0', Pension: '#B79CFF', Debt: '#FF8A80' };

export function wealthPage(ctx, rerender) {
  const nw = netWorth(ctx.ref.accounts, ctx.ref.snapshots, ctx.today);
  const series = netWorthSeries(ctx.ref.accounts, ctx.ref.snapshots);
  const groups = Object.entries(nw.groups);
  const maxAbs = Math.max(1, ...groups.map(([, v]) => Math.abs(v)));

  const row = (a) => {
    const input = h('input', { class: 'input money', inputmode: 'decimal', placeholder: a.last ? (a.last.balance_pence / 100).toFixed(2) : '0.00', 'aria-label': `${a.name} balance today` });
    const save = h('button', { class: 'btn', type: 'button', onclick: async () => {
      const p = parsePence(input.value);
      if (p === null) { alertLine(save, 'Type the balance, e.g. 1250.00.'); return; }
      try { const snap = await addSnapshot(a.id, ctx.today, Math.abs(p)); ctx.ref.snapshots = [...ctx.ref.snapshots.filter((s) => s.id !== snap.id), snap].sort((x, y) => x.date.localeCompare(y.date)); rerender(); } catch (err) { alertLine(save, err.message); }
    } }, 'Update');
    // Verified = the balance you typed in. For accounts Money HQ imports, it also estimates today's balance from
    // the transactions since; the card estimate works from purchases since the last repayment it can see.
    const now = a.type === 'credit_card' ? cardOwed(a, ctx.ref.snapshots, ctx.all, ctx.today) : balanceNow(a, ctx.ref.snapshots, ctx.transactions, ctx.today);
    const status = a.last ? (now.status === 'verified' ? 'verified' : a.stale ? 'stale' : 'verified') : 'not verified';
    const estimate = now.status === 'estimated' && now.pence !== null && (!a.last || now.pence !== Math.abs(a.last.balance_pence)) ? h('span', { class: 'muted small' }, kindTag('estimated'), ` about ${formatPence(Math.abs(now.pence))} ${a.type === 'credit_card' ? 'owed' : 'now'}${now.since && a.last ? `, after ${now.since} line${now.since === 1 ? '' : 's'} since` : a.type === 'credit_card' && now.since ? ` (purchases since ${shortDay(now.since)})` : ''}`) : null;
    return h('div', { class: 'acctrow' },
      h('span', null, h('span', { style: { fontWeight: 500 } }, a.name, kindTag(status)), estimate ? [h('br'), estimate] : null, h('br'), h('span', { class: `small ${a.stale ? 'warn' : 'muted'}` }, `${TYPE[a.type] || a.type}${a.last ? ` · updated ${shortDay(a.last.date)}${a.stale ? ` (${dayDiff(a.last.date, ctx.today)} days ago)` : ''}` : ' · no balance yet'}`)),
      h('span', { class: `r ${a.value < 0 ? 'over' : ''}` }, a.value === null ? '–' : `${a.value < 0 ? '−' : ''}${formatPence(Math.abs(a.value))}`),
      h('div', { class: 'edit-grid' }, input, save));
  };

  return h('div', { class: 'page' },
    head('Wealth', nw.known ? `Net worth ${formatPence(nw.total)}, from the balances you’ve typed in (verified). Estimates below are worked out from transactions and aren’t added in.` : 'Type in your balances to see your net worth. Until then nothing here is verified.'),
    h('div', { class: 'grid-top' },
      h('section', { class: 'card', 'aria-labelledby': 'nw' },
        h('div', { class: 'ch' }, h('h2', { id: 'nw' }, 'Net worth'), h('span', { class: 'display', style: { fontSize: '28px', fontWeight: 600 } }, nw.known ? formatPence(nw.total) : '–')),
        series.length >= 2 ? lineChart({ labels: series.map((p) => shortDay(p.date)), series: [{ name: 'Net worth', colour: '#8B9CFF', values: series.map((p) => p.total) }], label: 'Net worth over time' })
          : h('p', { class: 'muted', style: { margin: 0 } }, 'Update your balances on each money day and your net worth line builds up here.')),
      h('section', { class: 'card', 'aria-labelledby': 'al' },
        h('h2', { id: 'al' }, 'Cash, investments and debt'),
        groups.length ? groups.map(([g, v]) => h('div', { class: 'crow' }, h('span', { class: 'cname' }, g), bar(Math.abs(v) / maxAbs, { colour: GROUP_COLOUR[g], over: v < 0, label: formatPence(v) }), h('span', { class: `r ${v < 0 ? 'over' : ''}` }, `${v < 0 ? '−' : ''}${formatPence(Math.abs(v))}`)))
          : h('p', { class: 'muted', style: { margin: 0 } }, 'Nothing yet.'),
        groups.length ? h('div', { class: 'stats', style: { marginTop: '12px' } },
          h('div', null, h('span', { class: 'muted' }, 'Assets'), h('span', null, formatPence(groups.filter(([, v]) => v > 0).reduce((a, [, v]) => a + v, 0)))),
          h('div', null, h('span', { class: 'muted' }, 'Liabilities (what you owe)'), h('span', { class: 'over' }, formatPence(-groups.filter(([, v]) => v < 0).reduce((a, [, v]) => a + v, 0))))) : null,
        nw.groups.Pension ? h('p', { class: 'muted small' }, `${Math.round((nw.groups.Pension / Math.max(1, nw.total)) * 100)}% of your net worth is in your pension, which you can’t touch until retirement.`) : null)),
    h('section', { class: 'card', 'aria-labelledby': 'ac' },
      h('h2', { id: 'ac' }, 'Balances'),
      h('p', { class: 'muted small', style: { marginTop: 0 } }, 'Type today’s balance from each app. For the credit card, type what you owe.'),
      nw.rows.map(row)));
}
