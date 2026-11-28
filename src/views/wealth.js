// Wealth: what you own and owe, from the balances you type in (verified), and how it has moved.
//   Summary tiles with when each was last updated · net worth, assets and liabilities over time
//   Cash vs investments (and pension) over time · investment contributions vs gains
//   Any account's balance history · one form to update every balance at once · the balances list
// Only account balances are added up. Sinking funds are pots inside an account (Monzo), so they're part of its
// balance and never added again; transfers just move money between accounts, so they don't change net worth.
import { h } from '../ui/dom.js';
import { formatPence, parsePence } from '../lib/money.js';
import { dayDiff } from '../lib/dates.js';
import { netWorth } from '../lib/analytics.js';
import { wealthSeries, investmentReturn, ago } from '../lib/planning.js';
import { head, shortDay, bar, alertLine } from '../ui/parts.js';
import { lineChart } from '../ui/charts.js';
import { addSnapshot } from '../lib/data.js';
import { balanceNow, cardOwed } from '../lib/position.js';
import { kindTag } from './overview.js';
import { balancesOf } from './accounts.js';
import { trackedNetWorth } from '../lib/balances.js';
import { historyRows } from './history.js';
import { fundsOf } from './state.js';

const TYPE = { current: 'Current account', savings: 'Savings', credit_card: 'Credit card (owed)', isa: 'ISA', investment: 'Investments', pension: 'Pension', cash: 'Cash' };
const GROUP_COLOUR = { 'Cash and savings': '#7AA2FF', 'ISAs and investments': '#5BD6A0', Pension: '#B79CFF', Debt: '#FF8A80' };
const signed = (p) => `${p < 0 ? '−' : ''}${formatPence(Math.abs(p))}`;

