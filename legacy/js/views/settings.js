// Accounts & Settings: accounts and balances, reconciliation, rules, data routes, security and appearance.
import { h, fmtDay, plural, toast, armConfirm, formatDate } from '../ui.js';
import { todayIso, r2, dayDiff } from '../money.js';
import { ACCOUNT_TYPES, accountsSummary, isLiability } from '../finance.js';
import { makeBackup, parseBackup, backupFileName } from '../backup.js';
import { keepBeforeRestore } from '../store.js';
import { summariseOldHistory, mergeHistory } from '../oldbackup.js';
import { encryptText, decryptText, isEncryptedBackup, encryptedBackupName } from '../crypto.js';
import { card, kpi, note, tip, grid, subnav, table, field, numInput, textInput, selectInput, listEditor, gbp0, gbp2, uid, emptyState } from '../kit.js';

const SUBS = [['accounts', 'Accounts'], ['data', 'Import & data'], ['rules', 'Rules'], ['security', 'Security & backups'], ['look', 'Appearance']];

const USUAL = [
  ['Ulster Bank', 'current'], ['Revolut', 'current'], ['Monzo', 'savings'], ['Capital One credit card', 'credit'],
  ['Trading 212 Cash ISA', 'savings'], ['InvestEngine S&S ISA', 'investment'], ['Workplace pension', 'pension'],
];

function download(name, text, type = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
}

