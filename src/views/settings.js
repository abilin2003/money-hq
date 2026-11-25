// Settings: paydays, accounts, backups (plain or password-protected) and restore, installing on your phone,
// and signing out.
import { h } from '../ui/dom.js';
import { isIsoDate } from '../lib/dates.js';
import { cycleFor, cycleName } from '../lib/cycles.js';
import { head, shortDay, alertLine } from '../ui/parts.js';
import { saveSettings, saveAccount, exportAll, restoreAll } from '../lib/data.js';
import { encryptText, decryptText, isEncryptedBackup } from '../lib/crypto.js';

const TYPES = [['current', 'Current account'], ['savings', 'Savings'], ['credit_card', 'Credit card'], ['isa', 'ISA'], ['investment', 'Investments'], ['pension', 'Pension'], ['cash', 'Cash']];

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function settingsPage(ctx, rerender) {
  const st = ctx.ref.settings || {};
  const paydays = [...(st.paydays || [])].sort();
  const next = cycleFor(ctx.today, paydays, st.payday_usual_day || 24);

  // ---- paydays
  const newDay = h('input', { class: 'input', type: 'date', 'aria-label': 'Add a payday' });
  const addDay = h('button', { class: 'btn', type: 'button', onclick: async () => {
    if (!isIsoDate(newDay.value)) { alertLine(addDay, 'Pick a date.'); return; }
    try { ctx.ref.settings = await saveSettings(st, { paydays: [...new Set([...paydays, newDay.value])].sort() }); ctx.planDraft = null; rerender(); } catch (err) { alertLine(addDay, err.message); }
  } }, 'Add payday');
  const usual = h('input', { class: 'input', type: 'number', min: 1, max: 31, value: st.payday_usual_day || 24, 'aria-label': 'Usual payday (day of the month)', onchange: async (e) => {
    const d = Number(e.target.value);
    if (!(d >= 1 && d <= 31)) return;
    try { ctx.ref.settings = await saveSettings(st, { payday_usual_day: d }); rerender(); } catch (err) { alertLine(e.target, err.message); }
  } });
  const dayRows = paydays.slice(-6).reverse().map((d) => h('div', { class: 'billrow' }, h('span', { class: 'muted small' }, d.slice(0, 4)), h('span', null, shortDay(d)),
    h('button', { class: 'linkbtn', type: 'button', onclick: async (e) => { const b = e.currentTarget; if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Tap again'; return; } ctx.ref.settings = await saveSettings(st, { paydays: paydays.filter((x) => x !== d) }); rerender(); } }, 'Remove')));

  // ---- accounts
  const accRows = ctx.ref.accounts.map((a) => h('div', { class: 'catrow three' },
    h('input', { class: 'input', value: a.name, 'aria-label': `Rename ${a.name}`, onchange: async (e) => { try { const s = await saveAccount({ id: a.id, name: e.target.value.trim() || a.name }); ctx.ref.accounts = ctx.ref.accounts.map((x) => (x.id === s.id ? s : x)); ctx.relabel(); rerender(); } catch (err) { alertLine(e.target, err.message); } } }),
    h('select', { class: 'input', 'aria-label': `${a.name} type`, onchange: async (e) => { const s = await saveAccount({ id: a.id, type: e.target.value }); ctx.ref.accounts = ctx.ref.accounts.map((x) => (x.id === s.id ? s : x)); rerender(); } }, TYPES.map(([v, l]) => h('option', { value: v, selected: v === a.type }, l))),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: a.is_active !== false, onchange: async (e) => { const s = await saveAccount({ id: a.id, is_active: e.target.checked }); ctx.ref.accounts = ctx.ref.accounts.map((x) => (x.id === s.id ? s : x)); rerender(); } }), 'In use')));
  const accName = h('input', { class: 'input', placeholder: 'New account name', 'aria-label': 'New account name' });
  const accType = h('select', { class: 'input', 'aria-label': 'New account type' }, TYPES.map(([v, l]) => h('option', { value: v }, l)));
  const accAdd = h('button', { class: 'btn', type: 'button', onclick: async () => {
    if (!accName.value.trim()) return;
    try { const s = await saveAccount({ name: accName.value.trim(), type: accType.value, import_format: 'manual', is_active: true }); ctx.ref.accounts = [...ctx.ref.accounts, s]; rerender(); } catch (err) { alertLine(accAdd, err.message); }
  } }, 'Add account');

  // ---- backups
  const status = h('p', { class: 'muted small', role: 'status' });
  const plainBtn = h('button', { class: 'btn', type: 'button', onclick: async () => {
    status.textContent = 'Preparing…';
    try { const b = await exportAll(); download(`money-hq-backup-${ctx.today}.json`, JSON.stringify(b)); status.textContent = `Downloaded ${b.tables.transactions.length} transactions and everything else. Keep it somewhere private.`; } catch (err) { status.textContent = err.message; }
  } }, 'Download backup');
  const pw = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', placeholder: 'Backup password (8+ characters)', 'aria-label': 'Backup password' });
  const encBtn = h('button', { class: 'btn primary', type: 'button', onclick: async () => {
    status.textContent = 'Encrypting…';
    try { const b = await exportAll(); download(`money-hq-backup-encrypted-${ctx.today}.json`, JSON.stringify(await encryptText(JSON.stringify(b), pw.value))); pw.value = ''; status.textContent = 'Downloaded a password-protected backup. Without the password it can’t be opened, by anyone.'; } catch (err) { status.textContent = err.message; }
  } }, 'Download password-protected backup');
  const file = h('input', { type: 'file', accept: '.json,application/json', 'aria-label': 'Backup file to restore', class: 'input' });
  const rpw = h('input', { class: 'input', type: 'password', autocomplete: 'off', placeholder: 'Password (if it’s a protected backup)', 'aria-label': 'Backup password for restore' });
  const restore = h('button', { class: 'btn', type: 'button', onclick: async () => {
    if (!file.files[0]) { status.textContent = 'Choose a backup file first.'; return; }
    if (restore.dataset.armed !== '1') { restore.dataset.armed = '1'; restore.textContent = 'Tap again to restore'; status.textContent = 'Restoring adds back anything missing. It never deletes or changes what’s already here.'; return; }
    status.textContent = 'Restoring…';
    try {
      let obj = JSON.parse(await file.files[0].text());
      if (isEncryptedBackup(obj)) obj = JSON.parse(await decryptText(obj, rpw.value));
      const counts = await restoreAll(obj);
      status.textContent = `Restored: ${counts.transactions || 0} transactions checked. Reloading…`;
      setTimeout(() => location.reload(), 1200);
    } catch (err) { status.textContent = err.message; restore.dataset.armed = ''; restore.textContent = 'Restore'; }
  } }, 'Restore');

  return h('div', { class: 'page' },
    head('Settings'),
    h('section', { class: 'card', 'aria-labelledby': 'pd' },
      h('h2', { id: 'pd' }, 'Paydays'),
      h('p', { class: 'muted small', style: { marginTop: 0 } }, `This cycle: ${cycleName(next)}, ${shortDay(next.start)} to ${shortDay(next.end)}. Next payday ${shortDay(next.next)}${next.predicted ? ' (predicted: add it when you know it)' : ''}.`),
      dayRows,
      h('div', { class: 'edit-grid', style: { marginTop: '10px' } }, newDay, addDay, h('label', { class: 'field' }, 'Usual payday when one isn’t entered', usual))),
    h('section', { class: 'card', 'aria-labelledby': 'ac' }, h('h2', { id: 'ac' }, 'Accounts'), accRows, h('div', { class: 'edit-grid', style: { marginTop: '10px' } }, accName, accType, accAdd)),
    h('section', { class: 'card', 'aria-labelledby': 'bk' },
      h('h2', { id: 'bk' }, 'Backups'),
      h('p', { class: 'muted small', style: { marginTop: 0 } }, 'Everything is in your Supabase database. A backup is a copy for safekeeping; keep it outside the money-hq folder.'),
      h('div', { class: 'edit-grid' }, plainBtn, pw, encBtn),
      h('h3', { class: 'small-h', style: { marginTop: '16px' } }, 'Restore from a backup'),
      h('div', { class: 'edit-grid' }, file, rpw, restore),
      status),
    h('section', { class: 'card', 'aria-labelledby': 'in' },
      h('h2', { id: 'in' }, 'Put Money HQ on your phone'),
      h('p', { class: 'small', style: { margin: 0 } }, 'iPhone: open the site in Safari, tap Share, then Add to Home Screen. Android: open it in Chrome, tap ⋮, then Install app. Press and hold the icon for Quick add.')),
    h('section', { class: 'card' }, h('p', { class: 'muted small', style: { margin: '0 0 10px' } }, `Signed in as ${ctx.email}.`), h('button', { class: 'btn', type: 'button', onclick: ctx.signOut }, 'Sign out')));
}
