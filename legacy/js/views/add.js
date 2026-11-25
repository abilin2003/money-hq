// Quick entry: favourite tiles that fill in shop, category, account and the usual amount.
import { h, option, fmtMoney, toast } from '../ui.js';
import { quickTiles } from '../quick.js';
import { merchantKey, r2, todayIso, addDays, isIsoDate, makeId } from '../money.js';
import { ACCOUNTS } from '../seed.js';

export function initAdd(ctx, root) {
  let showMore = false;
  let editing = false;
  let selected = '';
  let touchedCategory = false;
  let touchedAccount = false;

  const tilesBox = h('div', { class: 'tiles' });
  const moreBtn = h('button', { class: 'link-btn', type: 'button', onclick: () => { showMore = !showMore; renderTiles(); } });
  const editBtn = h('button', { class: 'link-btn', type: 'button', onclick: () => { editing = !editing; if (editing) showMore = true; renderTiles(); } });
  const tilesWrap = h('div', { class: 'tiles-wrap' }, h('div', { class: 'tiles-head' }, h('b', null, 'Favourites'), h('span', { class: 'spacer' }), moreBtn, editBtn), tilesBox);

  const amount = h('input', { id: 'add-amount', type: 'number', inputmode: 'decimal', step: '0.01', min: '0', placeholder: '0.00', class: 'inp big' });
  const desc = h('input', { id: 'add-desc', type: 'text', list: 'add-shops', autocomplete: 'off', placeholder: 'e.g. Tesco', class: 'inp', oninput: () => guess() });
  const category = h('select', { id: 'add-category', class: 'inp', onchange: () => { touchedCategory = true; } });
  const account = h('select', { id: 'add-account', class: 'inp', onchange: () => { touchedAccount = true; } });
  const date = h('input', { id: 'add-date', type: 'date', class: 'inp', value: todayIso(), onchange: markDay });
  const tag = h('input', { id: 'add-tag', type: 'text', list: 'add-tags', autocomplete: 'off', placeholder: 'e.g. Cousins visit', class: 'inp' });
  const shops = h('datalist', { id: 'add-shops' });
  const tags = h('datalist', { id: 'add-tags' });
  const todayBtn = h('button', { type: 'button', class: 'chip', id: 'add-today', onclick: () => setDay(0) }, 'Today');
  const yesterdayBtn = h('button', { type: 'button', class: 'chip', id: 'add-yesterday', onclick: () => setDay(1) }, 'Yesterday');
  const status = h('p', { class: 'status', id: 'add-status', role: 'status' });

  const field = (label, control, id) => h('div', { class: 'field' }, h('label', { for: id }, label), control);

  const form = h('form', { class: 'card', onsubmit: (e) => { e.preventDefault(); save(false); } },
    h('h2', null, 'Add spending'),
    tilesWrap,
    field('Amount (£)', amount, 'add-amount'),
    field('Where or what', desc, 'add-desc'),
    h('div', { class: 'row2' }, field('Category', category, 'add-category'), field('Account', account, 'add-account')),
    h('div', { class: 'field' }, h('label', { for: 'add-date' }, 'Date'), h('div', { class: 'chips' }, todayBtn, yesterdayBtn), date),
    field('Tag or event (optional)', tag, 'add-tag'),
    h('div', { class: 'actions' },
      h('button', { class: 'btn', type: 'submit', id: 'add-save' }, 'Save'),
      h('button', { class: 'btn ghost', type: 'button', id: 'add-another', onclick: () => save(true) }, 'Save and add another')),
    status, shops, tags);
  root.append(form);

  function setDay(back) { date.value = addDays(todayIso(), -back); markDay(); }
  function markDay() {
    todayBtn.classList.toggle('on', date.value === todayIso());
    yesterdayBtn.classList.toggle('on', date.value === addDays(todayIso(), -1));
  }
  const say = (message, kind = '') => { status.textContent = message; status.className = `status ${kind}`.trim(); };

  function currentTiles() {
    const d = ctx.data;
    return quickTiles(d.transactions, d.settings.quick);
  }

  // Fill in the category and account from what you did last time at this shop.
  function guess() {
    const key = merchantKey(desc.value);
    if (!key) return;
    const tile = currentTiles().find((t) => t.key === key);
    const rule = ctx.data.settings.merchantRules[key];
    const cat = tile ? tile.category : rule && rule.kind === 'spending' ? rule.category : '';
    if (cat && !touchedCategory) setSelect(category, cat);
    if (tile && tile.account && !touchedAccount) setSelect(account, tile.account);
  }

  function setSelect(select, value) {
    if (![...select.options].some((o) => o.value === value)) select.append(option(value, value));
    select.value = value;
  }

  function pick(tile) {
    selected = tile.key;
    desc.value = tile.name;
    amount.value = tile.amount ? tile.amount.toFixed(2) : '';
    touchedCategory = true;
    touchedAccount = true;
    setSelect(category, tile.category);
    if (tile.account) setSelect(account, tile.account);
    renderTiles();
    amount.focus();
    try { amount.select(); } catch { /* not every browser can select a number box */ }
  }

  function toggle(list, key) {
    return ctx.update((data) => {
      const q = data.settings.quick;
      const i = q[list].indexOf(key);
      if (i >= 0) q[list].splice(i, 1); else q[list].push(key);
      if (list === 'hidden') q.pinned = q.pinned.filter((k) => k !== key);
    });
  }

  function renderTiles() {
    const all = currentTiles();
    const shown = all.slice(0, showMore ? 24 : 8);
    const pinned = ctx.data.settings.quick.pinned;
    tilesWrap.hidden = !all.length;
    moreBtn.hidden = all.length <= 8;
    moreBtn.textContent = showMore ? 'Show fewer' : `Show more (${Math.min(all.length, 24)})`;
    editBtn.textContent = editing ? 'Done' : 'Edit';
    tilesBox.replaceChildren(...shown.map((tile) => {
      const isPinned = pinned.includes(tile.key);
      const label = h('span', { class: 'qn' }, tile.name);
      if (editing) {
        return h('div', { class: 'qtile editing' }, label,
          h('span', { class: 'qacts' },
            h('button', { type: 'button', class: isPinned ? 'on' : '', onclick: () => toggle('pinned', tile.key) }, isPinned ? '★ Pinned' : '☆ Pin'),
            h('button', { type: 'button', onclick: () => toggle('hidden', tile.key) }, '✕ Hide')));
      }
      return h('button', { type: 'button', class: `qtile${selected === tile.key ? ' sel' : ''}`, onclick: () => pick(tile) },
        isPinned ? h('span', { class: 'qstar' }, '★') : null, label,
        h('span', { class: 'qm' }, `${fmtMoney(tile.amount)} · ${tile.category}`));
    }));
  }

  async function save(another) {
    const value = parseFloat(amount.value);
    const text = desc.value.trim();
    if (!(value > 0)) return say('Enter an amount above £0.', 'bad');
    if (!text) return say('Add where or what it was.', 'bad');
    if (!isIsoDate(date.value)) return say('Pick a date.', 'bad');
    const cat = category.value;
    const acct = account.value;
    const label = tag.value.trim();
    const when = date.value;
    try {
      await ctx.update((data) => {
        data.transactions.push({
          id: makeId(), date: when, desc: text, amount: r2(value), direction: 'out', kind: 'spending',
          category: cat, account: acct, ...(label ? { tag: label } : {}), source: 'manual',
        });
        const key = merchantKey(text);
        if (key && cat !== 'Uncategorised') data.settings.merchantRules[key] = { kind: 'spending', category: cat };
      });
    } catch (err) {
      return say(`Could not save: ${err.message}`, 'bad');
    }
    const message = `Added ${fmtMoney(r2(value))} to ${cat}.`;
    amount.value = '';
    desc.value = '';
    selected = '';
    touchedCategory = false;
    touchedAccount = false;
    if (another) { say(`${message} Add the next one.`, 'ok'); amount.focus(); } else { say(message, 'ok'); toast(message, 'ok'); }
  }

  function render() {
    const d = ctx.data;
    const keepCat = category.value;
    const keepAcct = account.value;
    const names = [...d.settings.categories.map((c) => c.name), 'Uncategorised'];
    category.replaceChildren(...names.map((n) => option(n, n)));
    setSelect(category, keepCat && names.includes(keepCat) ? keepCat : names[0]);
    const seenAccounts = [...new Set([...ACCOUNTS, ...d.transactions.map((t) => t.account).filter(Boolean)])];
    account.replaceChildren(...seenAccounts.map((n) => option(n, n)));
    setSelect(account, keepAcct || ACCOUNTS[0]);
    shops.replaceChildren(...currentTiles().slice(0, 40).map((t) => h('option', { value: t.name })));
    tags.replaceChildren(...[...new Set(d.transactions.map((t) => t.tag).filter(Boolean))].sort().map((t) => h('option', { value: t })));
    renderTiles();
    markDay();
  }

  return { render };
}
