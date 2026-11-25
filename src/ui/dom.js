// A tiny helper for building elements. Text always goes in as text, never as HTML,
// so a description like "<script>" from a bank file can never run.
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

// Inline SVG icons (stroke style from the reference designs). Built from fixed markup only.
const ICONS = {
  overview: '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>',
  transactions: '<path d="M5 7h14M5 12h14M5 17h9"/>',
  budgets: '<circle cx="12" cy="12" r="8"/><path d="M12 4v8l6 4"/>',
  trends: '<path d="M4 18l5-6 4 3 7-9"/>',
  goals: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/>',
  wealth: '<path d="M4 20h16M6 16V10M10 16V7M14 16v-5M18 16V5"/>',
  plan: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>',
  more: '<circle cx="6" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18" cy="12" r="1.2"/>',
  add: '<path d="M12 5v14M5 12h14"/>',
};
export function icon(name, size = 18, stroke = 'currentColor', width = 1.8) {
  const span = document.createElement('span');
  span.style.display = 'inline-flex';
  span.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="${width}" aria-hidden="true">${ICONS[name]}</svg>`;
  return span;
}

export const logo = () => {
  const span = document.createElement('span');
  span.style.display = 'inline-flex';
  span.innerHTML = '<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><rect width="28" height="28" rx="8" fill="#E8ECF2"/><rect x="7" y="15" width="3.5" height="6" rx="1.5" fill="#0B1016"/><rect x="12.25" y="11" width="3.5" height="10" rx="1.5" fill="#0B1016"/><rect x="17.5" y="7" width="3.5" height="14" rx="1.5" fill="#0B1016"/></svg>';
  return span;
};
