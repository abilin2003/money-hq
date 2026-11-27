// Import: drop in one or more bank files; Money HQ shows what's new, what's a duplicate and what needs a look,
// then saves the new lines when you say so.
import { h } from '../ui/dom.js';
import { head, shortDay, alertLine } from '../ui/parts.js';
import { buildImportPlan, bankRecord } from '../lib/import/plan.js';
import { prepareRules } from '../lib/import/classify.js';
import { saveImport, enrich, updateTransaction, createImportBatch, loadImportBatches } from '../lib/data.js';
import { accountCoverage, batchSummary } from '../lib/coverage.js';

const BANK_NAME = { ulster: 'Ulster Bank', revolut: 'Revolut statement', 'revolut-app': 'Revolut app export', monzo: 'Monzo', list: 'Your own list' };

export function importPage(ctx, rerender) {
  const state = ctx.importState || (ctx.importState = { plan: null, done: null });
  const input = h('input', { type: 'file', id: 'files', accept: '.csv,text/csv', multiple: true, class: 'sr-only', onchange: (e) => load([...e.target.files]) });

  async function load(files) {
    if (!files.length) return;
    const read = await Promise.all(files.map(async (f) => ({ name: f.name, text: await f.text() })));
    const existing = ctx.all.map((t) => ({ id: t.id, account: t.account, date: t.date, amount_pence: t.amount_pence, raw_description: t.raw_description, fingerprint: t.fingerprint, source: t.source, archived: t.archived, note: t.note, status: t.status, bank: t.bank }));
    state.plan = buildImportPlan(read, prepareRules(ctx.ref.rules), existing);
    state.done = null;
    rerender();
  }

  async function save(btn) {
    const plan = state.plan;
    const accountId = Object.fromEntries(ctx.ref.accounts.map((a) => [a.name, a.id]));
    const categoryId = Object.fromEntries(ctx.ref.categories.map((c) => [c.name, c.id]));
    const fresh = plan.rows.filter((r) => !r.duplicate);
    const now = new Date().toISOString();
    for (const r of fresh) r.id = crypto.randomUUID();
    const missing = [...new Set(fresh.filter((r) => !accountId[r.account]).map((r) => r.account))];
    if (missing.length) throw new Error(`These accounts aren't set up yet: ${missing.join(', ')}.`);
    // The import is recorded first (files, the dates each covers, what happened), so every line can point to it.
    const names = plan.files.filter((f) => !f.error).map((f) => f.name).join(', ');
    const batch = await createImportBatch({ file_name: names.slice(0, 500) || 'statement', account_id: null, row_count: plan.rows.length, new_count: fresh.length, duplicate_count: plan.counts.duplicates,
      details: { files: plan.files.filter((f) => !f.error).map((f) => ({ name: f.name, bank: f.bank, account: f.account, from: f.from, to: f.to, period_from: f.period_from || null, period_to: f.period_to || null, rows: f.rows })), counts: plan.counts } });
    const record = (r) => ({ ...bankRecord(r, r.file, now), batch_id: batch.id });
    const rows = fresh.map((r) => ({
      id: r.id, account_id: accountId[r.account], date: r.date, amount_pence: r.amount_pence, raw_description: r.raw_description,
      note: r.note || null, kind: r.kind, status: r.status, category_id: r.category ? categoryId[r.category] || null : null,
      fingerprint: r.fingerprint, source: `import:${plan.files.find((f) => f.name === r.file)?.bank || 'file'}`, pairId: r.pairWith?.id || null,
      bank: record(r), review: r.review, // every new line waits in the inbox, with the bank's own record kept
    }));
    const saved = rows.length ? await saveImport(rows, batch.id) : [];
    ctx.importBatches = [batch, ...(ctx.importBatches || [])];
    for (const t of saved) ctx.add(enrich(t, ctx.ref));
    // Lines that clearly match your own entries: the bank's record is attached, nothing else about them changes.
    for (const l of plan.links) ctx.replace(enrich(await updateTransaction(l.id, { bank: record(l.row) }), ctx.ref));
    // Your entries the statement doesn't have: asked about in the inbox (your note is left as it is).
    for (const c of plan.checks) ctx.replace(enrich(await updateTransaction(c.id, { status: 'needs_review', review: c.review }), ctx.ref));
    state.done = { added: saved.length, linked: plan.links.length, checked: plan.checks.length };
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

  const out = [head('Import statements', 'Bring in your latest bank files. Lines that match what you’ve recorded are linked; everything new waits for your approval.'), h('section', { class: 'card' }, drop)];

  if (state.done) {
    out.push(h('section', { class: 'card', role: 'status' },
      h('h2', null, 'Imported'),
      h('p', { style: { margin: 0 } }, `${state.done.linked} matched to entries you’d already recorded (now verified). ${state.done.added} new line${state.done.added === 1 ? '' : 's'} waiting for your approval.`, state.done.checked ? ` ${state.done.checked} of your entries aren’t on the statement.` : ''),
      state.done.added + state.done.checked ? h('p', { style: { margin: '8px 0 0' } }, h('a', { href: '#inbox' }, 'Review them in the inbox')) : null));
  }

  const plan = state.plan;
  if (plan) {
    const fileRows = plan.files.map((f) => h('div', null,
      h('span', null, h('span', null, f.name), h('br'), h('span', { class: 'muted small' }, f.error ? f.error : `${BANK_NAME[f.bank] || f.bank}, ${shortDay(f.from)} to ${shortDay(f.to)}, ${f.rows} lines`)),
      f.error ? h('span', { class: 'over' }, 'Not read') : h('span', null, `${plan.rows.filter((r) => r.file === f.name && !r.duplicate).length} new`)));
    const todo = plan.counts.new + plan.links.length + plan.checks.length;
    const btn = h('button', { class: 'btn primary', type: 'button', disabled: todo === 0, onclick: async () => {
      btn.disabled = true;
      btn.textContent = 'Saving…';
      try { await save(btn); } catch (err) { btn.disabled = false; btn.textContent = 'Import'; alertLine(btn, err.message); }
    } }, todo ? 'Import' : 'Nothing new to import');
    out.push(h('section', { class: 'card', 'aria-labelledby': 'sum' },
      h('h2', { id: 'sum' }, 'What’s in these files'),
      h('div', { class: 'stats' }, fileRows),
      h('div', { class: 'stats', style: { marginTop: '12px' } },
        h('div', null, h('span', { class: 'muted' }, 'Match what you recorded (linked and verified, nothing added)'), h('span', null, String(plan.counts.linked))),
        h('div', null, h('span', { class: 'muted' }, 'New, ready to approve (inbox)'), h('span', null, String(plan.counts.ready))),
        h('div', null, h('span', { class: 'muted' }, 'Possible match, to check (inbox)'), h('span', null, String(plan.counts.possibleMatch))),
        h('div', null, h('span', { class: 'muted' }, 'New, needs information (inbox)'), h('span', null, String(plan.counts.needsInfo))),
        h('div', null, h('span', { class: 'muted' }, 'Already in Money HQ (skipped)'), h('span', null, String(plan.counts.duplicates))),
        plan.counts.notOnStatement ? h('div', null, h('span', { class: 'muted' }, 'Your entries not on the statement (inbox)'), h('span', null, String(plan.counts.notOnStatement))) : null),
      h('p', { class: 'muted small', style: { margin: '10px 0 0' } }, 'Nothing new is counted until you approve it in the inbox.'),
      h('div', { style: { display: 'flex', gap: '10px', marginTop: '16px', flexWrap: 'wrap' } }, btn,
        h('button', { class: 'btn', type: 'button', onclick: () => { state.plan = null; rerender(); } }, 'Cancel'))));
  }
  out.push(...coverageAndHistory(ctx, rerender));
  return h('div', { class: 'page' }, out);
}

// ---- Statement coverage (per account) and the import history, below the importer
const day = (iso) => (iso ? shortDay(iso.slice(0, 10)) : '–');
function coverageAndHistory(ctx, rerender) {
  if (ctx.importBatches === undefined) {
    ctx.importBatches = null; // loading
    loadImportBatches().then((b) => { ctx.importBatches = b; rerender(); }).catch(() => { ctx.importBatches = []; rerender(); });
  }
  const batches = ctx.importBatches || [];
  const rows = accountCoverage(ctx.ref.accounts.filter((a) => a.is_active !== false && ['current', 'credit_card', 'savings'].includes(a.type)), batches, ctx.transactions);
  const cov = h('section', { class: 'card', 'aria-labelledby': 'cov' },
    h('h2', { id: 'cov' }, 'Statement coverage'),
    h('p', { class: 'muted small', style: { marginTop: 0 } }, 'How far your imported statements reach for each account, next to what you’ve typed. A statement only shows its first to last transaction: days in between aren’t assumed covered.'),
    rows.length ? h('div', { class: 'cov-list' }, rows.map((r) => h('div', { class: 'cov-row' },
      h('span', { class: 'cov-name' }, r.name),
      h('span', { class: 'small' }, r.importedTo ? `Statements reach ${day(r.importedTo)}${r.periodKnown ? '' : ' (latest transaction)'}` : 'No statement imported yet', h('br'),
        h('span', { class: 'muted' }, `Last import ${r.lastImport ? day(r.lastImport) : '–'} · your latest entry ${day(r.latestManual)}`)),
      h('span', { class: `small cov-status ${r.status === 'reconciled' ? 'good' : r.pending ? 'warn' : 'muted'}` }, r.pending ? h('a', { href: '#inbox' }, r.status) : r.status))))
      : h('p', { class: 'muted', style: { margin: 0 } }, ctx.importBatches === null ? 'Loading…' : 'Nothing yet.'));
  const hist = h('section', { class: 'card', 'aria-labelledby': 'hist' },
    h('h2', { id: 'hist' }, 'Import history'),
    !batches.length ? h('p', { class: 'muted', style: { margin: 0 } }, ctx.importBatches === null ? 'Loading…' : 'No imports yet. Each one you make is listed here.')
      : h('details', { class: 'hist' }, h('summary', null, `${batches.length} import${batches.length === 1 ? '' : 's'}, latest ${day(batches[0].imported_at)}`),
        batches.map((b) => {
          const s = batchSummary(b, ctx.all);
          const files = b.details?.files || [];
          return h('details', { class: 'hist-item' },
            h('summary', null, h('span', null, `${day(b.imported_at)} · ${b.file_name}`), h('span', { class: 'muted small' }, ` ${s.matched} matched · ${s.added} added (${s.pending} waiting, ${s.approved} approved) · ${s.duplicates} already had`)),
            h('div', { class: 'stats' },
              files.map((f) => h('div', null, h('span', { class: 'muted' }, `${f.name} (${f.account || BANK_NAME[f.bank] || f.bank})`), h('span', null, `${day(f.from)} to ${day(f.to)}, ${f.rows} lines`))),
              h('div', null, h('span', { class: 'muted' }, 'Matched to your entries (verified)'), h('span', null, String(s.matched))),
              h('div', null, h('span', { class: 'muted' }, 'Added, still waiting in the inbox'), h('span', null, String(s.pending))),
              h('div', null, h('span', { class: 'muted' }, 'Added and since approved'), h('span', null, String(s.approved))),
              h('div', null, h('span', { class: 'muted' }, 'Possible matches when imported'), h('span', null, String(s.uncertain))),
              h('div', null, h('span', { class: 'muted' }, 'Already in Money HQ (skipped)'), h('span', null, String(s.duplicates)))));
        })));
  return [cov, hist];
}
