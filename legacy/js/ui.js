// Small UI helpers. No alert() or confirm() anywhere in this app.

// First tap changes the button to a confirm label. A second tap within the timeout runs onConfirm.
// Returns a function that resets the button to its idle state.
export function armConfirm(button, idleLabel, confirmLabel, onConfirm, timeoutMs = 4000) {
  let timer = null;
  const reset = () => {
    clearTimeout(timer);
    timer = null;
    button.textContent = idleLabel;
    button.classList.remove('armed');
  };
  button.addEventListener('click', () => {
    if (timer === null) {
      button.textContent = confirmLabel;
      button.classList.add('armed');
      timer = setTimeout(reset, timeoutMs);
      return;
    }
    reset();
    onConfirm();
  });
  return reset;
}

// Builds an element without ever treating text as HTML, so bank descriptions can't inject anything.
//   h('button', { class: 'btn', onclick: fn }, 'Save')
const ATTRIBUTE_ONLY = new Set(['list', 'role', 'inputmode', 'autocomplete', 'enterkeyhint', 'form']);
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  let value;
  for (const [key, val] of Object.entries(attrs || {})) {
    if (val === false || val == null) continue;
    if (key === 'class') el.className = val;
    else if (key === 'for') el.htmlFor = val;
    else if (key === 'value') value = val;
    else if (key.startsWith('on') && typeof val === 'function') el.addEventListener(key.slice(2), val);
    else if (ATTRIBUTE_ONLY.has(key) || key.includes('-')) el.setAttribute(key, val === true ? '' : val);
    else if (key in el) el[key] = val;
    else el.setAttribute(key, val === true ? '' : val);
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  if (value !== undefined) el.value = value; // set last, so a select already has its options
  return el;
}

export const option = (value, label, selected = false) => h('option', { value, selected }, label);

const gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
export const fmtMoney = (n) => gbp.format(n);

// "18 Nov 2026" from "2026-11-18" (a plain date, so no time zone surprises).
export function fmtDay(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return 'Unknown';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

// For full timestamps such as the time a backup was made.
export function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Unknown';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

let toastTimer = null;
export function toast(message, kind = '') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.className = `toast show ${kind}`.trim();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 5000);
}

export const KIND_LABELS = {
  spending: 'Spending',
  income: 'Income',
  invested: 'Invested',
  payback: 'Paid back to me',
  internal: 'Move between my accounts',
  fund: 'Fund money',
  unsure: 'Not sure yet',
};
