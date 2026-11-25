// Goals with dates: how much each needs per payday, whether it's on track, and what-if sliders (kept from the
// old app). Growth rates are assumptions you choose: investments can go down as well as up. Not financial advice.
import { h } from '../ui/dom.js';
import { formatPence, parsePence } from '../lib/money.js';
import { projectGoal, neededMonthly } from '../lib/analytics.js';
import { head, shortDay, bar, alertLine } from '../ui/parts.js';
import { lineChart } from '../ui/charts.js';
import { saveGoal, deleteGoal } from '../lib/data.js';

// What's saved towards a goal: its linked sinking fund's balance, or its linked account's latest balance.
export function savedFor(ctx, g) {
  if (g.sinking_fund_id) return ctx.ref.funds.find((f) => f.id === g.sinking_fund_id)?.balance_pence || 0;
  if (g.account_id) { const snaps = ctx.ref.snapshots.filter((s) => s.account_id === g.account_id); return snaps.length ? snaps[snaps.length - 1].balance_pence : 0; }
  return 0;
}

export function goalsPage(ctx, rerender) {
  const what = ctx.whatIf || (ctx.whatIf = {});
  const card = (g) => {
    const saved = savedFor(ctx, g);
    const growth = Number(g.growth_rate) || 0;
    const now = projectGoal({ target: g.target_pence, saved, monthly: g.monthly_pence, growthPct: growth }, ctx.today);
    const need = neededMonthly(g.target_pence, saved, ctx.today, g.target_date);
    const status = saved >= g.target_pence ? ['Reached', 'var(--good)'] : !now.date ? ['Needs a monthly amount', 'var(--warning)'] : g.target_date && now.date > g.target_date ? ['Behind', 'var(--warning)'] : ['On track', 'var(--good)'];
    const w = what[g.id] || (what[g.id] = { monthly: g.monthly_pence, growth, lump: 0 });
    const alt = projectGoal({ target: g.target_pence, saved, monthly: w.monthly, growthPct: w.growth, lump: w.lump }, ctx.today);
    const slider = (label, key, max, step, fmt) => h('label', { class: 'slider' }, h('span', null, label, h('b', null, fmt(w[key]))),
      h('input', { type: 'range', min: 0, max, step, value: w[key], oninput: (e) => { w[key] = Number(e.target.value); rerender(); } }));
    const len = Math.max(now.series.length, alt.series.length);
    const pad = (arr) => Array.from({ length: len }, (_, i) => (i < arr.length ? arr[i] : null));
    return h('section', { class: 'card', 'aria-label': g.name },
      h('div', { class: 'ch' }, h('h2', null, g.name), h('span', { class: 'small', style: { color: status[1] } }, status[0])),
      bar(saved / g.target_pence, { colour: 'var(--good)', label: `${formatPence(saved)} of ${formatPence(g.target_pence)}` }),
      h('div', { class: 'stats', style: { marginTop: '10px' } },
        h('div', null, h('span', { class: 'muted' }, 'Saved so far'), h('span', null, `${formatPence(saved)} of ${formatPence(g.target_pence)}`)),
        h('div', null, h('span', { class: 'muted' }, 'You put in'), h('span', null, `${formatPence(g.monthly_pence)} a month${growth ? `, ${growth}% growth (assumed)` : ''}`)),
        h('div', null, h('span', { class: 'muted' }, 'At that rate'), h('span', null, now.date ? `reached ${shortDay(now.date)} ${now.date.slice(0, 4)}` : 'never, without a monthly amount')),
        g.target_date ? h('div', null, h('span', { class: 'muted' }, `Needed to hit ${shortDay(g.target_date)} ${g.target_date.slice(0, 4)}`), h('span', null, `${formatPence(need)} a month`)) : null),
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
    h('div', { class: 'grid2' }, ctx.ref.goals.map(card)),
    h('section', { class: 'card', 'aria-labelledby': 'ng' }, h('h2', { id: 'ng' }, 'New goal'),
      h('div', { class: 'edit-grid' }, name, target, date, monthly, growth, link, add)));
}
