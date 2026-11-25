// Finance HQ: the home screen. A calm summary first (status, then three headline numbers), then the detail.
// It answers: how much do I have, how much can I safely spend, where is my money going, and am I improving?
// Cards can be reordered and hidden with Customise.
import { h, fmtDay, plural } from '../ui.js';
import { todayIso, dayDiff, addDays } from '../money.js';
import { cycleSummary } from '../insights.js';
import { dashboardSummary, monthLabel } from '../dashboard.js';
import { accountsSummary, netWorthSeries, budgetStatus, safeSpend, goalForecast, healthScore, calendarEvents, owedSummary } from '../finance.js';
import { insights } from '../advice.js';
import { card, meter, insightCard, gbp0, gbp2, plot, cfg, createRegistry, note, emptyState, grid, tip } from '../kit.js';

const DEFAULT_ORDER = ['status', 'kpis', 'budgets', 'bills', 'networth', 'goals', 'trend', 'insights', 'safe', 'accounts', 'health'];
const DEFAULT_HIDDEN = ['safe', 'accounts', 'health']; // the detail is still one tap away under Customise
const TITLES = { status: 'Today', kpis: 'Headline numbers', budgets: 'Budgets', bills: 'Coming up', networth: 'Net worth', goals: 'Goals', trend: 'Money in and out', insights: 'Insights', safe: 'Safe to spend (detail)', accounts: 'Accounts', health: 'Financial health' };

