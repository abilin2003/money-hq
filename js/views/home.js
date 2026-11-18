// The Home screen. For now it shows what data is in; the "Am I okay?" picture arrives in Phase 2.
import { fmtDay, plural } from '../ui.js';

export function initHome(ctx) {
  const $ = (id) => document.getElementById(id);

  function render() {
    const txs = ctx.data.transactions;
    if (!txs.length) {
      $('home-msg').textContent = 'Nothing to worry about yet. Bring your data in, and this page will tell you where things stand in plain words.';
      $('home-coverage').textContent = 'No transactions saved yet.';
      $('home-go').hidden = false;
      return;
    }
    const dates = txs.map((t) => t.date).sort();
    const accounts = [...new Set(txs.map((t) => t.account).filter(Boolean))].sort();
    const internal = txs.filter((t) => t.kind === 'internal').length;
    const unsure = txs.filter((t) => t.kind === 'unsure').length;
    $('home-msg').textContent = 'Your data is in. The full picture (what is safe to spend, what is going well, what to do next) comes in the next phase.';
    const lines = [`${plural(txs.length, 'transaction')} from ${fmtDay(dates[0])} to ${fmtDay(dates[dates.length - 1])}`];
    if (accounts.length) lines.push(`Accounts: ${accounts.join(', ')}`);
    if (internal) lines.push(`${plural(internal, 'move')} between your own accounts left out of every total`);
    if (unsure) lines.push(`${plural(unsure, 'transaction')} still need a decision: find them in the List tab under "Not sure yet"`);
    $('home-coverage').textContent = lines.join(' · ');
    $('home-go').hidden = true;
  }

  return { render };
}