export function initSettings(ctx, root) {
  const route = () => (ctx.route && ctx.route.sub) || 'accounts';
  const go = (s) => { location.hash = `settings/${s}`; };
  const rec = { id: '', statement: 0 };
  const sec = { pw: '', pw2: '', pwRestore: '', file: null, armed: false, status: '', ok: true };
  const filterText = { v: '' };
  const histState = { entries: null, status: '' };

  const setAccount = (items) => ctx.update((d) => {
    const old = new Map(d.accounts.map((a) => [a.id, a]));
    d.accounts = items.map((a) => (old.has(a.id) && Number(old.get(a.id).balance) !== Number(a.balance) ? { ...a, updated: todayIso() } : a));
  });

  // ---------------------------------------------------------------- Accounts
  function accounts(data, today) {
    const out = [];
    const s = accountsSummary(data.accounts);
    out.push(grid(4, kpi('Net worth', data.accounts.length ? gbp0(s.netWorth) : '—', 'assets minus debts', 'green'), kpi('Assets', gbp0(s.assets), plural(data.accounts.filter((a) => !isLiability(a)).length, 'account'), 'blue'),
      kpi('Debts', gbp0(s.liabilities), 'cards and loans', s.liabilities > 0 ? 'amber' : ''), kpi('Accessible', gbp0(s.accessible), 'cash and savings', '')));
    out.push(card('Accounts & balances', note('These are the balances you enter. They are not live bank data, and each shows the date you last updated it. For cards and loans, enter what you owe as a positive number.'),
      listEditor({
        items: data.accounts, empty: 'No accounts yet.', addLabel: 'Add an account',
        makeNew: () => ({ id: uid('acc'), name: 'New account', type: 'current', balance: 0, updated: today }),
        onChange: setAccount,
        itemTitle: (a) => `${a.name} · ${isLiability(a) ? '-' : ''}${gbp0(a.balance)}${a.updated ? ` · updated ${fmtDay(a.updated).slice(0, -5)}` : ''}`,
        fields: [{ key: 'name', label: 'Name' }, { key: 'type', label: 'Type', type: 'select', options: ACCOUNT_TYPES }, { key: 'balance', label: 'Balance (£)', type: 'number' },
          { key: 'limit', label: 'Credit limit (£, cards)', type: 'number' }, { key: 'apr', label: 'Interest rate % (cards, loans)', type: 'number' }, { key: 'dueDay', label: 'Payment due day of month', type: 'number' },
          { key: 'minPayment', label: 'Minimum payment (£)', type: 'number' }, { key: 'statementBalance', label: 'Statement balance (£)', type: 'number' }, { key: 'opportunity', label: 'This is an opportunity fund', type: 'check' }],
      }),
      h('div', { class: 'actions' },
        h('button', { class: 'btn ghost', type: 'button', onclick: () => ctx.update((d) => { let n = 0; for (const [name, type] of USUAL) if (!d.accounts.some((a) => a.name === name)) { d.accounts.push({ id: uid('acc'), name, type, balance: 0, updated: '' }); n++; } toast(n ? `Added ${n} accounts. Now enter each balance.` : 'You already have them.', n ? 'ok' : ''); }) }, 'Add my usual accounts'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => ctx.update((d) => { const L = d.settings.legacy || {}; let n = 0; for (const a of d.accounts) { if (/trading|cash isa/i.test(a.name) && L.isaBalance) { a.balance = Number(L.isaBalance); a.updated = todayIso(); n++; } if (/invest ?engine|s&s/i.test(a.name) && L.nwInv) { a.balance = Number(L.nwInv); a.updated = todayIso(); n++; } } toast(n ? `Filled ${n} balances from your old dashboard. Check them.` : 'No old balances to bring across (add the accounts first).', n ? 'ok' : ''); }) }, 'Fill balances from my old dashboard'))));

    // Reconcile against a statement
    const pick = data.accounts.find((a) => a.id === rec.id);
    let recBody = h('p', { class: 'empty' }, 'Choose an account above to compare it with a statement.');
    if (pick) {
      const since = pick.updated || '0000-00-00';
      const moves = data.transactions.filter((t) => t.account === pick.name && t.date > since);
      const net = r2(moves.reduce((a, t) => a + (t.direction === 'in' ? t.amount : -t.amount), 0));
      const expected = r2((Number(pick.balance) || 0) + (isLiability(pick) ? -net : net));
      const diff = r2(rec.statement - expected);
      recBody = h('div', null,
        h('dl', { class: 'facts' },
          h('div', null, h('dt', null, `Balance you entered${pick.updated ? ` on ${fmtDay(pick.updated)}` : ''}`), h('dd', null, gbp2(pick.balance))),
          h('div', null, h('dt', null, `Movements since then (${plural(moves.length, 'transaction')})`), h('dd', null, `${net >= 0 ? '+' : '-'}${gbp2(Math.abs(net))}`)),
          h('div', null, h('dt', null, 'Balance your transactions imply'), h('dd', null, gbp2(expected))),
          h('div', null, h('dt', null, 'Balance on your statement'), h('dd', null, gbp2(rec.statement))),
          h('div', null, h('dt', null, h('b', null, 'Difference')), h('dd', null, h('b', { class: Math.abs(diff) < 0.01 ? 'good-t' : 'bad-t' }, Math.abs(diff) < 0.01 ? 'Matches' : `${diff > 0 ? '+' : '-'}${gbp2(Math.abs(diff))}`)))),
        Math.abs(diff) >= 0.01 ? tip('They do not match. Common reasons: transactions not imported yet, a payment still pending, money moved between accounts that was not recorded, or a balance entered with a typo.') : null,
        h('button', { class: 'btn', type: 'button', onclick: () => { ctx.update((d) => { const a = d.accounts.find((x) => x.id === pick.id); a.balance = rec.statement; a.updated = todayIso(); }); toast('Balance updated to your statement.', 'ok'); } }, 'Set the balance to the statement figure'));
    }
    out.push(card('Reconcile with a statement', note('Check an account against your bank statement. If the figures differ, this shows by how much, and why it might be.'),
      h('div', { class: 'edgrid' }, field('Account', selectInput([['', 'Choose…'], ...data.accounts.map((a) => [a.id, a.name])], rec.id, (v) => { rec.id = v; render(); })), field('Balance on the statement (£)', numInput(rec.statement, (v) => { rec.statement = v; render(); }))), recBody,
      note('Transactions are matched to accounts by name, so an account called "Ulster Bank" picks up the transactions imported from Ulster Bank.')));
    return out;
  }

  // ---------------------------------------------------------------- Import & data
  function dataView(data) {
    const dates = data.transactions.map((t) => t.date).sort();
    return [
      card('Getting data in', note('The simplest routine: once a week, download the CSV statement from each bank and import them together. Money HQ works out which bank each file is from, sorts what it knows, catches duplicates and only asks you about the rest.', 'lead'),
        h('dl', { class: 'facts' }, h('div', null, h('dt', null, 'Transactions saved'), h('dd', null, String(data.transactions.length))), h('div', null, h('dt', null, 'Covering'), h('dd', null, dates.length ? `${fmtDay(dates[0]).slice(0, -5)} to ${fmtDay(dates[dates.length - 1])}` : 'nothing yet')),
          h('div', null, h('dt', null, 'Your shop rules'), h('dd', null, String(Object.keys(data.settings.merchantRules).length))), h('div', null, h('dt', null, 'Your private rules file'), h('dd', null, `${data.settings.payerRules.length} rules`))),
        h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', onclick: () => { location.hash = 'import'; } }, 'Import bank files'), h('button', { class: 'btn ghost', type: 'button', onclick: () => { location.hash = 'add'; } }, 'Add one by hand'),
          h('button', { class: 'btn ghost', type: 'button', onclick: () => { location.hash = 'transactions'; } }, 'See every transaction'), h('button', { class: 'btn ghost', type: 'button', onclick: () => { location.hash = 'data'; } }, 'Backup, restore & old dashboard'))),
      card("Keep my old dashboard's history", note('Brings across the headline numbers from each closed month of your previous finance dashboard: what you spent (by budget), invested and saved. Individual transactions are not copied, and your old backup file stays safe with you.'),
        h('div', { class: 'actions' },
          h('label', { class: 'btn ghost', for: 'hist-file' }, 'Choose old backup'),
          h('input', { type: 'file', id: 'hist-file', accept: '.json,application/json', hidden: true, onchange: async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            try { histState.entries = summariseOldHistory(JSON.parse(await file.text())); histState.status = ''; } catch (err) { histState.entries = null; histState.status = err instanceof SyntaxError ? "That file can't be read as a backup." : err.message; }
            render();
          } })),
        histState.entries ? h('div', null, histState.entries.length
          ? table([{ label: 'Pay cycle', align: 'left', get: (r) => `${fmtDay(r.start).slice(0, -5)} to ${fmtDay(r.end).slice(0, -5)}` }, { label: 'Spent', get: (r) => gbp0(r.spentTotal) }, { label: 'Invested', get: (r) => gbp0(r.invested) }, { label: 'Saved', get: (r) => gbp0(r.saved) }], histState.entries)
          : h('p', { class: 'empty' }, 'No closed months were found in that backup.'),
        histState.entries.length ? h('button', { class: 'btn', type: 'button', onclick: async () => { let added = 0; await ctx.update((d) => { added = mergeHistory(d, histState.entries); }); histState.status = added ? `Added ${plural(added, 'month')} to your history. Find it under Spending, History.` : 'Those months are already in your history.'; histState.entries = null; render(); } }, `Add ${plural(histState.entries.length, 'month')} to my history`) : null) : null,
        histState.status ? h('p', { class: 'status ok', role: 'status' }, histState.status) : null,
        data.history.length ? h('p', { class: 'muted' }, `${plural(data.history.length, 'month')} of history kept so far.`) : null),
      card('See every page filled in', note('Demo mode fills the whole app with obviously fake figures (every name says "Demo"), so you can see how each page looks with data. It lives in memory only: nothing is saved and your real data is never touched. Exit with the banner at the top.'),
        h('button', { class: 'btn', type: 'button', onclick: () => ctx.enterDemo() }, 'Try demo mode')),
      card('Automatic bank syncing', note('Not built in. Connecting straight to your banks needs a small server and an authorised data provider (Open Banking), which would change how private this app is. If you want it later, we would discuss the trade-offs first. Until then, a weekly CSV import is the quick, private route.')),
    ];
  }

  // ---------------------------------------------------------------- Rules
  function rules(data) {
    const entries = Object.entries(data.settings.merchantRules);
    const q = filterText.v.trim().toLowerCase();
    const shown = entries.filter(([k]) => !q || k.includes(q)).slice(0, 120);
    return [
      card('How things get sorted', note('Money HQ sorts each new transaction in this order: your private rules file (who is salary, a friend, you moving your own money), then the bank\'s own flags, then the shop rules below, then a best guess. Anything it is not sure about is shown for you to decide, and your choice is remembered here.')),
      card(`Shop rules (${entries.length})`, h('div', { class: 'edgrid' }, field('Search', textInput(filterText.v, (v) => { filterText.v = v; render(); }, { placeholder: 'shop name' }))),
        shown.length ? table([{ label: 'Shop', align: 'left', get: (r) => r[0].replace(/^in:/, 'money in from ') }, { label: 'Sorted as', align: 'left', get: (r) => `${r[1].kind}${r[1].category ? ` · ${r[1].category}` : ''}` },
          { label: '', get: (r) => h('button', { class: 'btn ghost small', type: 'button', onclick: () => ctx.update((d) => { delete d.settings.merchantRules[r[0]]; }) }, 'Forget') }], shown) : h('p', { class: 'empty' }, 'No shop rules yet. They appear as you sort transactions.'),
        entries.length > shown.length ? note(`Showing ${shown.length} of ${entries.length}. Search to narrow it down.`) : null),
    ];
  }

  // ---------------------------------------------------------------- Security & backups
  function security(data, today) {
    const out = [];
    out.push(card('Your data and privacy', note('Everything is stored in this browser on this device. Nothing is uploaded, there is no account and no server. The GitHub repository holds only the app, never your figures. Backups are plain files you keep yourself.', 'lead'),
      h('dl', { class: 'facts' }, h('div', null, h('dt', null, 'Transactions'), h('dd', null, String(data.transactions.length))), h('div', null, h('dt', null, 'Edits recorded in the audit trail'), h('dd', null, String(data.audit.length))))));
    const status = h('p', { class: `status ${sec.ok ? 'ok' : 'bad'}`, role: 'status' }, sec.status);
    out.push(card('Encrypted backup', note('Locks a backup with a password, so the file is unreadable without it. Choose a password you will remember: there is no way to recover a lost one.'),
      h('div', { class: 'edgrid' }, field('Password (8+ characters)', h('input', { class: 'inp', type: 'password', autocomplete: 'new-password', onchange: (e) => { sec.pw = e.target.value; } })), field('Type it again', h('input', { class: 'inp', type: 'password', autocomplete: 'new-password', onchange: (e) => { sec.pw2 = e.target.value; } }))),
      h('button', { class: 'btn', type: 'button', onclick: async () => {
        if (sec.pw !== sec.pw2) { sec.status = 'The two passwords do not match.'; sec.ok = false; render(); return; }
        try { const file = await encryptText(JSON.stringify(makeBackup(ctx.data)), sec.pw); download(encryptedBackupName(), JSON.stringify(file)); sec.status = 'Encrypted backup saved to your downloads.'; sec.ok = true; sec.pw = ''; sec.pw2 = ''; } catch (e) { sec.status = e.message; sec.ok = false; }
        render();
      } }, 'Download encrypted backup'),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => { download(backupFileName(), JSON.stringify(makeBackup(ctx.data))); sec.status = 'Plain backup saved. Anyone who has the file can read it, so keep it somewhere private.'; sec.ok = true; render(); } }, 'Download plain backup'), status));
    const restoreStatus = h('p', { class: `status ${sec.rok ? 'ok' : 'bad'}`, role: 'status' }, sec.rstatus || '');
    const restoreBtn = h('button', { class: 'btn danger', type: 'button' }, 'Restore from encrypted backup');
    armConfirm(restoreBtn, 'Restore from encrypted backup', 'Tap again: this replaces your data', async () => {
      try {
        if (!sec.file) throw new Error('Choose the encrypted backup file first.');
        const obj = JSON.parse(await sec.file.text());
        if (!isEncryptedBackup(obj)) throw new Error("That file isn't an encrypted Money HQ backup.");
        const parsed = parseBackup(await decryptText(obj, sec.pwRestore));
        await keepBeforeRestore(ctx.data);
        await ctx.update((d) => { for (const k of Object.keys(d)) delete d[k]; Object.assign(d, parsed.data); });
        sec.rstatus = `Restored ${plural(parsed.transactionCount, 'transaction')}. A copy of what was here before was kept.`; sec.rok = true; sec.pwRestore = '';
      } catch (e) { sec.rstatus = e.message; sec.rok = false; }
      render();
    });
    out.push(card('Restore an encrypted backup', note('This replaces what is saved on this device. A safety copy of the current data is kept first.'),
      h('div', { class: 'edgrid' }, field('Backup file', h('input', { class: 'inp', type: 'file', accept: 'application/json,.json', onchange: (e) => { sec.file = e.target.files[0] || null; } })), field('Password', h('input', { class: 'inp', type: 'password', autocomplete: 'current-password', onchange: (e) => { sec.pwRestore = e.target.value; } }))), restoreBtn, restoreStatus));
    out.push(card('Audit trail', note('Edits made with the transaction tools are recorded here: what changed and when.'),
      data.audit.length ? table([{ label: 'When', align: 'left', get: (r) => formatDate(r.ts) }, { label: 'What', align: 'left', get: (r) => r.what }], data.audit.slice(-15).reverse()) : h('p', { class: 'empty' }, 'No edits recorded yet.')));
    out.push(card('Cloud storage', note('There is none. If you ever want your data synced between devices, that would need a login and secure storage, and we would design that together first. For now, move data with a backup file.')));
    return out;
  }

  // ---------------------------------------------------------------- Appearance
  function look(data) {
    const st = data.settings;
    return [
      card('Theme', note('Light, dark, or follow your device.'),
        h('div', { class: 'edgrid' }, field('Appearance', selectInput([['auto', 'Match my device'], ['light', 'Light'], ['dark', 'Dark']], st.theme, (v) => ctx.update((d) => { d.settings.theme = v; }))))),
      card('Finance HQ layout', note('Reorder or hide the cards on the Finance HQ page with its Customise button.'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => ctx.update((d) => { d.settings.widgets = { order: [], hidden: [] }; }) }, 'Reset the layout')),
      card('Pay dates', note('A pay cycle runs from one payday to the day before the next. Add your upcoming paydays so budgets and "safe to spend" count the right days.'),
        listEditor({ items: (st.paydates || []).map((d, i) => ({ id: String(i), date: d })), empty: 'No paydays entered.', addLabel: 'Add a payday', makeNew: () => ({ id: uid('pd'), date: todayIso() }),
          onChange: (items) => ctx.update((d) => { d.settings.paydates = [...new Set(items.map((x) => x.date).filter(Boolean))].sort(); }), fields: [{ key: 'date', label: 'Payday', type: 'date' }] })),
    ];
  }

  function render() {
    root.replaceChildren();
    const data = ctx.data;
    const today = todayIso();
    const sub = SUBS.some((s) => s[0] === route()) ? route() : 'accounts';
    root.append(subnav(SUBS, sub, go));
    try { for (const el of { accounts, data: dataView, rules, security, look }[sub](data, today)) root.append(el); } catch (err) { root.append(card('Something went wrong drawing this page', note(err.message))); }
  }

  return { render };
}
