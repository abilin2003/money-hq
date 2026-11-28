// Your accounts: the "My accounts" tiles on the Overview (a row on a laptop, a swipeable strip on a phone), and
// a page for each account (#account/<id>) with its balance, a way to verify it, what the money in it is for,
// recent activity and its balance history. Every figure comes from one calculation (src/lib/balances.js), so a
// balance is the same on every page and every device.
import { h } from '../ui/dom.js';
import { formatPence, parsePence } from '../lib/money.js';
import { head, shortDay, alertLine } from '../ui/parts.js';
import { lineChart } from '../ui/charts.js';
import { addSnapshot, saveFund, saveSettings } from '../lib/data.js';
import { allBalances, accountBalance, trackedNetWorth, allocationsIn } from '../lib/balances.js';
import { kindTag } from './overview.js';
import { fundsOf } from './state.js';
import { ago } from '../lib/planning.js';

const TYPE = { current: 'Current account', credit_card: 'Credit card', savings: 'Savings', isa: 'ISA', investment: 'Investments', pension: 'Pension' };
const tagOf = (b) => (b.status === 'unknown' ? 'not verified' : b.status);
const shown = (b) => (b.value === null ? 'Not entered' : b.isDebt ? (b.pence ? `${formatPence(b.pence)} owed` : formatPence(0)) : formatPence(b.pence));
const subOf = (b, today) => (b.status === 'unknown' ? 'Type a balance to start'
  : b.status === 'verified' ? `Verified ${shortDay(b.verifiedDate)}`
    : b.verifiedDate ? `From ${shortDay(b.verifiedDate)} + ${b.since} line${b.since === 1 ? '' : 's'}` : 'From purchases since the last repayment');

export const balancesOf = (ctx) => allBalances(ctx.ref.accounts, ctx.ref.snapshots || [], ctx.transactions, ctx.today);

// ---- the Overview section
export function myAccounts(ctx) {
  const rows = balancesOf(ctx);
  if (!rows.length) return null;
  const nw = trackedNetWorth(rows);
  return h('section', { class: 'ov-accounts', 'aria-labelledby': 'oa-h' },
    h('div', { class: 'ch' }, h('h2', { id: 'oa-h' }, 'My accounts'),
      h('span', { class: 'muted small' }, nw.status === 'unknown' ? '' : `Net worth ${nw.total < 0 ? '−' : ''}${formatPence(Math.abs(nw.total))}`, nw.status === 'unknown' ? null : kindTag(nw.status === 'verified' ? 'verified' : 'estimated'))),
    h('div', { class: 'acct-strip', role: 'list' }, rows.map((b) => h('a', { class: `acct-tile${b.isDebt && b.pence > 0 ? ' debt' : ''}${b.value === null ? ' unset' : ''}`, href: `#account/${b.account.id}`, role: 'listitem', 'aria-label': `${b.account.name}: ${shown(b)}, ${tagOf(b)}` },
      h('span', { class: 'at-name' }, b.account.name),
      h('span', { class: 'at-bal display' }, shown(b)),
      h('span', { class: 'at-sub' }, kindTag(tagOf(b)), ' ', subOf(b, ctx.today)),
      b.pending.count ? h('span', { class: 'at-pend' }, `${b.pending.count} in inbox`) : null))));
}

