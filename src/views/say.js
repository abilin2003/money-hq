// "Say several": speak (or type) a few purchases in one go, check each one as an editable card, then save the
// ones you approve. The words are read with fixed rules (src/lib/interpret.js): anything not said is left
// empty and marked "to confirm", never filled in by a guess. Nothing is saved until you press Save.
import { h } from '../ui/dom.js';
import { formatPence, parsePence } from '../lib/money.js';
import { shortDay, alertLine } from '../ui/parts.js';
import { addTransaction, enrich, addPerson, addSplit } from '../lib/data.js';
import { parseSpoken, possibleDuplicates, vocabFrom, findAmounts } from '../lib/interpret.js';
import { micButton, canListen, VOICE_PRIVACY } from '../ui/voice.js';
import { fundSelect, readFund } from '../ui/fund-picker.js';

const KINDS = [['spend', 'Spent'], ['refund', 'Refund'], ['repayment', 'Paid back to me'], ['income', 'Income'], ['transfer', 'Move between accounts'], ['saved', 'Saved'], ['invested', 'Invested']];
const IN_KINDS = new Set(['refund', 'repayment', 'income']);

// "Ben 20, Dad 12.50" <-> [{ name, pence }]
export const splitsText = (splits) => splits.map((s) => `${s.name} ${(s.pence / 100).toFixed(2)}`).join(', ');
export function parseSplitsText(text) {
  return String(text || '').split(',').map((x) => x.trim()).filter(Boolean).map((x) => {
    const name = x.replace(/£?\s*\d[\d.,]*\s*$/, '').trim();
    const pence = findAmounts(`£${(x.match(/\d[\d.,]*\s*$/) || [''])[0]}`)[0]?.pence || null;
    return { name, pence };
  });
}

// What a card still needs before it can be saved.
export function missingFor(t) {
  const miss = [];
  if (!t.date) miss.push('date');
  if (!t.amount_pence) miss.push('amount');
  if (!t.description?.trim()) miss.push('description');
  if (!t.account_id) miss.push('account');
  if (!t.kind) miss.push('type');
  if ((t.kind === 'spend' || t.kind === 'refund') && !t.category_id) miss.push('category');
  if (t.splits?.some((s) => !s.name || !s.pence)) miss.push('split amounts');
  return miss;
}

