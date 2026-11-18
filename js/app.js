import { SCHEMA_VERSION, loadData, saveData, emptyData, getMeta, setMeta, keepBeforeRestore } from './store.js';
import { makeBackup, backupFileName, parseBackup } from './backup.js';
import { armConfirm, formatDate } from './ui.js';

const $ = (id) => document.getElementById(id);
let pendingRestore = null;

function setStatus(message, kind = '') {
  const el = $('status');
  el.textContent = message;
  el.className = `status ${kind}`.trim();
}

async function refresh() {
  const data = await loadData();
  const meta = await getMeta();
  $('fact-tx').textContent = data ? String(data.transactions.length) : '0';
  $('fact-backup').textContent = meta.lastBackupAt ? formatDate(meta.lastBackupAt) : 'Never';
  $('fact-schema').textContent = String(data ? data.schemaVersion : SCHEMA_VERSION);
}

// ---- Download backup ----
$('btn-download').addEventListener('click', async () => {
  try {
    const data = (await loadData()) ?? emptyData();
    const now = new Date();
    const blob = new Blob([JSON.stringify(makeBackup(data, now), null, 2)], { type: 'application/json' });
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
    await refresh();
  } catch (err) {
    setStatus(`Could not make a backup: ${err.message}`, 'bad');
  }
});

// ---- Restore backup ----
const restorePanel = $('restore-panel');

function hideRestorePanel() {
  pendingRestore = null;
  restorePanel.hidden = true;
  resetRestoreButton();
}

const resetRestoreButton = armConfirm(
  $('btn-restore'),
  'Restore backup',
  'Tap again to replace my data',
  async () => {
    if (!pendingRestore) return;
    try {
      const current = await loadData();
      if (current) await keepBeforeRestore(current);
      await saveData(pendingRestore.data);
      hideRestorePanel();
      setStatus('Restored. Your previous data is kept as a safety copy on this device.', 'ok');
      await refresh();
    } catch (err) {
      setStatus(`Restore failed. Nothing was changed: ${err.message}`, 'bad');
    }
  },
);

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

// ---- Start up ----
refresh().catch((err) => setStatus(`Could not open your saved data: ${err.message}`, 'bad'));

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
