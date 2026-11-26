// Goals: a card per goal with its balance, target, % done, deadline, what each payday needs, when you'll get there,
// a progress history and where it's saved; plus what-if sliders. Growth rates are assumptions you choose:
// investments can go down as well as up. Not financial advice.
import { h } from '../ui/dom.js';
import { formatPence, parsePence } from '../lib/money.js';
import { projectGoal, neededMonthly } from '../lib/analytics.js';
import { head, shortDay, bar, alertLine } from '../ui/parts.js';
import { lineChart } from '../ui/charts.js';
import { saveGoal, deleteGoal } from '../lib/data.js';
import { goalProgress, ago } from '../lib/planning.js';
import { fundsOf } from './state.js';

// What's saved towards a goal: its linked sinking fund's balance, or its linked account's latest balance.
export function savedFor(ctx, g) {
  if (g.sinking_fund_id) return fundsOf(ctx).find((f) => f.id === g.sinking_fund_id)?.balance_pence || 0;
  if (g.account_id) { const snaps = ctx.ref.snapshots.filter((s) => s.account_id === g.account_id); return snaps.length ? snaps[snaps.length - 1].balance_pence : 0; }
  return 0;
}

// Balances over time for the account or sinking fund a goal is linked to (oldest first).
export function historyFor(ctx, g) {
  if (g.account_id) return ctx.ref.snapshots.filter((x) => x.account_id === g.account_id).map((x) => ({ date: x.date, pence: x.balance_pence }));
  if (g.sinking_fund_id) {
    const f = fundsOf(ctx).find((x) => x.id === g.sinking_fund_id);
    if (f?.mirrors) return historyFor(ctx, { account_id: f.mirrors.id });
    const hist = [...(ctx.ref.settings?.extra?.fund_history?.[g.sinking_fund_id] || [])];
    if (f?.balance_date && !hist.some((x) => x.date === f.balance_date)) hist.push({ date: f.balance_date, pence: f.balance_pence || 0 });
    return hist.sort((a, b) => a.date.localeCompare(b.date));
  }
  return [];
}
const linkName = (ctx, g) => (g.sinking_fund_id ? `${ctx.ref.funds.find((f) => f.id === g.sinking_fund_id)?.name || 'A sinking fund'} (pot)` : g.account_id ? ctx.ref.accounts.find((a) => a.id === g.account_id)?.name || 'An account' : 'Not linked');
const STATUS = { reached: ['Reached', 'var(--good)'], 'on track': ['On track', 'var(--good)'], behind: ['Behind', 'var(--warning)'], 'no deadline': ['No deadline', 'var(--accent)'], 'needs a plan': ['Needs a monthly amount', 'var(--warning)'] };

