// Import: drop in one or more bank files; Money HQ shows what's new, what's a duplicate and what needs a look,
// then saves the new lines when you say so.
import { h } from '../ui/dom.js';
import { head, shortDay, alertLine } from '../ui/parts.js';
import { buildImportPlan } from '../lib/import/plan.js';
import { prepareRules } from '../lib/import/classify.js';
import { saveImport, enrich } from '../lib/data.js';

const BANK_NAME = { ulster: 'Ulster Bank', revolut: 'Revolut statement', 'revolut-app': 'Revolut app export', monzo: 'Monzo', list: 'Your own list' };

export function importPage(ctx, rerender) {
  const state = ctx.importState || (ctx.importState = { plan: null, done: null });
  const input = h('input', { type: 'file', id: 'files', accept: '.csv,text/csv', multiple: true, class: 'sr-only', onchange: (e) => load([...e.target.files]) });

  async function load(files) {
    if (!files.length) return;
    const read = await Promise.all(files.map(async (f) => ({ name: f.name, text: await f.text() })));
    const existing = ctx.all.map((t) => ({ id: t.id, account: t.account, date: t.date, amount_pence: t.amount_pence, fingerprint: t.fingerprint, source: t.source, archived: t.archived }));
    state.plan = buildImportPlan(read, prepareRules(ctx.ref.rules), existing);
    state.done = null;
    rerender();
  }

  async function save(btn) {
    const plan = state.plan;
    const accountId = Object.fromEntries(ctx.ref.accounts.map((a) => [a.name, a.id]));
    const categoryId = Object.fromEntries(ctx.ref.categories.map((c) => [c.name, c.id]));
    const fresh = plan.rows.filter((r) => !r.duplicate);
    for (const r of fresh) r.id = crypto.randomUUID();
    const missing = [...new Set(fresh.filter((r) => !accountId[r.account]).map((r) => r.account))];
    if (missing.length) throw new Error(`These accounts aren't set up yet: ${missing.join(', ')}.`);
    const rows = fresh.map((r) => ({
      id: r.id, account_id: accountId[r.account], date: r.date, amount_pence: r.amount_pence, raw_description: r.raw_description,
      note: r.note || null, kind: r.kind, status: r.status, category_id: r.category ? categoryId[r.category] || null : null,
      fingerprint: r.fingerprint, source: `import:${plan.files.find((f) => f.name === r.file)?.bank || 'file'}`, pairId: r.pairWith?.id || null,
    }));
    const names = plan.files.filter((f) => !f.error).map((f) => f.name).join(', ');
    const saved = await saveImport(rows, { file_name: names.slice(0, 500), account_id: null, row_count: plan.rows.length, new_count: rows.length, duplicate_count: plan.counts.duplicates });
    for (const t of saved) ctx.add(enrich(t, ctx.ref));
    state.done = { added: saved.length, review: saved.filter((t) => t.status === 'needs_review').length };
    state.plan = null;
    rerender();
  }

  const drop = h('label', { class: 'dropzone', for: 'files',
    ondragover: (e) => { e.preventDefault(); e.currentTarget.classList.add('over'); },
    ondragleave: (e) => e.currentTarget.classList.remove('over'),
    ondrop: (e) => { e.preventDefault(); e.currentTarget.classList.remove('over'); load([...e.dataTransfer.files]); } },
  input,
  h('span', { style: { fontWeight: 600 } }, 'Choose files or drop them here'),
  h('span', { class: 'muted small' }, 'Ulster Bank, Revolut and Monzo CSV files. You can add several at once. Nothing is saved until you press Import.'));

  const out = [head('Import statements', 'Bring in your latest bank files. Duplicates are caught automatically.'), h('section', { class: 'card' }, drop)];

  if (state.done) {
    out.push(h('section', { class: 'card', role: 'status' },
      h('h2', null, 'Imported'),
      h('p', { style: { margin: 0 } }, `${state.done.added} new transaction${state.done.added === 1 ? '' : 's'} saved.`),
      state.done.review ? h('p', { style: { margin: '8px 0 0' } }, h('a', { href: '#inbox' }, `${state.done.review} need a quick look in the review inbox`)) : null));
  }

  const plan = state.plan;
  if (plan) {
    const fileRows = plan.files.map((f) => h('div', null,
      h('span', null, h('span', null, f.name), h('br'), h('span', { class: 'muted small' }, f.error ? f.error : `${BANK_NAME[f.bank] || f.bank}, ${shortDay(f.from)} to ${shortDay(f.to)}, ${f.rows} lines`)),
      f.error ? h('span', { class: 'over' }, 'Not read') : h('span', null, `${f.rows - f.duplicates} new`)));
    const btn = h('button', { class: 'btn primary', type: 'button', disabled: plan.counts.new === 0, onclick: async () => {
      btn.disabled = true;
      btn.textContent = 'Saving…';
      try { await save(btn); } catch (err) { btn.disabled = false; btn.textContent = `Import ${plan.counts.new} new`; alertLine(btn, err.message); }
    } }, plan.counts.new ? `Import ${plan.counts.new} new` : 'Nothing new to import');
    out.push(h('section', { class: 'card', 'aria-labelledby': 'sum' },
      h('h2', { id: 'sum' }, 'What’s in these files'),
      h('div', { class: 'stats' }, fileRows),
      h('div', { class: 'stats', style: { marginTop: '12px' } },
        h('div', null, h('span', { class: 'muted' }, 'New lines'), h('span', null, String(plan.counts.new))),
        h('div', null, h('span', { class: 'muted' }, 'Sorted automatically'), h('span', null, String(plan.counts.sorted))),
        h('div', null, h('span', { class: 'muted' }, 'Need a quick look (go to the inbox)'), h('span', null, String(plan.counts.needsReview))),
        h('div', null, h('span', { class: 'muted' }, 'Moves between your accounts (not spending)'), h('span', null, String(plan.counts.transfers))),
        h('div', null, h('span', { class: 'muted' }, 'Already in Money HQ (skipped)'), h('span', null, String(plan.counts.duplicates)))),
      h('div', { style: { display: 'flex', gap: '10px', marginTop: '16px', flexWrap: 'wrap' } }, btn,
        h('button', { class: 'btn', type: 'button', onclick: () => { state.plan = null; rerender(); } }, 'Cancel'))));
  }
  return h('div', { class: 'page' }, out);
}
