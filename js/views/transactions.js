// The transactions list: search, filters, and edit or delete in place.
import { h, option, fmtMoney, fmtDay, plural, armConfirm, toast, KIND_LABELS } from '../ui.js';
import { filterTransactions, summarise } from '../txfilter.js';
import { KINDS, ACCOUNTS } from '../seed.js';
import { todayIso, r2, isIsoDate } from '../money.js';

const PAGE = 100;

export function initTransactions(ctx, root) {
  const filters = { q: '', category: '', account: '', kind: '', tag: '', period: 'all', from: '', to: '' };
  let limit = PAGE;
  let openId = null;

  const q = h('input', { id: 'tx-q', type: 'search', class: 'inp', placeholder: 'Search shop, category or tag', oninput: () => { filters.q = q.value; limit = PAGE; renderList(); } });
  const select = (id, key, label) => {
    const el = h('select', { id, class: 'inp', 'aria-label': label, onchange: () => { filters[key] = el.value; limit = PAGE; renderList(); } });
    return el;
  };
  const period = select('tx-period', 'period', 'Dates');
  const category = select('tx-category', 'category', 'Category');
  const account = select('tx-account', 'account', 'Account');
  const kind = select('tx-kind', 'kind', 'Type');
  const tag = select('tx-tag', 'tag', 'Tag');
  const from = h('input', { id: 'tx-from', type: 'date', class: 'inp', 'aria-label': 'From', onchange: () => { filters.from = from.value; renderList(); } });
  const to = h('input', { id: 'tx-to', type: 'date', class: 'inp', 'aria-label': 'To', onchange: () => { filters.to = to.value; renderList(); } });
  const custom = h('div', { class: 'row2', hidden: true }, from, to);
  const summary = h('p', { class: 'muted', id: 'tx-summary' });
  const listBox = h('div', { class: 'txlist', id: 'tx-list' });
  const more = h('button', { class: 'btn ghost', type: 'button', id: 'tx-more', onclick: () => { limit += PAGE; renderList(); } }, 'Show more');
  const catList = h('datalist', { id: 'tx-cats' });

  root.append(h('section', { class: 'card' },
    h('h2', null, 'Transactions'),
    q,
    h('div', { class: 'row2' }, period, category),
    h('div', { class: 'row2' }, account, kind),
    tag, custom, summary, listBox, more, catList));

  function fillFilters() {
    const d = ctx.data;
    const keep = { ...filters };
    const cats = [...new Set([...d.settings.categories.map((c) => c.name), ...d.transactions.map((t) => t.category).filter(Boolean)])].sort();
    const accts = [...new Set([...ACCOUNTS, ...d.transactions.map((t) => t.account).filter(Boolean)])];
    const tags = [...new Set(d.transactions.map((t) => t.tag).filter(Boolean))].sort();
    const fill = (el, first, items, value) => {
      el.replaceChildren(option('', first), ...items.map(([v, l]) => option(v, l)));
      el.value = items.some(([v]) => v === value) ? value : '';
    };
    fill(period, 'All dates', [['cycle', 'This pay cycle'], ['prev', 'Last pay cycle'], ['custom', 'Choose dates']], keep.period === 'all' ? '' : keep.period);
    fill(category, 'All categories', cats.map((c) => [c, c]), keep.category);
    fill(account, 'All accounts', accts.map((a) => [a, a]), keep.account);
    fill(kind, 'All types', KINDS.map((k) => [k, KIND_LABELS[k]]), keep.kind);
    fill(tag, 'All tags', tags.map((t) => [t, t]), keep.tag);
    filters.period = period.value || 'all';
    filters.category = category.value;
    filters.account = account.value;
    filters.kind = kind.value;
    filters.tag = tag.value;
    custom.hidden = filters.period !== 'custom';
    catList.replaceChildren(...cats.map((c) => h('option', { value: c })));
  }

  period.addEventListener('change', () => { filters.period = period.value || 'all'; custom.hidden = filters.period !== 'custom'; });

  function renderList() {
    const d = ctx.data;
    const rows = filterTransactions(d.transactions, filters, { today: todayIso(), paydates: d.settings.paydates });
    const s = summarise(rows);
    const parts = [plural(s.count, 'transaction')];
    if (s.spent) parts.push(`spending ${fmtMoney(s.spent)}`);
    if (s.paidBack) parts.push(`paid back ${fmtMoney(s.paidBack)}`);
    if (s.income) parts.push(`income ${fmtMoney(s.income)}`);
    if (s.invested) parts.push(`invested ${fmtMoney(s.invested)}`);
    if (s.internal) parts.push(`${plural(s.internal, 'move')} left out`);
    if (s.unsure) parts.push(`${s.unsure} not sure yet`);
    summary.textContent = parts.join(' · ');
    const shown = rows.slice(0, limit);
    listBox.replaceChildren(...(shown.length ? shown.map(row) : [h('p', { class: 'empty' }, d.transactions.length ? 'Nothing matches those filters.' : 'No transactions yet. Add one, or import your bank files.')]));
    more.hidden = rows.length <= limit;
    more.textContent = `Show more (${rows.length - limit} left)`;
  }

  function row(t) {
    if (t.id === openId) return editor(t);
    const sign = t.direction === 'in' ? '+' : '';
    const meta = [fmtDay(t.date), t.category || (t.kind === 'spending' ? 'No category' : ''), t.account, t.tag ? `#${t.tag}` : ''].filter(Boolean).join(' · ');
    return h('button', { type: 'button', class: `txrow k-${t.kind}`, onclick: () => { openId = t.id; renderList(); } },
      h('span', { class: 'tx-main' }, h('b', null, t.desc), h('span', { class: 'tx-meta' }, meta)),
      h('span', { class: 'tx-right' }, h('span', { class: 'amt' }, `${sign}${fmtMoney(t.amount)}`), t.kind === 'spending' ? null : h('span', { class: `badge b-${t.kind}` }, KIND_LABELS[t.kind])));
  }

  function editor(t) {
    const cats = ctx.data.settings.categories.map((c) => c.name);
    const f = {
      desc: h('input', { type: 'text', class: 'inp', value: t.desc }),
      amount: h('input', { type: 'number', step: '0.01', min: '0', inputmode: 'decimal', class: 'inp', value: String(t.amount) }),
      date: h('input', { type: 'date', class: 'inp', value: t.date }),
      direction: h('select', { class: 'inp' }, option('out', 'Money out', t.direction === 'out'), option('in', 'Money in', t.direction === 'in')),
      kind: h('select', { class: 'inp' }, KINDS.map((k) => option(k, KIND_LABELS[k], k === t.kind))),
      category: h('input', { type: 'text', class: 'inp', list: 'tx-cats', value: t.category || '', placeholder: cats[0] }),
      account: h('select', { class: 'inp' }, [...new Set([...ACCOUNTS, t.account].filter(Boolean))].map((a) => option(a, a, a === t.account))),
      tag: h('input', { type: 'text', class: 'inp', value: t.tag || '' }),
    };
    const msg = h('p', { class: 'status bad' });
    const field = (label, control) => h('div', { class: 'field' }, h('label', null, label, control));
    const saveBtn = h('button', { type: 'button', class: 'btn', onclick: async () => {
      const amount = parseFloat(f.amount.value);
      if (!f.desc.value.trim()) { msg.textContent = 'Add a description.'; return; }
      if (!(amount > 0)) { msg.textContent = 'Enter an amount above £0.'; return; }
      if (!isIsoDate(f.date.value)) { msg.textContent = 'Pick a date.'; return; }
      try {
        await ctx.update((data) => {
          const target = data.transactions.find((x) => x.id === t.id);
          if (!target) return;
          Object.assign(target, { desc: f.desc.value.trim(), amount: r2(amount), date: f.date.value, direction: f.direction.value, kind: f.kind.value, category: f.category.value.trim(), account: f.account.value });
          const label = f.tag.value.trim();
          if (label) target.tag = label; else delete target.tag;
        });
        openId = null;
        ctx.refresh();
        toast('Transaction updated.', 'ok');
      } catch (err) { msg.textContent = `Could not save: ${err.message}`; }
    } }, 'Save');
    const cancelBtn = h('button', { type: 'button', class: 'btn ghost', onclick: () => { openId = null; renderList(); } }, 'Cancel');
    const delBtn = h('button', { type: 'button', class: 'btn danger' }, 'Delete');
    armConfirm(delBtn, 'Delete', 'Tap again to delete', async () => {
      try {
        await ctx.update((data) => { data.transactions = data.transactions.filter((x) => x.id !== t.id); });
        openId = null;
        ctx.refresh();
        toast('Transaction deleted.', 'ok');
      } catch (err) { msg.textContent = `Could not delete: ${err.message}`; }
    });
    return h('div', { class: 'txedit' },
      field('Description', f.desc),
      h('div', { class: 'row2' }, field('Amount (£)', f.amount), field('Date', f.date)),
      h('div', { class: 'row2' }, field('Direction', f.direction), field('Type', f.kind)),
      h('div', { class: 'row2' }, field('Category', f.category), field('Account', f.account)),
      field('Tag', f.tag),
      msg,
      h('div', { class: 'actions' }, saveBtn, cancelBtn, delBtn));
  }

  function render() {
    fillFilters();
    renderList();
  }

  // Lets other screens open the list already filtered (for example to the "not sure yet" lines).
  function showWith(patch) {
    Object.assign(filters, patch);
    limit = PAGE;
    render();
  }

  return { render, showWith };
}