export function goalsPage(ctx, rerender) {
  const what = ctx.whatIf || (ctx.whatIf = {});
  const card = (g) => {
    const saved = savedFor(ctx, g);
    const growth = Number(g.growth_rate) || 0;
    const now = projectGoal({ target: g.target_pence, saved, monthly: g.monthly_pence, growthPct: growth }, ctx.today);
    const need = neededMonthly(g.target_pence, saved, ctx.today, g.target_date);
    const history = historyFor(ctx, g);
    const gp = goalProgress({ target: g.target_pence, saved, date: g.target_date, monthly: g.monthly_pence, history, today: ctx.today });
    const status = STATUS[gp.status];
    const last = history[history.length - 1];
    const w = what[g.id] || (what[g.id] = { monthly: g.monthly_pence, growth, lump: 0 });
    const alt = projectGoal({ target: g.target_pence, saved, monthly: w.monthly, growthPct: w.growth, lump: w.lump }, ctx.today);
    const slider = (label, key, max, step, fmt) => h('label', { class: 'slider' }, h('span', null, label, h('b', null, fmt(w[key]))),
      h('input', { type: 'range', min: 0, max, step, value: w[key], oninput: (e) => { w[key] = Number(e.target.value); rerender(); } }));
    const len = Math.max(now.series.length, alt.series.length);
    const pad = (arr) => Array.from({ length: len }, (_, i) => (i < arr.length ? arr[i] : null));
    void need; void now;
    return h('section', { class: 'card goalcard', 'aria-label': g.name },
      h('div', { class: 'ch' }, h('h2', null, g.name), h('span', { class: 'gstatus small', style: { color: status[1], borderColor: status[1] } }, status[0])),
      h('p', { class: 'muted small', style: { margin: '-4px 0 10px' } }, `Saved in: ${linkName(ctx, g)}${last ? ` · balance updated ${ago(last.date, ctx.today)}` : ''}`),
      h('div', { class: 'gtop' },
        h('div', null, h('span', { class: 'gpct display' }, `${gp.pct}%`), h('span', { class: 'muted small' }, ' done')),
        h('div', { class: 'r' }, h('span', { class: 'display', style: { fontSize: '20px', fontWeight: 600 } }, formatPence(saved)), h('br'), h('span', { class: 'muted small' }, `of ${formatPence(g.target_pence)} · ${formatPence(gp.left)} to go`))),
      h('div', { class: 'gbar' }, bar(saved / g.target_pence, { colour: 'var(--good)', label: `${gp.pct}% of ${formatPence(g.target_pence)}` })),
      h('div', { class: 'ggrid' },
        h('div', null, h('span', { class: 'muted small' }, 'Deadline'), h('strong', null, g.target_date ? `${shortDay(g.target_date)} ${g.target_date.slice(0, 4)}` : 'None set')),
        h('div', null, h('span', { class: 'muted small' }, 'Each payday needs'), h('strong', null, gp.perPayday === null ? '–' : formatPence(gp.perPayday))),
        h('div', null, h('span', { class: 'muted small' }, 'You plan to put in'), h('strong', null, g.monthly_pence ? `${formatPence(g.monthly_pence)} a payday` : 'Nothing yet')),
        h('div', null, h('span', { class: 'muted small' }, 'Expected to finish'), h('strong', null, gp.expected ? `${shortDay(gp.expected)} ${gp.expected.slice(0, 4)}` : 'Not at this rate'), gp.rateSource === 'recent pace' ? h('span', { class: 'muted small' }, `at your recent pace of ${formatPence(gp.pace)} a month`) : null)),
      history.length >= 2 ? h('div', { class: 'ghist' }, h('h3', { class: 'small-h' }, 'Progress'), lineChart({ labels: history.map((x) => shortDay(x.date)), series: [{ name: 'Balance', colour: '#5BD6A0', values: history.map((x) => x.pence) }], label: `${g.name}: balance over time` }))
        : h('p', { class: 'muted small' }, history.length === 1 ? `One balance so far (${formatPence(history[0].pence)} on ${shortDay(history[0].date)}). Update it on money day and the progress line builds up.` : 'No balance history yet: link it to an account or pot and update the balance on money day.'),
      growth ? h('p', { class: 'muted small' }, `Assumes ${growth}% yearly growth, which is not guaranteed.`) : null,
      h('details', { class: 'whatif' }, h('summary', null, 'What if…'),
        slider('Monthly amount', 'monthly', Math.max(50000, g.monthly_pence * 3), 500, (v) => formatPence(v)),
        slider('Yearly growth (an assumption)', 'growth', 10, 0.5, (v) => `${v}%`),
        slider('Lump sum now', 'lump', g.target_pence, 1000, (v) => formatPence(v)),
        h('p', { style: { margin: '8px 0' } }, alt.date ? `Reached ${shortDay(alt.date)} ${alt.date.slice(0, 4)}${now.months && alt.months ? ` (${now.months - alt.months >= 0 ? `${now.months - alt.months} months sooner` : `${alt.months - now.months} months later`})` : ''}.` : 'Never reached at this rate.'),
        lineChart({ labels: Array.from({ length: len }, (_, i) => (i % 6 === 0 ? `${i}m` : '')), series: [{ name: 'Current plan', colour: '#8E99A8', values: pad(now.series) }, { name: 'What if', colour: '#8B9CFF', values: pad(alt.series) }], label: `${g.name}: current plan against what if` }),
        h('p', { class: 'muted small' }, 'Growth is an assumption, not a promise: investments can go down as well as up. This is a planning tool, not financial advice.'),
        h('button', { class: 'btn', type: 'button', onclick: async (e) => { try { const saved2 = await saveGoal({ id: g.id, monthly_pence: w.monthly, growth_rate: w.growth }); ctx.ref.goals = ctx.ref.goals.map((x) => (x.id === saved2.id ? saved2 : x)); rerender(); } catch (err) { alertLine(e.currentTarget, err.message); } } }, 'Use these as my plan')),
      h('button', { class: 'linkbtn', type: 'button', onclick: async (e) => { const b = e.currentTarget; if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Tap again to delete'; return; } await deleteGoal(g.id); ctx.ref.goals = ctx.ref.goals.filter((x) => x.id !== g.id); rerender(); } }, 'Delete goal'));
  };

  // ---- new goal
  const name = h('input', { class: 'input', placeholder: 'e.g. House deposit', 'aria-label': 'Goal name' });
  const target = h('input', { class: 'input money', inputmode: 'decimal', placeholder: 'Target £', 'aria-label': 'Target amount' });
  const date = h('input', { class: 'input', type: 'date', 'aria-label': 'Target date' });
  const monthly = h('input', { class: 'input money', inputmode: 'decimal', placeholder: '£ a month', 'aria-label': 'Monthly amount' });
  const growth = h('input', { class: 'input', type: 'number', min: 0, max: 15, step: 0.5, placeholder: 'Growth %', 'aria-label': 'Expected yearly growth (0 for cash)' });
  const link = h('select', { class: 'input', 'aria-label': 'Where it’s saved' }, h('option', { value: '' }, 'Where it’s saved…'),
    h('optgroup', { label: 'Sinking funds' }, (ctx.ref.funds || []).map((f) => h('option', { value: `f:${f.id}` }, f.name))),
    h('optgroup', { label: 'Accounts' }, ctx.ref.accounts.map((a) => h('option', { value: `a:${a.id}` }, a.name))));
  const add = h('button', { class: 'btn primary', type: 'button', onclick: async () => {
    const t = parsePence(target.value);
    if (!name.value.trim() || !t || t <= 0) { alertLine(add, 'Give it a name and a target amount.'); return; }
    try {
      const g = await saveGoal({ name: name.value.trim(), target_pence: t, target_date: date.value || null, monthly_pence: parsePence(monthly.value) || 0, growth_rate: Number(growth.value) || 0,
        sinking_fund_id: link.value.startsWith('f:') ? link.value.slice(2) : null, account_id: link.value.startsWith('a:') ? link.value.slice(2) : null });
      ctx.ref.goals = [...ctx.ref.goals, g];
      rerender();
    } catch (err) { alertLine(add, err.message); }
  } }, 'Add goal');

  return h('div', { class: 'page' },
    head('Goals', ctx.ref.goals.length ? 'How much each goal needs, and when you’ll get there.' : 'Set a goal with a date and Money HQ shows what it needs each payday.'),
    ctx.ref.goals.length ? h('div', { class: 'grid2' }, ctx.ref.goals.map(card)) : h('section', { class: 'card empty-card' },
      h('h2', null, 'No goals yet'),
      h('p', { class: 'muted', style: { margin: 0 } }, 'A goal is a target with a date, like an emergency fund of £3,000 by next December. Link it to the account or pot it’s saved in and Money HQ shows how far along you are, what each payday needs, and when you’ll get there. Add your first one below.')),
    h('section', { class: 'card', 'aria-labelledby': 'ng' }, h('h2', { id: 'ng' }, 'New goal'),
      h('div', { class: 'edit-grid' }, name, target, date, monthly, growth, link, add)));
}
