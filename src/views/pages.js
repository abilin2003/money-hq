// Phase 1 pages: Overview (cycle line and what's loaded), Transactions (by pay cycle), More, and placeholders.
import { h } from '../ui/dom.js';
import { formatPence } from '../lib/money.js';
import { cycleFor, cycleList, cycleName } from '../lib/cycles.js';
import { PAGES } from '../ui/shell.js';

const dayLabel = (iso, opts = { weekday: 'short', day: 'numeric', month: 'short' }) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' });
const shortDay = (iso) => dayLabel(iso, { day: 'numeric', month: 'short' });
const inCycle = (t, c) => { const d = t.cycle_date || t.date; return d >= c.start && d <= c.end; };
// "Snacks & drinks (Fun)" in bucket Fun -> "Snacks & drinks, Fun"; "Groceries" in Groceries -> "Groceries".
export function categoryLabel(name, bucket) {
  if (!bucket) return name;
  const plain = name.replace(` (${bucket})`, '');
  return plain === bucket ? plain : `${plain}, ${bucket}`;
}
const KIND_LABEL ={ transfer: 'Transfer', saved: 'Saved', invested: 'Invested', income: 'Income', repayment: 'Paid back', refund: 'Refund' };

function head(title, line, ...actions) {
  return h('div', { class: 'page-head' }, h('div', null, h('h1', { class: 'display' }, title), line ? h('p', { class: 'muted' }, line) : null),
    actions.length ? h('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap' } }, actions) : null);
}

export function cyclesFor(ctx) {
  const first = ctx.transactions.map((t) => t.date).sort()[0] || ctx.today;
  return cycleList(ctx.settings?.paydays || [], first, ctx.today, ctx.settings?.payday_usual_day || 24);
}

export function overviewPage(ctx) {
  const c = cycleFor(ctx.today, ctx.settings?.paydays || [], ctx.settings?.payday_usual_day || 24);
  const now = ctx.transactions.filter((t) => inCycle(t, c));
  const cycles = cyclesFor(ctx);
  const last = cycles.find((x) => x.end < c.start);
  const lastTx = last ? ctx.transactions.filter((t) => inCycle(t, last)) : [];
  const lastSpend = lastTx.filter((t) => t.kind === 'spend' && t.status === 'reviewed').reduce((a, t) => a - t.amount_pence, 0);
  const review = ctx.transactions.filter((t) => t.status === 'needs_review').length;

  return h('div', { class: 'page' },
    head('Overview', `Cycle ${shortDay(c.start)} to ${shortDay(c.end)}. Day ${c.dayNumber} of ${c.totalDays}.`),
    h('div', { class: 'grid2' },
      h('section', { class: 'card', 'aria-labelledby': 'this-cycle' },
        h('h2', { id: 'this-cycle' }, `This cycle (${cycleName(c)})`),
        // Rule 11: never invent reassurance. No transactions means saying so.
        h('p', { style: { margin: 0 } }, now.length ? `${now.length} transactions so far.` : 'No spending yet this cycle.'),
        h('p', { class: 'muted', style: { margin: '6px 0 0', fontSize: '13px' } },
          `Next payday ${dayLabel(c.next, { weekday: 'short', day: 'numeric', month: 'short' })}${c.predicted ? ' (predicted)' : ''}, in ${c.daysLeft + 1} days. Safe to spend arrives with the budget engine in Phase 4.`)),
      last ? h('section', { class: 'card', 'aria-labelledby': 'last-cycle' },
        h('h2', { id: 'last-cycle' }, `Last cycle (${last.name})`),
        h('div', { class: 'stats' },
          h('div', null, h('span', { class: 'muted' }, 'Dates'), h('span', null, `${shortDay(last.start)} to ${shortDay(last.end)}`)),
          h('div', null, h('span', { class: 'muted' }, 'Transactions'), h('span', null, String(lastTx.length))),
          h('div', null, h('span', { class: 'muted' }, 'Spent (before paybacks)'), h('span', null, formatPence(lastSpend)))),
        h('p', { style: { margin: '12px 0 0' } }, h('a', { href: `#transactions/${last.start}` }, 'See every transaction'))) : null),
    h('section', { class: 'card', 'aria-labelledby': 'loaded' },
      h('h2', { id: 'loaded' }, 'Your data'),
      h('div', { class: 'stats' },
        h('div', null, h('span', { class: 'muted' }, 'Live transactions'), h('span', null, String(ctx.counts.live))),
        h('div', null, h('span', { class: 'muted' }, 'Archived history (stored, not counted)'), h('span', null, String(ctx.counts.archived))),
        h('div', null, h('span', { class: 'muted' }, 'Waiting for your decision'), h('span', null, String(review))))));
}