// ---- one account's page
export function accountPage(ctx, rerender, id) {
  const a = ctx.ref.accounts.find((x) => x.id === id);
  if (!a) return h('div', { class: 'page' }, head('Account not found'), h('p', null, h('a', { href: '#wealth' }, 'Back to Wealth')));
  const b = accountBalance(a, ctx.ref.snapshots || [], ctx.transactions, ctx.today);
  const debt = b.isDebt;
  const snaps = (ctx.ref.snapshots || []).filter((s) => s.account_id === a.id).sort((x, y) => x.date.localeCompare(y.date));
  const lines = ctx.transactions.filter((t) => t.account_id === a.id).sort((x, y) => y.date.localeCompare(x.date) || 0);
  const pending = lines.filter((t) => t.status === 'needs_review');
  const approved = lines.filter((t) => t.status !== 'needs_review');
  const byId = Object.fromEntries(ctx.all.map((t) => [t.id, t]));
  const st = ctx.acctState?.id === id ? ctx.acctState : (ctx.acctState = { id, saved: null });

  // Verify: type what the bank shows today. Saved as a dated balance; your transactions aren't changed.
  const balIn = h('input', { class: 'input money', inputmode: 'decimal', placeholder: b.pence !== null ? (Math.abs(b.pence) / 100).toFixed(2) : '0.00', 'aria-label': debt ? 'Amount owed today' : 'Balance today' });
  const dateIn = h('input', { class: 'input', type: 'date', value: ctx.today, max: ctx.today, 'aria-label': 'Date of the balance' });
  const verify = h('button', { class: 'btn primary', type: 'button', onclick: async () => {
    const p = parsePence(balIn.value);
    if (p === null || p === undefined || Number.isNaN(p) || (debt && p < 0)) { alertLine(verify, debt ? 'Type what you owe, e.g. 50.00.' : 'Type the balance, e.g. 1250.00 (a minus for overdrawn).'); return; }
    verify.disabled = true;
    try {
      const snap = await addSnapshot(a.id, dateIn.value || ctx.today, debt ? Math.abs(p) : p);
      ctx.ref.snapshots = [...(ctx.ref.snapshots || []).filter((s) => !(s.account_id === snap.account_id && s.date === snap.date)), snap].sort((x, y) => x.date.localeCompare(y.date));
      const diff = b.pence === null ? null : (debt ? Math.abs(p) : p) - b.pence;
      st.saved = diff === null ? 'Balance saved: it’s the starting point from now on.' : diff === 0 ? 'Balance saved: it matches what Money HQ worked out.' : `Balance saved. It’s ${formatPence(Math.abs(diff))} ${diff > 0 ? 'more' : 'less'} than Money HQ worked out, so something may be missing or not imported yet.`;
      rerender();
    } catch (err) { verify.disabled = false; alertLine(verify, err.message); }
  } }, 'Save balance');

  // What the money is for: funds kept in this account, and what's left unallocated. Funds don't change the
  // balance; they say what part of it is for what.
  const funds = fundsOf(ctx).filter((f) => f.account_id === a.id && !f.mirrors);
  const alloc = allocationsIn(a, funds, b.pence);
  const fundRow = (f) => {
    const bal = h('input', { class: 'input money', inputmode: 'decimal', value: ((f.balance_pence || 0) / 100).toFixed(2), 'aria-label': `${f.name}: allocated` });
    const target = h('input', { class: 'input money', inputmode: 'decimal', value: f.target_pence ? (f.target_pence / 100).toFixed(2) : '', placeholder: 'No target', 'aria-label': `${f.name}: target` });
    const save = h('button', { class: 'btn', type: 'button', onclick: async () => {
      const p = parsePence(bal.value); const tg = target.value.trim() ? parsePence(target.value) : 0;
      if (p === null || p < 0 || tg === null || tg < 0) { alertLine(save, 'Type amounts like 2500.00.'); return; }
      save.disabled = true;
      try {
        const saved = await saveFund({ id: f.id, balance_pence: p, balance_date: ctx.today, target_pence: tg });
        ctx.ref.funds = ctx.ref.funds.map((x) => (x.id === saved.id ? saved : x));
        const hist = ctx.ref.settings?.extra?.fund_history || {};
        ctx.ref.settings = await saveSettings(ctx.ref.settings, { extra: { fund_history: { ...hist, [f.id]: [...(hist[f.id] || []).filter((x) => x.date !== ctx.today), { date: ctx.today, pence: p }].sort((x, y) => x.date.localeCompare(y.date)) } } });
        rerender();
      } catch (err) { save.disabled = false; alertLine(save, err.message); }
    } }, 'Save');
    const pct = f.target_pence ? Math.min(100, Math.floor(((f.balance_pence || 0) / f.target_pence) * 100)) : null;
    return h('div', { class: 'alloc-row' }, h('span', { class: 'alloc-name' }, f.name, pct !== null ? h('span', { class: 'muted small' }, ` · ${pct}% of target`) : null),
      h('label', { class: 'field' }, 'Allocated', bal), h('label', { class: 'field' }, 'Target', target), save);
  };
  const allocCard = funds.length || ['savings', 'isa'].includes(a.type) ? h('section', { class: 'card', 'aria-labelledby': 'al-h' },
    h('h2', { id: 'al-h' }, 'What the money is for'),
    h('p', { class: 'muted small', style: { marginTop: 0 } }, 'Funds and goals kept in this account. They don’t change the balance: they say which part of it is for what.'),
    funds.length ? funds.map(fundRow) : h('p', { class: 'muted' }, 'No funds kept here yet. Link a fund to this account in Planning → Manage.'),
    h('div', { class: 'stats', style: { marginTop: '10px' } },
      h('div', null, h('span', { class: 'muted' }, 'Allocated'), h('span', null, formatPence(alloc.allocated))),
      h('div', null, h('span', { class: 'muted' }, 'Not allocated'), h('span', { class: alloc.unallocated !== null && alloc.unallocated < 0 ? 'over' : '' }, alloc.unallocated === null ? '–' : `${alloc.unallocated < 0 ? '−' : ''}${formatPence(Math.abs(alloc.unallocated))}`)))) : null;

  const lineRow = (t) => {
    const other = t.transfer_pair_id ? byId[t.transfer_pair_id] : null;
    return h('div', { class: 'acct-line' },
      h('span', null, h('span', null, t.raw_description || '(no description)'), h('br'),
        h('span', { class: 'muted small' }, `${shortDay(t.date)}${other ? ` · ${t.amount_pence < 0 ? 'to' : 'from'} ${other.accountName}` : t.category ? ` · ${t.category}` : ` · ${t.kind}`}${t.status === 'needs_review' ? ' · in your inbox' : ''}${t.bank ? ' · on a statement' : ''}`)),
      h('span', { class: `r ${t.amount_pence > 0 ? 'good' : ''}` }, `${t.amount_pence > 0 ? '+' : '−'}${formatPence(Math.abs(t.amount_pence))}`));
  };
  const since = b.verifiedDate ? approved.filter((t) => t.date > b.verifiedDate) : [];
  const inSince = since.filter((t) => t.amount_pence > 0).reduce((x, t) => x + t.amount_pence, 0);
  const outSince = since.filter((t) => t.amount_pence < 0).reduce((x, t) => x - t.amount_pence, 0);

  return h('div', { class: 'page' },
    head(a.name, `${TYPE[a.type] || a.type}${a.institution && a.institution !== a.name ? ` · ${a.institution}` : ''}`, h('a', { href: '#wealth', class: 'btn tap' }, 'All accounts')),
    st.saved ? h('p', { class: 'chip', role: 'status' }, st.saved) : null,
    h('section', { class: 'card acct-head' },
      h('p', { class: 'm-label' }, debt ? 'You owe' : 'Balance now', kindTag(tagOf(b))),
      h('div', { class: 'pos-figure display' }, b.pence === null ? 'Not entered' : debt ? formatPence(b.pence) : `${b.pence < 0 ? '−' : ''}${formatPence(Math.abs(b.pence))}`),
      h('p', { class: 'pos-sub' }, b.verifiedDate ? `Verified ${formatPence(Math.abs(b.verifiedPence))}${debt ? ' owed' : ''} on ${shortDay(b.verifiedDate)} (${ago(b.verifiedDate, ctx.today)})` : 'No balance typed in yet: type today’s below to start tracking it.'),
      since.length ? h('p', { class: 'muted small' }, `Since then: ${formatPence(inSince)} in, ${formatPence(outSince)} out, over ${since.length} line${since.length === 1 ? '' : 's'}.`) : null,
      b.pending.count ? h('p', { class: 'warn small' }, `${b.pending.count} line${b.pending.count === 1 ? '' : 's'} in your inbox (${b.pending.pence < 0 ? '−' : '+'}${formatPence(Math.abs(b.pending.pence))}) not counted yet. `, h('a', { href: '#inbox' }, 'Review')) : null),
    h('section', { class: 'card', 'aria-labelledby': 'vb-h' },
      h('h2', { id: 'vb-h' }, 'Verify the balance'),
      h('p', { class: 'muted small', style: { marginTop: 0 } }, debt ? 'Type what your card statement or app says you owe. It’s saved as a dated balance; your transactions aren’t changed.' : 'Type what your bank app shows. It’s saved as a dated balance and becomes the new starting point; your transactions aren’t changed.'),
      h('div', { class: 'repay-grid' }, h('label', { class: 'field' }, debt ? 'Owed' : 'Balance', balIn), h('label', { class: 'field' }, 'On', dateIn)),
      h('div', { class: 'explain-btns' }, verify)),
    allocCard,
    h('section', { class: 'card', 'aria-labelledby': 'ra-h' },
      h('h2', { id: 'ra-h' }, 'Recent activity'),
      lines.length ? h('div', { class: 'acct-lines' }, [...pending, ...approved].slice(0, 25).map(lineRow)) : h('p', { class: 'muted', style: { margin: 0 } }, 'Nothing recorded on this account yet.'),
      lines.length > 25 ? h('p', { class: 'small' }, h('a', { href: '#transactions' }, 'All transactions')) : null),
    snaps.length ? h('section', { class: 'card', 'aria-labelledby': 'bh-h' },
      h('h2', { id: 'bh-h' }, 'Balance history'),
      snaps.length >= 2 ? lineChart({ labels: snaps.map((s) => shortDay(s.date)), series: [{ name: debt ? 'Owed' : 'Balance', colour: '#8B9CFF', values: snaps.map((s) => s.balance_pence) }], label: 'Typed-in balances' }) : null,
      h('div', { class: 'stats' }, [...snaps].reverse().slice(0, 8).map((s) => h('div', null, h('span', { class: 'muted' }, `${shortDay(s.date)} ${s.date.slice(0, 4)}`), h('span', null, formatPence(Math.abs(s.balance_pence)))))),
      h('p', { class: 'muted small' }, 'The balances you’ve typed in. Between them, the balance is worked out from your transactions.')) : null);
}