export function sayPanel(ctx, rerender) {
  const st = ctx.sayState || (ctx.sayState = { text: '', items: null, saved: 0 });
  const vocab = vocabFrom(ctx);
  const box = h('textarea', { class: 'input', rows: 4, 'aria-label': 'Say or type your transactions', placeholder: 'e.g. Yesterday I spent £12.50 at Tesco on groceries using Revolut. Then £8.20 at McDonald’s from my Fun budget.', oninput: (e) => { st.text = e.target.value; } });
  box.value = st.text;
  const read = () => { st.text = box.value; st.items = parseSpoken(st.text, vocab, ctx.today).map((t, i) => ({ ...t, key: `${Date.now()}-${i}`, splitText: splitsText(t.splits) })); rerender(); };
  const mic = micButton(box, { onStop: () => { st.text = box.value; if (box.value.trim()) read(); } });
  const readBtn = h('button', { class: 'btn primary', type: 'button', onclick: read }, 'Read it');

  const intro = h('section', { class: 'card say-card' },
    h('h2', { style: { marginTop: 0 } }, 'Say several at once'),
    h('p', { class: 'muted small', style: { marginTop: 0 } }, 'Say each purchase with its amount, where, what it was and what you paid with. Anything you don’t say is left for you to fill in.'),
    box,
    h('div', { class: 'explain-btns' }, mic?.button, readBtn, st.items ? h('button', { class: 'linkbtn', type: 'button', onclick: () => { st.text = ''; st.items = null; rerender(); } }, 'Start again') : null),
    mic ? mic.status : null,
    h('p', { class: 'muted small', style: { margin: '8px 0 0' } }, mic ? VOICE_PRIVACY : canListen() ? '' : 'Speaking needs Chrome, Edge or Safari. You can type the same sentence here instead.'),
    st.saved ? h('p', { class: 'chip', role: 'status', style: { marginTop: '10px' } }, `Saved ${st.saved}.`) : null);
  if (!st.items) return intro;
  if (!st.items.length) return [intro, h('section', { class: 'card' }, h('p', { class: 'muted', style: { margin: 0 } }, 'I couldn’t find an amount in that. Say it like “£12.50 at Tesco”.'))];

  const catOptions = (sel) => [h('option', { value: '' }, 'To confirm'), ...ctx.ref.buckets.map((b) => h('optgroup', { label: b.name }, ctx.ref.categories.filter((c) => c.is_active && c.bucket_id === b.id).map((c) => h('option', { value: c.id, selected: c.id === sel }, c.name))))];
  const accounts = ctx.ref.accounts.filter((a) => a.is_active !== false);

  async function saveOne(t) {
    const miss = missingFor(t);
    if (miss.length) throw new Error(`Fill in: ${miss.join(', ')}.`);
    const saved = await addTransaction({ account_id: t.account_id, date: t.date, amount_pence: t.amount_pence, raw_description: t.description.trim(), kind: t.kind,
      category_id: t.kind === 'spend' || t.kind === 'refund' ? t.category_id : null, note: t.note?.trim() || null, tag: t.tag?.trim() || null, from_savings: t.amount_pence < 0 && Boolean(t.from_savings), fund_id: t.amount_pence < 0 && t.from_savings ? t.fund_id || null : null });
    ctx.add(enrich(saved, ctx.ref));
    for (const s of t.amount_pence < 0 && t.kind === 'spend' ? t.splits : []) {
      const person = ctx.ref.people.find((p) => p.name.toLowerCase() === s.name.toLowerCase()) || await addPerson(s.name);
      if (!ctx.ref.people.some((p) => p.id === person.id)) ctx.ref.people.push(person);
      ctx.ref.splits.push(await addSplit({ transaction_id: saved.id, person_id: person.id, amount_pence: s.pence }));
    }
    st.items = st.items.filter((x) => x !== t);
    st.saved += 1;
  }

  const cardFor = (t) => {
    const out = t.amount_pence < 0;
    const field = (name, label, control) => h('label', { class: `field${missingFor(t).includes(name) ? ' unsure' : ''}` }, label, control);
    const amount = h('input', { class: 'input money', inputmode: 'decimal', value: t.amount_pence ? (Math.abs(t.amount_pence) / 100).toFixed(2) : '', 'aria-label': 'Amount',
      onchange: (e) => { const p = parsePence(e.target.value); t.amount_pence = p && p > 0 ? (IN_KINDS.has(t.kind) ? p : -p) : null; rerender(); } });
    const kind = h('select', { class: 'input', 'aria-label': 'Type', onchange: (e) => { t.kind = e.target.value; const p = Math.abs(t.amount_pence || 0); t.amount_pence = p ? (IN_KINDS.has(t.kind) ? p : -p) : null; rerender(); } },
      h('option', { value: '' }, 'To confirm'), KINDS.map(([v, l]) => h('option', { value: v, selected: v === t.kind }, l)));
    const date = h('input', { class: 'input', type: 'date', value: t.date || '', max: ctx.today, 'aria-label': 'Date', onchange: (e) => { t.date = e.target.value || null; rerender(); } });
    const desc = h('input', { class: 'input', value: t.description || '', placeholder: 'Where or what', 'aria-label': 'Where or what', onchange: (e) => { t.description = e.target.value; rerender(); } });
    const cat = h('select', { class: 'input', 'aria-label': 'Category', onchange: (e) => { t.category_id = e.target.value || null; rerender(); } }, catOptions(t.category_id));
    const acc = h('select', { class: 'input', 'aria-label': out ? 'Paid with' : 'Into', onchange: (e) => { t.account_id = e.target.value || null; rerender(); } },
      h('option', { value: '' }, 'To confirm'), accounts.map((a) => h('option', { value: a.id, selected: a.id === t.account_id }, a.name)));
    const fund = fundSelect(ctx, { fromSavings: t.from_savings, fundId: t.fund_id });
    fund.addEventListener('change', () => { Object.assign(t, readFund(fund)); rerender(); });
    const split = h('input', { class: 'input', value: t.splitText || '', placeholder: 'e.g. Ben 20, Dad 12.50', 'aria-label': 'Who owes you', list: 'people-list', onchange: (e) => { t.splitText = e.target.value; t.splits = parseSplitsText(e.target.value); rerender(); } });
    const note = h('input', { class: 'input', value: t.note || '', placeholder: 'Note', 'aria-label': 'Note', onchange: (e) => { t.note = e.target.value; } });
    const dups = possibleDuplicates(t, ctx.all.filter((x) => !x.archived));
    const save = h('button', { class: 'btn primary', type: 'button', onclick: async () => { save.disabled = true; try { await saveOne(t); ctx.refresh(); rerender(); } catch (err) { save.disabled = false; alertLine(save, err.message); } } }, 'Save');
    const miss = missingFor(t);
    return h('div', { class: 'say-item', role: 'group', 'aria-label': `${t.description || 'Transaction'} ${t.amount_pence ? formatPence(Math.abs(t.amount_pence)) : ''}` },
      h('p', { class: 'muted small say-heard' }, `Heard: “${t.text}”`),
      h('div', { class: 'say-grid' },
        field('date', 'Date', date), field('description', out ? 'Where' : 'From', desc), field('amount', 'Amount', amount), field('type', 'Type', kind),
        t.kind === 'spend' || t.kind === 'refund' ? field('category', 'Category', cat) : null,
        field('account', out ? 'Paid with' : 'Into', acc),
        out && t.kind === 'spend' ? field('fund', 'Paid for by', fund) : null,
        out && t.kind === 'spend' ? field('split amounts', 'Who owes you', split) : null,
        field('note', 'Note', note)),
      dups.length ? h('p', { class: 'warn small', style: { margin: '6px 0 0' } }, `Possible duplicate: you already have ${dups.map((d) => `${d.raw_description} ${formatPence(Math.abs(d.amount_pence))} on ${shortDay(d.date)}`).join('; ')}.`) : null,
      h('div', { class: 'explain-btns' }, save, h('button', { class: 'linkbtn', type: 'button', onclick: () => { st.items = st.items.filter((x) => x !== t); rerender(); } }, 'Remove'),
        miss.length ? h('span', { class: 'muted small' }, `To confirm: ${miss.join(', ')}`) : h('span', { class: 'good small' }, 'Ready')));
  };

  const ready = st.items.filter((t) => !missingFor(t).length);
  const saveAll = h('button', { class: 'btn primary', type: 'button', disabled: !ready.length, onclick: async () => {
    saveAll.disabled = true;
    try { for (const t of ready) await saveOne(t); ctx.refresh(); rerender(); } catch (err) { saveAll.disabled = false; alertLine(saveAll, err.message); }
  } }, ready.length === st.items.length ? `Save all ${ready.length}` : `Save the ${ready.length} ready`);

  return [intro, h('section', { class: 'card', 'aria-labelledby': 'say-check' },
    h('div', { class: 'ch' }, h('h2', { id: 'say-check' }, `Check ${st.items.length} transaction${st.items.length === 1 ? '' : 's'}`), saveAll),
    h('p', { class: 'muted small', style: { marginTop: 0 } }, 'Nothing is saved until you press Save. Fields marked “To confirm” weren’t in what you said.'),
    st.items.map(cardFor),
    h('datalist', { id: 'people-list' }, ctx.ref.people.map((p) => h('option', { value: p.name }))))];
}