export function transactionsPage(ctx, param) {
  const cycles = cyclesFor(ctx);
  const c = cycles.find((x) => x.start === param) || cycles.find((x) => ctx.transactions.some((t) => inCycle(t, x))) || cycles[0];
  const list = ctx.transactions.filter((t) => inCycle(t, c));
  const picker = h('select', { class: 'input', id: 'cycle', 'aria-label': 'Pay cycle', style: { width: 'auto', minWidth: '260px' }, onchange: (e) => { location.hash = `transactions/${e.target.value}`; } },
    cycles.map((x) => h('option', { value: x.start, selected: x.start === c.start }, `${x.name} cycle (${shortDay(x.start)} to ${shortDay(x.end)})`)));

  const groups = new Map();
  for (const t of list) { const k = t.date; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(t); }
  const row = (t) => {
    const bucket = t.category?.bucket;
    const kind = KIND_LABEL[t.kind];
    return h('div', { class: 'tx' },
      h('span', { class: 'desc', title: t.raw_description }, t.raw_description || '(no description)'),
      h('span', { class: `amt${t.amount_pence > 0 ? ' in' : ''}` }, `${t.amount_pence > 0 ? '+' : ''}${formatPence(Math.abs(t.amount_pence))}`),
      h('span', { class: 'meta' },
        bucket ? h('span', { class: 'dot', style: { background: bucket.colour || 'var(--muted)' }, 'aria-hidden': 'true' }) : null,
        // "Snacks & drinks (Fun)" + bucket Fun reads as "Snacks & drinks, Fun" (Phase 2 merges these names properly).
        t.category ? categoryLabel(t.category.name, bucket?.name) : (kind || 'No category'),
        h('span', null, `· ${t.account?.name || 'Unknown account'}`),
        t.status === 'needs_review' ? h('span', { class: 'tag review' }, 'Needs review') : null,
        t.note ? h('span', { class: 'tag' }, t.note) : null));
  };

  return h('div', { class: 'page' },
    head('Transactions', `${list.length} in the ${c.name} cycle, ${shortDay(c.start)} to ${shortDay(c.end)}.`, picker),
    h('section', { class: 'card', 'aria-label': 'Transactions' },
      list.length
        ? [...groups].map(([date, txs]) => h('div', { class: 'txgroup' }, h('h3', null, dayLabel(date)), txs.map(row)))
        : h('p', { class: 'muted', style: { margin: 0 } }, 'No transactions in this cycle yet.')));
}

export function morePage(ctx) {
  const extra = [...PAGES.filter((p) => !['overview', 'transactions', 'budgets'].includes(p.id)), { id: 'settings', label: 'Settings' }];
  return h('div', { class: 'page' },
    head('More', ctx.email),
    h('section', { class: 'card', 'aria-label': 'More pages' },
      h('div', { class: 'stats' }, extra.map((p) => h('div', null, h('a', { href: `#${p.id}`, style: { minHeight: '28px', display: 'flex', alignItems: 'center' } }, p.label)))),
      h('button', { class: 'btn', type: 'button', style: { marginTop: '16px', width: '100%' }, onclick: ctx.signOut }, 'Sign out')));
}

const COMING = { budgets: 4, trends: 7, goals: 6, wealth: 6, plan: 4, settings: 4, add: 5 };
export function placeholderPage(id) {
  const label = id === 'add' ? 'Add a transaction' : (PAGES.find((p) => p.id === id)?.label || 'Settings');
  return h('div', { class: 'page' }, head(label),
    h('section', { class: 'card' }, h('p', { class: 'muted', style: { margin: 0 } }, COMING[id] ? `This screen is built in Phase ${COMING[id]} of the plan.` : 'This screen doesn’t exist yet.')));
}