export function wealthPage(ctx, rerender) {
  const nw = netWorth(ctx.ref.accounts, ctx.ref.snapshots, ctx.today);
  const series = wealthSeries(ctx.ref.accounts, ctx.ref.snapshots);
  const latest = series[series.length - 1] || { cash: 0, investments: 0, pension: 0, debt: 0, assets: 0, liabilities: 0 };
  const groups = Object.entries(nw.groups);
  const maxAbs = Math.max(1, ...groups.map(([, v]) => Math.abs(v)));
  const lastOf = (types) => nw.rows.filter((r) => types.includes(r.type) && r.last).map((r) => r.last.date).sort().pop();
  const when = (d) => (d ? `updated ${ago(d, ctx.today)}` : 'no balance yet');

  // ---- summary tiles
  const tile = (label, value, sub, cls = '') => h('div', { class: 'card tile' }, h('span', { class: 'muted small' }, label), h('span', { class: `tile-v display ${cls}` }, value), h('span', { class: 'muted small' }, sub));
  // The live figure (typed-in balances plus what's happened since), from the same calculation as the Overview.
  const live = trackedNetWorth(balancesOf(ctx));
  const tiles = h('div', { class: 'tiles' },
    tile('Net worth now', live.status === 'unknown' ? 'Not verified' : signed(live.total), live.status === 'verified' ? 'your typed-in balances' : live.status === 'estimated' ? `${nw.known ? `verified ${signed(nw.total)}` : 'typed-in balances'} + since` : 'needs your balances', live.status === 'unknown' ? 'unset' : ''),
    tile('Assets', nw.known ? formatPence(latest.assets) : 'Not entered', 'everything you own', nw.known ? '' : 'unset'),
    tile('Liabilities', lastOf(['credit_card']) ? formatPence(latest.liabilities) : 'Not entered', when(lastOf(['credit_card'])), lastOf(['credit_card']) ? (latest.liabilities ? 'over' : '') : 'unset'),
    tile('Cash and savings', lastOf(['current', 'savings', 'cash']) ? formatPence(latest.cash) : 'Not entered', when(lastOf(['current', 'savings', 'cash'])), lastOf(['current', 'savings', 'cash']) ? '' : 'unset'),
    tile('ISAs and investments', lastOf(['isa', 'investment']) ? formatPence(latest.investments) : 'Not entered', when(lastOf(['isa', 'investment'])), lastOf(['isa', 'investment']) ? '' : 'unset'),
    tile('Pension', lastOf(['pension']) ? formatPence(latest.pension) : 'Not entered', when(lastOf(['pension'])), lastOf(['pension']) ? '' : 'unset'));

  // ---- net worth, assets and liabilities over time
  const labels = series.map((p) => shortDay(p.date));
  const worthCard = h('section', { class: 'card', 'aria-labelledby': 'wn' },
    h('div', { class: 'ch' }, h('h2', { id: 'wn' }, 'Net worth over time'), h('span', { class: 'muted small' }, series.length ? `${series.length} update${series.length === 1 ? '' : 's'}` : '')),
    series.length >= 2 ? lineChart({ labels, series: [{ name: 'Net worth', colour: '#8B9CFF', values: series.map((p) => p.total) }, { name: 'Assets', colour: '#5BD6A0', values: series.map((p) => p.assets) }, { name: 'Owed', colour: '#FF8A80', values: series.map((p) => p.liabilities) }], label: 'Net worth, assets and liabilities over time' })
      : h('p', { class: 'muted', style: { margin: 0 } }, 'Update your balances on each money day and the lines build up here.'),
    h('p', { class: 'muted small', style: { margin: '8px 0 0' } }, 'Each account keeps its last balance until you type a new one.'));

  // ---- cash vs investments
  const splitCard = h('section', { class: 'card', 'aria-labelledby': 'wc' },
    h('h2', { id: 'wc' }, 'Cash vs investments'),
    series.length >= 2 ? lineChart({ labels, series: [{ name: 'Cash', colour: '#7AA2FF', values: series.map((p) => p.cash) }, { name: 'Investments', colour: '#5BD6A0', values: series.map((p) => p.investments) }, { name: 'Pension', colour: '#B79CFF', values: series.map((p) => p.pension) }], label: 'Cash, investments and pension over time' }) : null,
    groups.length ? groups.map(([g, v]) => h('div', { class: 'crow' }, h('span', { class: 'cname' }, g), bar(Math.abs(v) / maxAbs, { colour: GROUP_COLOUR[g], over: v < 0, label: formatPence(v) }), h('span', { class: `r ${v < 0 ? 'over' : ''}` }, signed(v))))
      : h('p', { class: 'muted', style: { margin: 0 } }, 'Nothing yet.'),
    nw.groups.Pension ? h('p', { class: 'muted small' }, `${Math.round((nw.groups.Pension / Math.max(1, nw.total)) * 100)}% of your net worth is in your pension, which you can’t touch until retirement.`) : null);

  // ---- investment contributions vs gains
  const ret = investmentReturn(ctx.ref.accounts, ctx.ref.snapshots, historyRows(ctx.all));
  const gainsCard = h('section', { class: 'card', 'aria-labelledby': 'wg' },
    h('h2', { id: 'wg' }, 'Investments: put in vs gained'),
    ret.known ? [
      h('div', { class: 'minis' },
        h('div', null, h('span', { class: 'muted small' }, `Value on ${shortDay(ret.from)}`), h('strong', null, formatPence(ret.start))),
        h('div', null, h('span', { class: 'muted small' }, 'Put in since (after withdrawals)'), h('strong', null, signed(ret.contributed))),
        h('div', null, h('span', { class: 'muted small' }, ret.gain >= 0 ? 'Gained' : 'Lost'), h('strong', { class: ret.gain >= 0 ? 'good' : 'over' }, signed(ret.gain)))),
      h('div', { class: 'stack', style: { margin: '12px 0 4px' }, role: 'img', 'aria-label': `${formatPence(ret.now)} now: started with ${formatPence(ret.start)}, put in ${formatPence(ret.contributed)}, gained ${formatPence(ret.gain)}` },
        h('span', { style: { flex: Math.max(0, ret.start), background: '#5F6B7A' } }), h('span', { style: { flex: Math.max(0, ret.contributed), background: '#5BD6A0' } }), h('span', { style: { flex: Math.max(0, ret.gain), background: '#8B9CFF' } })),
      h('p', { class: 'muted small', style: { margin: 0 } }, `Now ${formatPence(ret.now)} (${shortDay(ret.to)}). Gain = value now − value on ${shortDay(ret.from)} − money put in since. Pensions aren’t included.`)]
      : [h('p', { style: { margin: 0 } }, `You’ve put ${signed(ret.contributedAll)} into investments in your records (after withdrawals).`),
        h('p', { class: 'muted small' }, ret.reason || 'To see gains, type in your ISA and investment balances below; the next update will show what they’ve gained.')]);

  // ---- one account's balance history
  const withHistory = nw.rows.filter((r) => ctx.ref.snapshots.some((s) => s.account_id === r.id));
  const pickId = withHistory.some((r) => r.id === ctx.wealthAccount) ? ctx.wealthAccount : withHistory[0]?.id;
  const snaps = ctx.ref.snapshots.filter((s) => s.account_id === pickId).sort((a, b) => a.date.localeCompare(b.date));
  const histCard = h('section', { class: 'card', 'aria-labelledby': 'wh' },
    h('div', { class: 'ch' }, h('h2', { id: 'wh' }, 'Balance history'),
      withHistory.length ? h('select', { class: 'input', style: { width: 'auto' }, 'aria-label': 'Account', onchange: (e) => { ctx.wealthAccount = e.target.value; rerender(); } }, withHistory.map((r) => h('option', { value: r.id, selected: r.id === pickId }, r.name))) : null),
    !snaps.length ? h('p', { class: 'muted', style: { margin: 0 } }, 'No balances typed in yet.')
      : [snaps.length >= 2 ? lineChart({ labels: snaps.map((s) => shortDay(s.date)), series: [{ name: 'Balance', colour: '#8B9CFF', values: snaps.map((s) => s.balance_pence) }], label: 'Balance over time' }) : null,
        h('div', { class: 'stats' }, [...snaps].reverse().slice(0, 6).map((s, i, arr) => h('div', null, h('span', { class: 'muted' }, `${shortDay(s.date)} ${s.date.slice(0, 4)}`), h('span', null, formatPence(s.balance_pence),
          arr[i + 1] ? h('span', { class: `small ${s.balance_pence >= arr[i + 1].balance_pence ? 'good' : 'over'}` }, ` ${s.balance_pence >= arr[i + 1].balance_pence ? '+' : '−'}${formatPence(Math.abs(s.balance_pence - arr[i + 1].balance_pence))}`) : null))))]);

  // ---- update every balance at once
  const date = h('input', { class: 'input', type: 'date', value: ctx.today, max: ctx.today, 'aria-label': 'Date of these balances' });
  const inputs = nw.rows.map((a) => ({ a, el: h('input', { class: 'input money', inputmode: 'decimal', placeholder: a.last ? (Math.abs(a.last.balance_pence) / 100).toFixed(2) : '0.00', 'aria-label': `${a.name} balance` }) }));
  const saveAll = h('button', { class: 'btn primary', type: 'button', onclick: async () => {
    const todo = inputs.filter((x) => x.el.value.trim());
    const bad = todo.find((x) => parsePence(x.el.value) === null);
    if (!todo.length) { alertLine(saveAll, 'Type at least one balance.'); return; }
    if (bad) { alertLine(saveAll, `Check the ${bad.a.name} balance, e.g. 1250.00.`); return; }
    saveAll.disabled = true; saveAll.textContent = 'Saving…';
    try {
      for (const x of todo) {
        const snap = await addSnapshot(x.a.id, date.value || ctx.today, Math.abs(parsePence(x.el.value)));
        ctx.ref.snapshots = [...ctx.ref.snapshots.filter((s) => s.id !== snap.id && !(s.account_id === snap.account_id && s.date === snap.date)), snap].sort((p, q) => p.date.localeCompare(q.date));
      }
      ctx.wealthSaved = `${todo.length} balance${todo.length === 1 ? '' : 's'} saved for ${shortDay(date.value || ctx.today)}.`;
      rerender();
    } catch (err) { saveAll.disabled = false; saveAll.textContent = 'Save all balances'; alertLine(saveAll, err.message); }
  } }, 'Save all balances');
  const bulk = h('section', { class: 'card', 'aria-labelledby': 'wu', id: 'update' },
    h('div', { class: 'ch' }, h('h2', { id: 'wu' }, 'Update balances'), h('label', { class: 'small muted', style: { display: 'flex', alignItems: 'center', gap: '8px' } }, 'As of', date)),
    h('p', { class: 'muted small', style: { marginTop: 0 } }, 'Type today’s balance from each app, leave the ones you haven’t checked blank, then save them all at once. For the credit card, type what you owe.'),
    h('div', { class: 'bulkgrid' }, inputs.map(({ a, el }) => h('label', { class: 'bulkrow' }, h('span', null, a.name, h('br'), h('span', { class: `small ${a.stale ? 'warn' : 'muted'}` }, a.last ? `${formatPence(Math.abs(a.last.balance_pence))}, ${ago(a.last.date, ctx.today)}` : 'never')), el))),
    h('div', { class: 'chips' }, saveAll, ctx.wealthSaved ? h('span', { class: 'good small', role: 'status' }, ctx.wealthSaved) : null));
  ctx.wealthSaved = null;

  // ---- the balances list
  const row = (a) => {
    const now = a.type === 'credit_card' ? cardOwed(a, ctx.ref.snapshots, ctx.all, ctx.today) : balanceNow(a, ctx.ref.snapshots, ctx.transactions, ctx.today);
    const status = a.last ? (now.status === 'verified' ? 'verified' : a.stale ? 'stale' : 'verified') : 'not verified';
    const estimate = now.status === 'estimated' && now.pence !== null && (!a.last || now.pence !== Math.abs(a.last.balance_pence)) ? h('span', { class: 'muted small' }, kindTag('estimated'), ` about ${formatPence(Math.abs(now.pence))} ${a.type === 'credit_card' ? 'owed' : 'now'}${now.since && a.last ? `, after ${now.since} line${now.since === 1 ? '' : 's'} since` : a.type === 'credit_card' && now.since ? ` (purchases since ${shortDay(now.since)})` : ''}`) : null;
    // Lines for this account still waiting in the inbox: not counted in the balance until you approve them.
    const waiting = balanceNow(a, ctx.ref.snapshots, ctx.transactions, ctx.today).pending;
    const pendingLine = waiting.count ? h('span', { class: 'small warn' }, `${waiting.count} line${waiting.count === 1 ? '' : 's'} in your inbox (${waiting.pence < 0 ? '−' : '+'}${formatPence(Math.abs(waiting.pence))}) not counted yet`) : null;
    return h('div', { class: 'acctrow' },
      h('span', null, h('span', { style: { fontWeight: 500 } }, h('a', { href: `#account/${a.id}`, class: 'acct-link' }, a.name), kindTag(status)), estimate ? [h('br'), estimate] : null, pendingLine ? [h('br'), pendingLine] : null, h('br'),
        h('span', { class: `small ${a.stale ? 'warn' : 'muted'}` }, `${TYPE[a.type] || a.type}${a.last ? ` · updated ${shortDay(a.last.date)} ${a.last.date.slice(0, 4)} (${ago(a.last.date, ctx.today)})` : ' · no balance yet'}`)),
      h('span', { class: `r ${a.value < 0 ? 'over' : ''}` }, a.value === null ? '–' : signed(a.value)));
  };
  const funds = fundsOf(ctx).filter((f) => f.balance_pence);
  const fundTotal = funds.reduce((a, f) => a + f.balance_pence, 0);

  return h('div', { class: 'page' },
    head('Wealth', nw.known ? `Net worth ${signed(nw.total)}, from the balances you’ve typed in (verified). Estimates are worked out from transactions and aren’t added in.` : 'Type in your balances to see your net worth. Until then nothing here is verified.',
      h('a', { href: '#update', class: 'btn primary tap', onclick: (e) => { e.preventDefault(); document.querySelector('#update')?.scrollIntoView({ behavior: 'smooth' }); } }, 'Update balances')),
    tiles,
    // Nothing typed in yet: one short note instead of empty charts (the gains card still shows what you've put in).
    series.length ? h('div', { class: 'grid-even' }, worthCard, splitCard) : h('section', { class: 'card empty-card compact-empty' }, h('p', { style: { margin: 0 } }, h('strong', null, 'Net worth, cash vs investments and balance history'), ' fill in from the first time you enter your balances below. Nothing is estimated until then.')),
    series.length ? h('div', { class: 'grid-even' }, gainsCard, histCard) : gainsCard,
    bulk,
    h('section', { class: 'card', 'aria-labelledby': 'ac' }, h('h2', { id: 'ac' }, 'Balances'), nw.rows.map(row),
      h('p', { class: 'muted small', style: { margin: '12px 0 0' } }, `Only account balances are added up. ${funds.length ? `Your sinking funds (${formatPence(fundTotal)} across ${funds.length}) are pots inside your savings account, so they’re already in its balance and aren’t added again. ` : 'Sinking funds are pots inside your savings account, so they’re never added again. '}Transfers between your own accounts don’t change your net worth.`)));
}

export const staleDays = (d, today) => dayDiff(d, today);
