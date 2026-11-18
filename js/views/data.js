// The Data screen: backup, restore, and bringing across the old dashboard.
import { loadData, saveData, getMeta, setMeta, keepBeforeRestore, emptyData, SCHEMA_VERSION } from '../store.js';
import { makeBackup, backupFileName, parseBackup } from '../backup.js';
import { convertOldBackup, mergeOldBackup, countOldDuplicates } from '../oldbackup.js';
import { armConfirm, formatDate, plural } from '../ui.js';

export function initData(ctx) {
  const $ = (id) => document.getElementById(id);
  let pendingRestore = null;
  let pendingOld = null;

  function setStatus(message, kind = '') {
    const el = $('status');
    el.textContent = message;
    el.className = `status ${kind}`.trim();
  }

  async function render() {
    const meta = await getMeta().catch(() => ({}));
    $('fact-tx').textContent = String(ctx.data.transactions.length);
    $('fact-backup').textContent = meta.lastBackupAt ? formatDate(meta.lastBackupAt) : 'Never';
    $('fact-schema').textContent = String(ctx.data.schemaVersion ?? SCHEMA_VERSION);
  }

  // ---- Download backup ----
  $('btn-download').addEventListener('click', async () => {
    try {
      const now = new Date();
      const blob = new Blob([JSON.stringify(makeBackup(ctx.data, now), null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = backupFileName(now);
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      await setMeta({ lastBackupAt: now.toISOString() });
      setStatus('Backup downloaded. It stays on this device only, so keep a copy somewhere safe.', 'ok');
      await render();
    } catch (err) {
      setStatus(`Could not make a backup: ${err.message}`, 'bad');
    }
  });

  // ---- Restore backup (replaces what is saved, after two taps) ----
  const restorePanel = $('restore-panel');
  function hideRestorePanel() {
    pendingRestore = null;
    restorePanel.hidden = true;
    resetRestoreButton();
  }
  const resetRestoreButton = armConfirm($('btn-restore'), 'Restore backup', 'Tap again to replace my data', async () => {
    if (!pendingRestore) return;
    try {
      const current = await loadData();
      if (current) await keepBeforeRestore(current);
      await saveData(pendingRestore.data);
      ctx.data = pendingRestore.data;
      hideRestorePanel();
      setStatus('Restored. Your previous data is kept as a safety copy on this device.', 'ok');
      ctx.refresh();
    } catch (err) {
      setStatus(`Restore failed. Nothing was changed: ${err.message}`, 'bad');
    }
  });
  $('btn-cancel-restore').addEventListener('click', () => {
    hideRestorePanel();
    setStatus('Restore cancelled. Nothing was changed.');
  });
  $('file-restore').addEventListener('change', async (event) => {
    const input = event.target;
    const file = input.files[0];
    input.value = '';
    if (!file) return;
    try {
      pendingRestore = parseBackup(await file.text());
      resetRestoreButton();
      $('restore-info').textContent =
        `Ready to restore a backup made ${pendingRestore.exported ? formatDate(pendingRestore.exported) : 'on an unknown date'}, ` +
        `with ${pendingRestore.transactionCount} transactions. This replaces the data saved on this device. ` +
        'Your current data is kept as a safety copy first.';
      restorePanel.hidden = false;
      setStatus('');
    } catch (err) {
      hideRestorePanel();
      setStatus(err.message, 'bad');
    }
  });

  // ---- Bring across the old dashboard (adds to what you have; nothing is replaced) ----
  const oldPanel = $('old-panel');
  const oldStatus = (message, kind = '') => { $('old-status').textContent = message; $('old-status').className = `status ${kind}`.trim(); };
  $('file-old').addEventListener('change', async (event) => {
    const input = event.target;
    const file = input.files[0];
    input.value = '';
    if (!file) return;
    try {
      let obj;
      try { obj = JSON.parse(await file.text()); } catch { throw new Error("That file isn't a backup: it can't be read as JSON."); }
      pendingOld = convertOldBackup(obj);
      const s = pendingOld.summary;
      const dups = countOldDuplicates(ctx.data, pendingOld);
      $('old-info').textContent =
        `Found ${plural(s.current + s.closedTransactions, 'transaction')} (${s.current} this pay cycle, ${s.closedTransactions} from ${plural(s.closedMonths, 'closed month')}), ` +
        `${plural(s.rules, 'shop rule')}, ${plural(s.payDates, 'pay date')} and ${plural(s.potEntries, 'pot entry', 'pot entries')}.` +
        `${dups ? ` ${dups} are already saved and will be skipped.` : ''}${s.skipped ? ` ${s.skipped} could not be read and will be left out.` : ''} Nothing you already have is replaced.`;
      oldPanel.hidden = false;
      oldStatus('');
    } catch (err) {
      pendingOld = null;
      oldPanel.hidden = true;
      oldStatus(err.message, 'bad');
    }
  });
  $('btn-cancel-old').addEventListener('click', () => { pendingOld = null; oldPanel.hidden = true; oldStatus('Cancelled. Nothing was changed.'); });
  $('btn-old-import').addEventListener('click', async () => {
    if (!pendingOld) return;
    try {
      const result = await ctx.update((data) => mergeOldBackup(data, pendingOld));
      pendingOld = null;
      oldPanel.hidden = true;
      oldStatus(`Brought across ${plural(result.added, 'transaction')}${result.duplicates ? ` (${result.duplicates} were already saved)` : ''}, plus your shop rules, pay dates, budgets and pots.`, 'ok');
    } catch (err) {
      oldStatus(`Nothing was changed: ${err.message}`, 'bad');
    }
  });

  return { render, emptyData };
}
