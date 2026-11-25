// Investments & Net Worth: net worth history, holdings and allocation, debts and money owed to you.
import { h, fmtDay, plural, toast } from '../ui.js';
import { todayIso, r2, addDays, normKey } from '../money.js';
import { monthLabel } from '../dashboard.js';
import { accountsSummary, netWorthSeries, compound, cardPaymentsDue, owedSummary, reconcileOwed, isLiability, ACCOUNT_TYPES } from '../finance.js';
import { monthOf } from '../analytics.js';
import { card, kpi, meter, note, tip, grid, subnav, table, field, numInput, textInput, selectInput, listEditor, plot, cfg, createRegistry, openDrill, gbp0, gbp2, uid, emptyState } from '../kit.js';

const SUBS = [['networth', 'Net worth'], ['investments', 'Investments'], ['debts', 'Debts & owed']];
const HOLD_KINDS = [['ETF', 'ETF'], ['stock', 'Individual stock'], ['fund', 'Fund'], ['cash', 'Cash']];
const sum = (l, f) => r2(l.reduce((a, x) => a + (Number(f(x)) || 0), 0));

export function initWealth(ctx, root) {
  const reg = createRegistry();
  const route = () => (ctx.route && ctx.route.sub) || 'networth';
  const go = (s) => { location.hash = `wealth/${s}`; };
  const calc = { start: 0, monthly: 200, years: 10, rate: 6 };
  const proj = { monthly: null, rate: 5, years: 20 };
  const recv = { person: '', amount: 0 };
  const bench = { v: 0 };
  const save = (fn) => ctx.update((d) => fn(d));

  // ---------------------------------------------------------------- Net worth
  function networth(data, today) {
    const out = [];
    const acc = accountsSummary(data.accounts);
    const pts = netWorthSeries(data, today);
    if (!data.accounts.length) return [card('Net worth', emptyState('Add your accounts and balances to see your net worth, how it has grown and where it sits.', 'Add accounts', '#settings/accounts'))];
    const first = pts[0];
    const last = pts[pts.length - 1];
    const ytdStart = pts.filter((p) => p.date >= `${today.slice(0, 4)}-01-01`)[0];
    const ytd = ytdStart && ytdStart !== last && ytdStart.netWorth ? Math.round(((last.netWorth - ytdStart.netWorth) / Math.abs(ytdStart.netWorth)) * 100) : null;
    out.push(grid(5,
      kpi('Net worth', gbp0(acc.netWorth), pts.length > 1 ? `${last.change >= 0 ? '+' : '-'}${gbp0(Math.abs(last.change))} since ${fmtDay(pts[pts.length - 2].date)}` : 'today', 'green'),
      kpi('Assets', gbp0(acc.assets), `cash ${gbp0(acc.cash)} · savings ${gbp0(acc.savings)}`, 'blue'),
      kpi('Liabilities', gbp0(acc.liabilities), 'cards and loans', acc.liabilities > 0 ? 'amber' : ''),
      kpi('Cash vs invested', `${acc.assets > 0 ? Math.round(((acc.cash + acc.savings) / acc.assets) * 100) : 0}% cash`, `${gbp0(acc.investments + acc.pension)} invested`, 'purple'),
      kpi('Year to date', ytd === null ? '—' : `${ytd >= 0 ? '+' : ''}${ytd}%`, ytd === null ? 'needs a snapshot earlier this year' : `since ${fmtDay(ytdStart.date)}`, ytd !== null && ytd < 0 ? 'amber' : 'green')));
    out.push(card('Net worth over time',
      pts.length > 1 ? plot(reg, 'Net worth over time', () => cfg.lines(pts.map((p) => fmtDay(p.date)), [{ label: 'Net worth', data: pts.map((p) => p.netWorth), color: '#2ee6b6', fill: true }], { zero: false }), 280)
        : tip('One data point so far. Save a snapshot now, and another each month, and the growth appears here.'),
      h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', onclick: () => {
        save((d) => { const balances = {}; for (const a of d.accounts) balances[a.id] = Number(a.balance) || 0; const i = d.snapshots.findIndex((s) => s.date === today); const snap = { id: uid('snap'), date: today, balances }; if (i >= 0) d.snapshots[i] = snap; else d.snapshots.push(snap); });
        toast('Snapshot saved for today.', 'ok');
      } }, 'Save today\'s balances as a snapshot'), h('a', { class: 'link-btn', href: '#settings/accounts' }, 'Update balances')),
      note('Net worth is assets minus debts using the balances you entered. Money set aside in savings goals is part of an account already, so it is never counted twice.')));

    if (pts.length > 1) {
      out.push(h('div', { class: 'charts' },
        card('Assets vs liabilities', plot(reg, 'Assets and liabilities over time', () => cfg.bars(pts.map((p) => fmtDay(p.date)), [{ label: 'Assets', data: pts.map((p) => p.assets), color: '#2ee6b6' }, { label: 'Liabilities', data: pts.map((p) => p.liabilities), color: '#ff5c7a' }]), 260)),
        card('Cash vs investments', plot(reg, 'Cash and investments over time', () => cfg.bars(pts.map((p) => fmtDay(p.date)), [{ label: 'Cash & savings', data: pts.map((p) => p.accessible), color: '#7c8cff' }, { label: 'Investments & pension', data: pts.map((p) => p.investments + p.pension), color: '#b794ff' }], { stacked: true }), 260))));
      out.push(card('What changed, and why', note('Each change is split into money you paid in and everything else (market growth, interest, other).'),
        table([{ label: 'To', align: 'left', get: (r) => fmtDay(r.date) }, { label: 'Net worth', get: (r) => gbp0(r.netWorth) }, { label: 'Change', get: (r) => `${r.change >= 0 ? '+' : '-'}${gbp0(Math.abs(r.change))}` }, { label: '%', get: (r) => `${r.pct >= 0 ? '+' : ''}${r.pct}%` }, { label: 'You paid in', get: (r) => gbp0(r.contributions) }, { label: 'Growth & other', get: (r) => `${r.other >= 0 ? '+' : '-'}${gbp0(Math.abs(r.other))}` }], pts.slice(1).reverse())));
    }
    out.push(h('div', { class: 'charts' },
      card('Where your wealth sits', acc.allocation.length ? plot(reg, 'Wealth by asset type', () => cfg.doughnut(acc.allocation.map((a) => a.name), acc.allocation.map((a) => a.value)), 280) : h('p', { class: 'empty' }, 'No assets yet.')),
      card('Long-term projection', note('An estimate, not a promise. Markets can fall as well as rise.'),
        h('div', { class: 'edgrid' },
          field('Add each month (£)', numInput(proj.monthly ?? 0, (v) => { proj.monthly = v; render(); })),
          field('Growth on investments (% a year)', numInput(proj.rate, (v) => { proj.rate = v; render(); })),
          field('Years', numInput(proj.years, (v) => { proj.years = Math.min(60, Math.max(1, Math.round(v))); render(); }))),
        (() => {
          const months = proj.years * 12;
          const monthly = proj.monthly ?? 0;
          const grown = compound(acc.investments + acc.pension, monthly, proj.rate, months);
          const labels = Array.from({ length: proj.years + 1 }, (_, i) => `Year ${i}`);
          const nw = labels.map((_, i) => r2(acc.cash + acc.savings + acc.other - acc.debt + grown[i * 12]));
          const flat = labels.map((_, i) => r2(acc.netWorth + monthly * 12 * i));
          return h('div', null, plot(reg, 'Projected net worth', () => cfg.lines(labels, [{ label: `At ${proj.rate}% growth`, data: nw, color: '#2ee6b6' }, { label: 'Contributions only', data: flat, color: '#7e8aa3', dash: [5, 4] }], { zero: false }), 240),
            h('p', { class: 'takeaway' }, `In ${proj.years} years, about ${gbp0(nw[nw.length - 1])} if you add ${gbp0(monthly)} a month and investments grow ${proj.rate}% a year (an estimate).`));
        })())));
    return out;
  }

  // ---------------------------------------------------------------- Investments
  function investments(data, today) {
    const out = [];
    const hold = data.holdings;
    const value = sum(hold, (x) => x.value);
    const cost = sum(hold, (x) => x.cost);
    const gain = r2(value - cost);
    const fees = sum(hold, (x) => (Number(x.value) || 0) * ((Number(x.fee) || 0) / 100));
    const year = today.slice(0, 4);
    const divs = data.dividends;
    const divYtd = sum(divs.filter((d) => d.date.startsWith(year)), (d) => d.amount);
    const contribTotal = sum(data.transactions.filter((t) => t.kind === 'invested' && t.direction === 'out'), (t) => t.amount);

    out.push(grid(5,
      kpi('Portfolio value', gbp0(value), plural(hold.length, 'holding'), 'blue'),
      kpi('Gain / loss', `${gain >= 0 ? '+' : '-'}${gbp0(Math.abs(gain))}`, cost > 0 ? `${r2((gain / cost) * 100)}% on what you paid in` : 'add what you paid for each', gain >= 0 ? 'green' : 'amber'),
      kpi('Paid in (from your data)', gbp0(contribTotal), 'ISA and investment deposits', ''),
      kpi('Dividends this year', gbp0(divYtd), 'as entered below', 'purple'),
      kpi('Fees a year', gbp0(fees), 'from the fee % you entered', 'amber')));

    out.push(card('Your holdings', note('Enter each holding and its current value. Live prices are not connected, so update these when you check your accounts. Realised returns are not tracked.'),
      listEditor({
        items: hold, empty: 'No holdings yet.', addLabel: 'Add a holding',
        makeNew: () => ({ id: uid('hold'), name: 'New holding', ticker: '', kind: 'ETF', assetClass: 'Equity', sector: 'Diversified', geography: 'Global', value: 0, cost: 0, fee: 0 }),
        onChange: (items) => save((d) => { d.holdings = items; }), itemTitle: (x) => x.name,
        fields: [{ key: 'name', label: 'Name' }, { key: 'ticker', label: 'Ticker' }, { key: 'kind', label: 'Type', type: 'select', options: HOLD_KINDS }, { key: 'assetClass', label: 'Asset class' }, { key: 'sector', label: 'Sector' }, { key: 'geography', label: 'Region' }, { key: 'value', label: 'Value now (£)', type: 'number' }, { key: 'cost', label: 'Paid in (£)', type: 'number' }, { key: 'fee', label: 'Fee (% a year)', type: 'number' }],
      })));

    if (hold.length && value > 0) {
      const grp = (f) => { const m = {}; for (const x of hold) { const k = f(x) || 'Other'; m[k] = (m[k] || 0) + (Number(x.value) || 0); } return Object.entries(m).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]); };
      const pie = (title, rows) => card(title, plot(reg, title, () => cfg.doughnut(rows.map((r) => r[0]), rows.map((r) => r[1])), 260));
      out.push(h('div', { class: 'charts' }, pie('By holding', grp((x) => x.name)), pie('By sector', grp((x) => x.sector))));
      out.push(h('div', { class: 'charts' }, pie('By region', grp((x) => x.geography)), pie('By asset class', grp((x) => x.assetClass))));
      const etf = grp((x) => (x.kind === 'ETF' || x.kind === 'fund' ? 'Funds & ETFs' : x.kind === 'stock' ? 'Individual stocks' : 'Cash'));
      const top = hold.slice().sort((a, b) => (b.value || 0) - (a.value || 0))[0];
      const share = Math.round(((top.value || 0) / value) * 100);
      out.push(h('div', { class: 'charts' }, pie('Funds vs individual stocks', etf),
        card('Concentration & diversification', h('dl', { class: 'facts' },
          h('div', null, h('dt', null, 'Biggest holding'), h('dd', null, `${top.name} · ${share}%`)),
          h('div', null, h('dt', null, 'Holdings'), h('dd', null, String(hold.length))),
          h('div', null, h('dt', null, 'Sectors'), h('dd', null, String(new Set(hold.map((x) => x.sector)).size))),
          h('div', null, h('dt', null, 'Regions'), h('dd', null, String(new Set(hold.map((x) => x.geography)).size)))),
          share > 30 ? tip(`${top.name} is ${share}% of your portfolio. A single holding over about 30% means one company or fund drives much of your result.`) : note('No single holding dominates your portfolio.'))));
      out.push(card('Paid in vs value', plot(reg, 'Paid in against current value', () => cfg.bars(hold.map((x) => x.name), [{ label: 'Paid in', data: hold.map((x) => x.cost || 0), color: '#7e8aa3' }, { label: 'Worth now', data: hold.map((x) => x.value || 0), color: '#2ee6b6' }]), 260)));
      out.push(card('Compare with a benchmark', note('Type the return of an index over the same period (for example 8). This is only a rough yardstick.'),
        h('div', { class: 'edgrid' }, field('Benchmark return (%)', numInput(bench.v, (v) => { bench.v = v; render(); }))),
        cost > 0 ? h('p', { class: 'takeaway' }, `Your holdings are ${r2((gain / cost) * 100)}% on what you paid in${bench.v ? `, against the benchmark's ${bench.v}% (${(gain / cost) * 100 >= bench.v ? 'ahead' : 'behind'})` : ''}.`) : null));
    }

    // Value over time vs what you paid in, from snapshots
    const pts = netWorthSeries(data, today).filter((p) => p.investments + p.pension > 0 || data.snapshots.length);
    const inv = data.transactions.filter((t) => t.kind === 'invested' && t.direction === 'out').sort((a, b) => a.date.localeCompare(b.date));
    if (pts.length > 1) {
      const paid = (iso) => sum(inv.filter((t) => t.date <= iso), (t) => t.amount);
      out.push(card('Portfolio value vs money paid in', plot(reg, 'Portfolio value against contributions', () => cfg.lines(pts.map((p) => fmtDay(p.date)), [{ label: 'Value', data: pts.map((p) => p.investments + p.pension), color: '#4cc9ff' }, { label: 'Paid in since records began', data: pts.map((p) => paid(p.date)), color: '#7e8aa3', dash: [5, 4] }], { zero: true }), 240),
        note('Paid in is taken from your invested transactions. The gap between the lines is growth, which includes anything held before your records start.')));
    }

    out.push(card('Dividends & interest', note('Record income your investments pay out.'),
      listEditor({ items: divs, empty: 'No dividends recorded.', addLabel: 'Add a dividend', makeNew: () => ({ id: uid('div'), date: today, amount: 0, holding: '' }), onChange: (items) => save((d) => { d.dividends = items; }),
        fields: [{ key: 'date', label: 'Date', type: 'date' }, { key: 'amount', label: 'Amount (£)', type: 'number' }, { key: 'holding', label: 'From' }] }),
      divs.length ? (() => { const months = [...new Set(divs.map((d) => monthOf(d.date)))].sort(); return plot(reg, 'Dividend income by month', () => cfg.bars(months.map(monthLabel), [{ label: 'Dividends', data: months.map((m) => sum(divs.filter((d) => monthOf(d.date) === m), (d) => d.amount)), color: '#b794ff' }]), 200); })() : null));

    const opp = data.accounts.filter((a) => a.opportunity);
    out.push(card('Opportunity funds', note('Money set aside to invest when the moment is right, kept apart from what is already invested. Mark an account as an opportunity fund under Settings > Accounts.'),
      opp.length ? h('dl', { class: 'facts' }, opp.map((a) => h('div', null, h('dt', null, a.name), h('dd', null, gbp0(a.balance))))) : h('p', { class: 'empty' }, 'None marked.')));

    out.push(card('Compound growth calculator', note('A hypothetical, adjustable estimate. Returns are not guaranteed and investments can go down as well as up.'),
      h('div', { class: 'edgrid' }, field('Starting amount (£)', numInput(calc.start, (v) => { calc.start = v; render(); })), field('Add each month (£)', numInput(calc.monthly, (v) => { calc.monthly = v; render(); })),
        field('Years', numInput(calc.years, (v) => { calc.years = Math.min(60, Math.max(1, Math.round(v))); render(); })), field('Hypothetical return (% a year)', numInput(calc.rate, (v) => { calc.rate = v; render(); }))),
      (() => {
        const m = calc.years * 12;
        const g = compound(calc.start, calc.monthly, calc.rate, m);
        const labels = Array.from({ length: calc.years + 1 }, (_, i) => `Year ${i}`);
        const put = labels.map((_, i) => r2(calc.start + calc.monthly * 12 * i));
        return h('div', null, plot(reg, 'Compound growth projection', () => cfg.lines(labels, [{ label: 'Projected value', data: labels.map((_, i) => g[i * 12]), color: '#2ee6b6', fill: true }, { label: 'What you pay in', data: put, color: '#7e8aa3', dash: [5, 4] }]), 240),
          h('p', { class: 'takeaway' }, `After ${calc.years} years: about ${gbp0(g[m])}, of which ${gbp0(put[put.length - 1])} is money you paid in and ${gbp0(g[m] - put[put.length - 1])} is estimated growth. This is a hypothetical estimate, not a forecast.`));
      })()));
    return out;
  }

  // ---------------------------------------------------------------- Debts & owed
  function debts(data, today) {
    const out = [];
    const cards = data.accounts.filter(isLiability);
    const owed = owedSummary(data.owed, today);
    const totalDebt = sum(cards, (a) => a.balance);
    const limit = sum(cards.filter((a) => a.type === 'credit'), (a) => a.limit);
    out.push(grid(4,
      kpi('Total debt', gbp0(totalDebt), plural(cards.length, 'card or loan'), totalDebt > 0 ? 'amber' : 'green'),
      kpi('Credit used', limit > 0 ? `${Math.round((sum(cards.filter((a) => a.type === 'credit'), (a) => a.balance) / limit) * 100)}%` : '—', limit > 0 ? `of ${gbp0(limit)} limit` : 'add your card limit', ''),
      kpi('Due in 30 days', gbp0(sum(cardPaymentsDue(data, today, addDays(today, 30)), (c) => c.amount)), 'statement or minimum payments', 'blue'),
      kpi('Owed to you', gbp0(owed.outstanding), plural(owed.count, 'payment'), 'green')));

    out.push(card('Credit cards & loans', cards.length ? table([
      { label: 'Name', align: 'left', get: (a) => a.name }, { label: 'Owed', get: (a) => gbp0(a.balance) },
      { label: 'Limit', get: (a) => (a.limit ? gbp0(a.limit) : '—') }, { label: 'Used', get: (a) => (a.limit ? `${Math.round((a.balance / a.limit) * 100)}%` : '—') },
      { label: 'Rate', get: (a) => (a.apr ? `${a.apr}%` : '—') }, { label: 'Statement', get: (a) => (a.statementBalance ? gbp0(a.statementBalance) : '—') },
      { label: 'Minimum', get: (a) => (a.minPayment ? gbp0(a.minPayment) : '—') }, { label: 'Due', get: (a) => (a.dueDay ? `day ${a.dueDay}` : '—') }], cards)
      : h('p', { class: 'empty' }, 'No cards or loans entered.'),
      h('a', { class: 'link-btn', href: '#settings/accounts' }, 'Edit cards and loans'),
      note('A credit-card purchase counts as spending on the day you buy it. Paying the card off is a repayment of what you owe, never spending a second time.')));

    const upcoming = cardPaymentsDue(data, today, addDays(today, 45));
    out.push(card('Upcoming card obligations', upcoming.length ? table([{ label: 'When', align: 'left', get: (r) => fmtDay(r.date) }, { label: 'What', align: 'left', get: (r) => r.name }, { label: 'Amount', get: (r) => gbp0(r.amount) }], upcoming) : h('p', { class: 'empty' }, 'Nothing due in the next 45 days (or no due dates entered).')));

    const repay = data.transactions.filter((t) => t.kind === 'internal' && /credit card/i.test(`${t.category} ${t.detail}`) && t.direction === 'out').sort((a, b) => a.date.localeCompare(b.date));
    out.push(card('Repayment history', repay.length ? h('div', null, (() => { const months = [...new Set(repay.map((t) => monthOf(t.date)))].sort().slice(-12); return plot(reg, 'Card repayments by month', () => cfg.bars(months.map(monthLabel), [{ label: 'Repaid', data: months.map((m) => sum(repay.filter((t) => monthOf(t.date) === m), (t) => t.amount)), color: '#2ee6b6' }], { pick: (i) => openDrill(`Card repayments in ${monthLabel(months[i])}`, repay.filter((t) => monthOf(t.date) === months[i])) }), 220); })(),
      h('p', { class: 'muted' }, `${gbp0(sum(repay, (t) => t.amount))} repaid across ${plural(repay.length, 'payment')}.`)) : h('p', { class: 'empty' }, 'No card repayments found in your transactions.')));
    const pts = netWorthSeries(data, today);
    if (pts.length > 1) out.push(card('Debt over time', plot(reg, 'Debt over time', () => cfg.lines(pts.map((p) => fmtDay(p.date)), [{ label: 'Debt', data: pts.map((p) => p.liabilities), color: '#ff5c7a', fill: true }]), 200)));

    // Reimbursements
    const names = [...new Set(data.owed.map((o) => o.person).filter(Boolean))];
    out.push(card('Money owed to you', note('Track what friends, family or businesses owe you. Partial payments are fine.'),
      listEditor({
        items: owed.rows, empty: 'Nobody owes you anything.', addLabel: 'Add what someone owes you',
        makeNew: () => ({ id: uid('owed'), person: '', amount: 0, received: 0, date: today, expected: '', note: '', applied: [] }),
        onChange: (items) => save((d) => { d.owed = items.map(({ outstanding, status, ...o }) => o); }),
        itemTitle: (o) => `${o.person || 'Someone'} · ${o.status === 'paid' ? 'paid' : `${gbp0(o.outstanding)} outstanding`} · ${o.status}`,
        fields: [{ key: 'person', label: 'Who' }, { key: 'amount', label: 'Amount owed (£)', type: 'number' }, { key: 'received', label: 'Received so far (£)', type: 'number' }, { key: 'date', label: 'Date', type: 'date' }, { key: 'expected', label: 'Expected back by', type: 'date' }, { key: 'note', label: 'What for' }],
      }),
      names.length ? h('div', { class: 'optrow' }, h('div', { class: 'edgrid' }, field('Money received from', selectInput([['', 'Choose…'], ...names.map((n) => [n, n])], recv.person, (v) => { recv.person = v; })), field('Amount (£)', numInput(recv.amount, (v) => { recv.amount = v; }))),
        h('button', { class: 'btn', type: 'button', onclick: () => { if (!recv.person || !(recv.amount > 0)) { toast('Choose a person and an amount.', 'bad'); return; } save((d) => { d.owed = reconcileOwed(d.owed, recv.person, recv.amount); }); toast('Recorded. It goes against their oldest debt first.', 'ok'); recv.amount = 0; } }, 'Record payment received')) : null));
    // Suggested matches from real incoming payments
    const sugg = [];
    for (const o of owed.rows.filter((x) => x.outstanding > 0 && x.person)) {
      const key = normKey(o.person).split(' ')[0];
      if (!key) continue;
      for (const t of data.transactions) {
        if (t.kind === 'payback' && t.direction === 'in' && t.date >= (o.date || '0000') && normKey(t.desc).includes(key) && !(o.applied || []).includes(t.id) && t.amount <= o.outstanding + 0.005) sugg.push({ o, t });
      }
    }
    if (sugg.length) out.push(card('Possible payments received', note('Money that arrived from these people after the debt began. Apply it and the debt goes down; each payment can only be applied once.'),
      table([{ label: 'Date', align: 'left', get: (r) => fmtDay(r.t.date) }, { label: 'From', align: 'left', get: (r) => r.t.desc }, { label: 'Amount', get: (r) => gbp2(r.t.amount) }, { label: 'Against', align: 'left', get: (r) => r.o.person },
        { label: '', get: (r) => h('button', { class: 'btn ghost small', type: 'button', onclick: () => save((d) => { const o = d.owed.find((x) => x.id === r.o.id); o.received = r2((Number(o.received) || 0) + r.t.amount); o.applied = [...(o.applied || []), r.t.id]; }) }, 'Apply') }], sugg.slice(0, 15))));
    return out;
  }

  function render() {
    reg.clear();
    root.replaceChildren();
    const data = ctx.data;
    const today = todayIso();
    const sub = SUBS.some((s) => s[0] === route()) ? route() : 'networth';
    root.append(subnav(SUBS, sub, go));
    try { for (const el of { networth, investments, debts }[sub](data, today)) root.append(el); } catch (err) { root.append(card('Something went wrong drawing this page', note(err.message))); }
  }

  return { render };
}