const when = (today, iso) => { const n = dayDiff(today, iso); return n <= 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`; };
const dayLabel = (iso) => fmtDay(iso).slice(0, -5);

export function initHQ(ctx, root) {
  const reg = createRegistry();
  let editing = false;

  function env() {
    const data = ctx.data;
    const today = todayIso();
    const bs = budgetStatus(data, today);
    return {
      data, today, bs, safe: safeSpend(data, today), acc: accountsSummary(data.accounts), nw: netWorthSeries(data, today),
      dash: dashboardSummary(data, {}), ins: insights(data, today), health: healthScore(data, today),
      prev: cycleSummary(data, addDays(bs.period.start, -1)),
    };
  }

  const widgets = {
    status(e) {
      const { status, period: p } = e.bs;
      const hour = new Date().getHours();
      const hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
      const dateText = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
      const left = dayDiff(e.today, p.next);
      return h('section', { class: `card hqhead level-${status.level}` },
        h('div', null,
          h('p', { class: 'eyebrow' }, `${hello} · ${dateText}`),
          h('h2', { class: 'hq-title' }, h('span', { class: 'hq-dot', 'aria-hidden': 'true' }), status.headline),
          h('p', { class: 'hq-sub' }, status.reason),
          p.missing ? tip('Your next payday has not been entered, so the end of this cycle is a best guess. Add it in Settings.') : null),
        h('div', { class: 'hqhead-side' },
          h('div', { class: 'pill' }, left <= 0 ? 'Payday today' : left === 1 ? 'Payday tomorrow' : `Payday in ${left} days`, h('small', null, `${fmtDay(p.next)} · day ${p.dayNumber} of ${p.totalDays}`)),
          meter((p.dayNumber / p.totalDays) * 100, 'ok', 'Progress through this pay cycle')));
    },

    // Three headline numbers: what you have, what you can spend, what you have spent.
    kpis(e) {
      const { acc, safe, bs, nw } = e;
      const have = acc.count > 0;
      const last = nw[nw.length - 1];
      const prev = nw[nw.length - 2];
      // On payday the new cycle is empty, so show how the cycle that just ended went instead of a row of zeros.
      const fresh = !bs.through && !!e.prev.through;
      const shown = fresh ? e.prev.totals : bs.totals;
      const pct = shown.budget > 0 ? (shown.net / shown.budget) * 100 : 0;
      return h('div', { class: 'tiles' },
        h('div', { class: 'tile' }, h('span', { class: 'tl' }, 'Net worth'), h('span', { class: 'tv' }, have ? gbp0(acc.netWorth) : '—'),
          have ? (prev ? h('span', { class: `ts ${last.change >= 0 ? 'up' : 'down'}` }, `${last.change >= 0 ? '+' : '-'}${gbp0(Math.abs(last.change))} since ${dayLabel(prev.date)}`) : h('span', { class: 'ts' }, `${gbp0(acc.assets)} assets · ${gbp0(acc.liabilities)} debts`))
            : h('a', { class: 'link-btn', href: '#settings/accounts' }, 'Add your accounts')),
        h('div', { class: 'tile' }, h('span', { class: 'tl' }, 'Safe to spend until payday'), h('span', { class: 'tv' }, gbp0(safe.total)),
          h('span', { class: 'ts' }, safe.total > 0 ? `About ${gbp2(safe.perDay)} a day for ${plural(safe.days, 'day')}` : 'Nothing spare this cycle')),
        h('div', { class: 'tile' }, h('span', { class: 'tl' }, fresh ? 'Last pay cycle' : 'Spent this cycle'), h('span', { class: 'tv' }, gbp0(shown.net)),
          h('span', { class: 'ts' }, shown.budget > 0 ? `of ${gbp0(shown.budget)} in budgets${fresh ? ' · a new cycle has just begun' : ''}` : 'No budgets set yet'), shown.budget > 0 ? meter(pct, pct > 100 ? 'over' : pct >= 90 ? 'near' : 'ok', 'Spent against budgets') : null));
    },

    budgets(e) {
      const b = e.bs.buckets;
      if (!b.length) return card('Budgets', emptyState('No budgets are set yet.', 'Set budgets', '#spending/budgets'));
      return card('Budgets',
        h('div', { class: 'brows' }, b.map((x) => {
          const level = x.over > 0 ? 'over' : x.pct >= 90 ? 'near' : 'ok';
          const flag = x.over > 0 ? `${gbp0(x.over)} over` : x.willExceed && x.net > 0 ? `heading for ${gbp0(x.projected)}` : '';
          return h('div', { class: 'brow' },
            h('div', { class: 'brow-top' }, h('span', { class: 'bname' }, h('span', { class: 'cdot', style: `background:${x.color || '#8794ff'}`, 'aria-hidden': 'true' }), x.name), h('span', { class: `bsum ${level}` }, `${gbp0(x.net)} / ${gbp0(x.budget)}`)),
            meter(x.pct, level, x.name),
            flag ? h('p', { class: 'bnote' }, flag) : null);
        })),
        h('a', { class: 'link-btn', href: '#spending/budgets' }, 'Manage budgets'));
    },

    networth(e) {
      const pts = e.nw;
      if (!pts.length) return card('Net worth', emptyState('Add your accounts and balances to see your net worth.', 'Add accounts', '#settings/accounts'));
      const last = pts[pts.length - 1];
      const first = pts[0];
      const acc = e.acc;
      const body = [
        h('p', { class: 'muted' }, pts.length > 1 ? `${last.change >= 0 ? 'Up' : 'Down'} ${gbp0(Math.abs(last.change))} since ${dayLabel(pts[pts.length - 2].date)}${first.netWorth ? `, ${Math.round(((last.netWorth - first.netWorth) / Math.abs(first.netWorth)) * 100)}% since ${dayLabel(first.date)}` : ''}.` : 'Save a snapshot each month and the growth shows up here.')];
      if (pts.length > 1) body.push(plot(reg, 'Net worth over time', () => cfg.lines(pts.map((p) => dayLabel(p.date)), [{ label: 'Net worth', data: pts.map((p) => p.netWorth), color: '#2ee6b6', fill: true }], { zero: false }), 150));
      body.push(h('div', { class: 'chiprow' }, h('span', null, 'Cash & savings', h('b', null, gbp0(acc.accessible))), h('span', null, 'Investments', h('b', null, gbp0(acc.investments + acc.pension))), acc.debt > 0 ? h('span', null, 'Debt', h('b', null, gbp0(acc.debt))) : null));
      return card('Net worth', ...body, h('a', { class: 'link-btn', href: '#wealth' }, 'Open net worth'));
    },

    accounts(e) {
      const list = e.data.accounts;
      if (!list.length) return card('Accounts', emptyState('No accounts yet. Add your banks, savings, investments and cards.', 'Add accounts', '#settings/accounts'));
      return card('Accounts', h('dl', { class: 'facts' }, list.map((a) => {
        const stale = a.updated && dayDiff(a.updated, e.today) > 35;
        return h('div', null, h('dt', null, a.name, stale ? h('span', { class: 'badge b-unsure' }, 'update') : null), h('dd', null, a.type === 'credit' || a.type === 'loan' ? `-${gbp0(a.balance)}` : gbp0(a.balance)));
      })), note('Balances are the figures you entered, not live bank data.'));
    },

    goals(e) {
      const goals = e.data.goals;
      if (!goals.length) return card('Goals', emptyState('No savings goals yet.', 'Add a goal', '#savings'));
      return card('Goals', h('div', { class: 'brows' }, goals.slice().sort((a, b) => (a.priority || 3) - (b.priority || 3)).slice(0, 4).map((g) => {
        const f = goalForecast(g, e.today);
        return h('div', { class: 'brow' },
          h('div', { class: 'brow-top' }, h('span', { class: 'bname' }, g.name), h('span', { class: 'bsum' }, `${f.pct}%`)),
          meter(f.pct, f.status === 'behind' || f.status === 'stalled' ? 'near' : 'ok', g.name),
          h('p', { class: 'bnote' }, f.status === 'done' ? 'Reached' : f.status === 'stalled' ? 'Add a monthly amount to see a date' : `${gbp0(g.balance)} of ${gbp0(g.target)} · ${f.status === 'behind' ? 'behind your target date' : `on course for ${dayLabel(f.projected)}`}`));
      })), h('a', { class: 'link-btn', href: '#savings' }, 'Open goals'));
    },

    bills(e) {
      const end = addDays(e.today, 14);
      const months = [...new Set([e.today.slice(0, 7), end.slice(0, 7)])];
      const ev = months.flatMap((m) => calendarEvents(e.data, m)).filter((x) => x.date >= e.today && x.date <= end && x.type !== 'saving').slice(0, 6);
      const owed = owedSummary(e.data.owed, e.today);
      return card('Coming up',
        ev.length ? h('div', { class: 'txlist' }, ev.map((x) => h('div', { class: 'txrow static' },
          h('div', { class: 'tx-main' }, h('b', null, x.label), h('span', { class: 'tx-meta' }, `${dayLabel(x.date)} · ${when(e.today, x.date)}`)),
          h('div', { class: 'tx-right' }, x.amount ? h('span', { class: 'amt' }, gbp0(x.amount)) : null)))) : h('p', { class: 'empty' }, 'Nothing due in the next two weeks.'),
        owed.outstanding > 0 ? h('p', { class: 'muted' }, `${gbp0(owed.outstanding)} is owed to you by ${plural(owed.count, 'person', 'people')}.`) : null,
        h('a', { class: 'link-btn', href: '#planning/calendar' }, 'Open the calendar'));
    },

    health(e) {
      const hs = e.health;
      return card('Financial health',
        h('div', { class: 'big' }, hs.score === null ? '—' : `${hs.score}/100`), h('p', { class: 'lead' }, hs.label),
        h('div', { class: 'brows' }, hs.parts.map((p) => h('div', { class: 'brow' }, h('div', { class: 'brow-top' }, h('span', { class: 'bname' }, p.name), h('span', { class: 'bsum' }, p.score === null ? 'not enough data' : `${p.score}`)), p.score === null ? null : meter(p.score, p.score >= 75 ? 'ok' : p.score >= 50 ? 'near' : 'over', p.name)))),
        h('details', null, h('summary', null, 'How is this calculated?'), h('p', { class: 'muted' }, hs.how), h('ul', { class: 'plain' }, hs.parts.map((p) => h('li', null, h('b', null, `${p.name}: `), p.note)))));
    },

    insights(e) {
      return card('Insights', h('div', { class: 'insights' }, e.ins.slice(0, 3).map(insightCard)), h('a', { class: 'link-btn', href: '#planning/insights' }, 'All insights and the monthly review'));
    },

    trend(e) {
      if (e.dash.empty) return card('Money in and out', h('p', { class: 'empty' }, 'No data yet.'));
      const rows = e.dash.perMonth.slice(-6);
      return card('Money in and out', plot(reg, 'Money in, spent and invested over the last six months', () => cfg.bars(rows.map((r) => monthLabel(r.month)),
        [{ label: 'In', data: rows.map((r) => r.income), color: '#2ee6b6' }, { label: 'Spent', data: rows.map((r) => r.spent), color: '#ff6683' }, { label: 'Invested', data: rows.map((r) => r.invested), color: '#4cc9ff' }]), 220));
    },

    // The detailed safe-to-spend working, for anyone who wants to see it.
    safe(e) {
      const s = e.safe;
      return card('Safe to spend until payday',
        h('div', { class: 'big' }, gbp0(s.total)),
        h('p', { class: 'lead' }, s.total > 0 ? `About ${gbp2(s.perDay)} a day (${gbp2(s.perWeek)} a week) for ${plural(s.days, 'day')}.` : 'Nothing is left to spend safely this cycle.'),
        h('dl', { class: 'facts' }, s.parts.filter((p) => p.amount !== 0 || p.label === 'Left in your budgets').map((p) => h('div', null, h('dt', null, p.label), h('dd', null, p.amount < 0 ? `-${gbp0(-p.amount)}` : gbp0(p.amount))))),
        note('An estimate from your budgets, bills and any card payments due. It is not a bank balance.'));
    },
  };

  const layout = () => {
    const w = ctx.data.settings.widgets || {};
    const saved = w.order || [];
    const order = [...saved.filter((id) => DEFAULT_ORDER.includes(id)), ...DEFAULT_ORDER.filter((id) => !saved.includes(id))];
    return { order, hidden: w.customised ? (w.hidden || []) : DEFAULT_HIDDEN };
  };
  const save = (order, hidden) => ctx.update((d) => { d.settings.widgets = { order, hidden, customised: true }; });

  function render() {
    reg.clear();
    root.replaceChildren();
    root.classList.toggle('editing', editing);
    const data = ctx.data;
    if (!data.transactions.length && !data.accounts.length) {
      root.append(card('Welcome to Money HQ', note('This is your financial control centre. Bring your transactions in, or add your accounts, and every page here fills itself in.', 'lead'),
        h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', onclick: () => { location.hash = 'import'; } }, 'Bring my data in'),
          h('button', { class: 'btn ghost', type: 'button', onclick: () => { location.hash = 'settings/accounts'; } }, 'Add my accounts'),
          h('button', { class: 'btn ghost', type: 'button', onclick: () => ctx.enterDemo() }, 'See it with demo data')),
        note('Demo mode fills every page with obviously fake figures so you can see how it looks. Nothing is saved.')));
      return;
    }
    const e = env();
    const { order, hidden } = layout();
    root.append(h('div', { class: 'hqbar' }, h('span', { class: 'muted hq-more' }, `${plural(data.transactions.length, 'transaction')} · ${plural(data.accounts.length, 'account')}`),
      h('button', { class: 'link-btn', type: 'button', onclick: () => { editing = !editing; render(); } }, editing ? 'Done' : 'Customise')));
    for (const id of order) {
      if (hidden.includes(id) && !editing) continue;
      let el;
      try { el = widgets[id](e); } catch (err) { el = card(TITLES[id], note(`This card could not be drawn: ${err.message}`)); }
      el.dataset.w = id;
      if (editing) {
        const i = order.indexOf(id);
        const move = (d) => { const o = order.slice(); [o[i], o[i + d]] = [o[i + d], o[i]]; save(o, hidden); };
        root.append(h('div', { class: `wedit ${hidden.includes(id) ? 'off' : ''}` },
          h('b', null, TITLES[id]),
          h('div', { class: 'actions' },
            h('button', { class: 'btn ghost small', type: 'button', disabled: i === 0, 'aria-label': `Move ${TITLES[id]} up`, onclick: () => move(-1) }, 'Up'),
            h('button', { class: 'btn ghost small', type: 'button', disabled: i === order.length - 1, 'aria-label': `Move ${TITLES[id]} down`, onclick: () => move(1) }, 'Down'),
            h('button', { class: 'btn ghost small', type: 'button', onclick: () => save(order, hidden.includes(id) ? hidden.filter((x) => x !== id) : [...hidden, id]) }, hidden.includes(id) ? 'Show' : 'Hide'))));
        if (!hidden.includes(id)) root.append(el);
      } else root.append(el);
    }
  }

  return { render };
}
