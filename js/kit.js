// A small kit of building blocks shared by every screen: cards, tiles, tables, editors, charts and the
// "show me the transactions behind this" sheet. Nothing here knows about money rules.
import { h, option, fmtMoney, fmtDay, armConfirm } from './ui.js';
import { loadChartJs, applyChartTheme } from './charts.js';

export const gbp0 = (n) => `${n < 0 ? '-' : ''}£${Math.round(Math.abs(n)).toLocaleString('en-GB')}`;
export const gbp2 = (n) => fmtMoney(n);
export const pctText = (n) => `${Math.round(n)}%`;
export const clamp = (n, a = 0, b = 100) => Math.max(a, Math.min(b, n));
export const uid = (p = 'id') => `${p}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-3)}`;

// ---------------------------------------------------------------- layout
export const card = (title, ...kids) => h('section', { class: 'card' }, title ? h('h2', null, title) : null, ...kids);
export const note = (text, cls = 'muted') => h('p', { class: cls }, text);
export const tip = (text) => h('p', { class: 'tip' }, text);
export const grid = (cols, ...kids) => h('div', { class: `grid g${cols}` }, ...kids);

// A headline tile: label, big number, a line of context. tone: green | blue | amber | purple | red | ''
export const kpi = (label, value, sub, tone = '') =>
  h('div', { class: `stat c-${tone || 'white'}` }, h('div', { class: 'stat-l' }, label), h('div', { class: 'stat-v' }, value), sub ? h('div', { class: 'stat-s' }, sub) : null);

// A progress bar. tone: ok | near | over (see the CSS).
export const meter = (pct, tone = 'ok', label) =>
  h('div', { class: 'bar', role: 'progressbar', 'aria-valuenow': String(Math.round(clamp(pct))), 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-label': label || 'progress' },
    h('span', { class: `fill ${tone}`, style: `width:${clamp(pct)}%` }));

export const insightCard = (i) =>
  h('div', { class: `insight lv-${i.level}` }, h('b', null, i.title), h('p', null, i.body));

export function subnav(items, active, onPick) {
  return h('div', { class: 'subtabs', role: 'tablist' }, items.map(([id, label]) =>
    h('button', { class: `chip ${active === id ? 'on' : ''}`, type: 'button', role: 'tab', 'aria-selected': String(active === id), onclick: () => onPick(id) }, label)));
}

// ---------------------------------------------------------------- tables
// cols: [{ label, get(row), align?, cls? }]  rows: objects.  onRow(row) makes rows clickable.
export function table(cols, rows, onRow) {
  return h('div', { class: 'tablewrap' }, h('table', { class: 'mtable' },
    h('thead', null, h('tr', null, cols.map((c) => h('th', { class: c.align === 'left' ? 'l' : '' }, c.label)))),
    h('tbody', null, rows.map((r) => h('tr', { class: onRow ? 'click' : '', tabindex: onRow ? '0' : null, onclick: onRow ? () => onRow(r) : null, onkeydown: onRow ? (e) => { if (e.key === 'Enter') onRow(r); } : null },
      cols.map((c) => h('td', { class: `${c.align === 'left' ? 'l' : ''} ${c.cls || ''}` }, c.get(r))))))));
}

// ---------------------------------------------------------------- inputs (commit on change, so typing is never interrupted)
const num = (v) => (v === '' || v == null ? '' : v);
export const field = (label, input) => h('label', { class: 'field' }, label, input);
export const textInput = (value, commit, attrs = {}) => h('input', { class: 'inp', type: 'text', value: value ?? '', onchange: (e) => commit(e.target.value), ...attrs });
export const numInput = (value, commit, attrs = {}) => h('input', { class: 'inp', type: 'number', inputmode: 'decimal', step: 'any', value: num(value), onchange: (e) => commit(e.target.value === '' ? 0 : Number(e.target.value)), ...attrs });
export const dateInput = (value, commit, attrs = {}) => h('input', { class: 'inp', type: 'date', value: value || '', onchange: (e) => commit(e.target.value), ...attrs });
export const selectInput = (options, value, commit, attrs = {}) => h('select', { class: 'inp', onchange: (e) => commit(e.target.value), ...attrs }, options.map(([v, l]) => option(v, l, v === value)));
export const checkInput = (label, value, commit) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!value, onchange: (e) => commit(e.target.checked) }), label);

// Edit a list of things (accounts, goals, bills...). fields: [{ key, label, type: text|number|date|select|check, options? }]
// `onChange(newItems)` is called after any edit; the caller saves. Delete needs a second tap (no pop-ups).
export function listEditor({ items, fields, onChange, addLabel = 'Add', makeNew, empty = 'Nothing here yet.', itemTitle }) {
  const set = (i, patch) => onChange(items.map((it, k) => (k === i ? { ...it, ...patch } : it)));
  const rows = items.map((it, i) => {
    const del = h('button', { class: 'btn danger small', type: 'button' }, 'Delete');
    armConfirm(del, 'Delete', 'Tap again to delete', () => onChange(items.filter((_, k) => k !== i)));
    return h('div', { class: 'edrow' },
      itemTitle ? h('b', { class: 'edtitle' }, itemTitle(it)) : null,
      h('div', { class: 'edgrid' }, fields.map((f) => {
        const v = it[f.key];
        const input = f.type === 'number' ? numInput(v, (x) => set(i, { [f.key]: x }))
          : f.type === 'date' ? dateInput(v, (x) => set(i, { [f.key]: x }))
            : f.type === 'select' ? selectInput(f.options, v, (x) => set(i, { [f.key]: x }))
              : f.type === 'check' ? checkInput(f.label, v, (x) => set(i, { [f.key]: x }))
                : textInput(v, (x) => set(i, { [f.key]: x }));
        return f.type === 'check' ? input : field(f.label, input);
      })), del);
  });
  return h('div', { class: 'editor' }, rows.length ? rows : h('p', { class: 'empty' }, empty),
    h('button', { class: 'btn ghost', type: 'button', onclick: () => onChange([...items, makeNew()]) }, addLabel));
}

// ---------------------------------------------------------------- charts
export function createRegistry() {
  let list = [];
  return { add: (c) => list.push(c), clear() { for (const c of list) c.destroy(); list = []; } };
}

// A chart you can drop into a card. `build(Chart)` returns a Chart.js config. If the library can't load, the box says so calmly.
export function plot(reg, aria, build, height = 280) {
  const canvas = h('canvas', { role: 'img', 'aria-label': aria });
  const box = h('div', { class: 'chartbox', style: `height:${height}px` }, canvas);
  loadChartJs().then((Chart) => {
    if (!canvas.isConnected) return;
    applyChartTheme(Chart);
    reg.add(new Chart(canvas, build(Chart)));
  }).catch((e) => box.replaceChildren(h('p', { class: 'empty' }, `${e.message} Everything else on this page still works.`)));
  return box;
}

export const PALETTE = ['#7c8cff', '#ff6b8b', '#2ee6b6', '#ffc857', '#b794ff', '#22e1d0', '#ff9f5a', '#4cc9ff', '#ff7ac6', '#a3e635', '#7e8aa3'];
const axisMoney = (v) => (Math.abs(v) >= 1000 ? `£${v / 1000}k` : `£${v}`);
const tipMoney = (ctx) => ` ${ctx.dataset.label || ctx.label}: ${gbp0(ctx.raw)}`;
const baseOpts = { responsive: true, maintainAspectRatio: false, animation: { duration: 250 } };
const legendBottom = { position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true } };

// Config builders. `pick(index)` makes the chart clickable (used to open the transactions behind a bar or slice).
export const cfg = {
  doughnut: (labels, values, pick, colors) => ({
    type: 'doughnut',
    data: { labels, datasets: [{ data: values, backgroundColor: colors || labels.map((_, i) => PALETTE[i % PALETTE.length]), borderWidth: 0 }] },
    options: { ...baseOpts, cutout: '62%', onClick: pick ? (e, els) => { if (els.length) pick(els[0].index); } : undefined, onHover: (e, els) => { e.native.target.style.cursor = pick && els.length ? 'pointer' : 'default'; },
      plugins: { legend: legendBottom, tooltip: { callbacks: { label: (c) => ` ${c.label}: ${gbp0(c.raw)}` } } } },
  }),
  hbar: (labels, values, pick, color = '#7c8cff') => ({
    type: 'bar',
    data: { labels, datasets: [{ data: values, backgroundColor: color, borderWidth: 0 }] },
    options: { ...baseOpts, indexAxis: 'y', onClick: pick ? (e, els) => { if (els.length) pick(els[0].index); } : undefined, onHover: (e, els) => { e.native.target.style.cursor = pick && els.length ? 'pointer' : 'default'; },
      scales: { x: { beginAtZero: true, ticks: { callback: axisMoney } }, y: { grid: { display: false } } }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${gbp0(c.raw)}` } } } },
  }),
  // datasets: [{ label, data, color, type? ('line'), stack?, yAxisID? }]
  bars: (labels, datasets, { stacked = false, pick, y2 } = {}) => ({
    type: 'bar',
    data: { labels, datasets: datasets.map((d, i) => ({ label: d.label, data: d.data, type: d.type, backgroundColor: d.color || PALETTE[i % PALETTE.length], borderColor: d.color || PALETTE[i % PALETTE.length], borderWidth: d.type === 'line' ? 2 : 0, borderRadius: d.type === 'line' ? 0 : stacked ? 3 : 6, borderSkipped: false, pointRadius: 0, tension: 0.35, yAxisID: d.yAxisID, stack: stacked && d.type !== 'line' ? 'a' : undefined, order: d.type === 'line' ? 0 : 1 })) },
    options: { ...baseOpts, interaction: { mode: 'index', intersect: false }, onClick: pick ? (e, els) => { if (els.length) pick(els[0].index, els[0].datasetIndex); } : undefined,
      onHover: (e, els) => { e.native.target.style.cursor = pick && els.length ? 'pointer' : 'default'; },
      scales: { x: { stacked, grid: { display: false } }, y: { stacked, beginAtZero: true, ticks: { callback: axisMoney } }, ...(y2 ? { y2: { position: 'right', beginAtZero: true, grid: { display: false }, ticks: { callback: axisMoney } } } : {}) },
      plugins: { legend: legendBottom, tooltip: { callbacks: { label: tipMoney } } } },
  }),
  lines: (labels, datasets, { fill = false, zero = true } = {}) => ({
    type: 'line',
    data: { labels, datasets: datasets.map((d, i) => ({ label: d.label, data: d.data, borderColor: d.color || PALETTE[i % PALETTE.length], backgroundColor: `${d.color || PALETTE[i % PALETTE.length]}22`, fill: d.fill ?? fill, borderWidth: 2, pointRadius: d.data.length > 40 ? 0 : 3, tension: 0.25, borderDash: d.dash || [] })) },
    options: { ...baseOpts, interaction: { mode: 'index', intersect: false },
      scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 8, maxRotation: 0 } }, y: { beginAtZero: zero, ticks: { callback: axisMoney } } },
      plugins: { legend: datasets.length > 1 ? legendBottom : { display: false }, tooltip: { callbacks: { label: tipMoney } } } },
  }),
};

// ---------------------------------------------------------------- "show me the transactions behind this"
export function openDrill(title, txs, sub) {
  document.getElementById('drill')?.remove();
  const total = txs.reduce((a, t) => a + (t.direction === 'in' ? -t.amount : t.amount), 0);
  const close = () => { document.getElementById('drill')?.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  const list = txs.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 250);
  const sheet = h('div', { id: 'drill', class: 'sheet-wrap', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, onclick: (e) => { if (e.target.id === 'drill') close(); } },
    h('div', { class: 'sheet' },
      h('div', { class: 'sheet-head' }, h('div', null, h('b', null, title), h('div', { class: 'muted small' }, `${txs.length} transaction${txs.length === 1 ? '' : 's'} · ${gbp2(Math.abs(total))}${sub ? ` · ${sub}` : ''}`)), h('button', { class: 'btn ghost small', type: 'button', onclick: close }, 'Close')),
      h('div', { class: 'txlist' }, list.map((t) => h('div', { class: 'txrow static' },
        h('div', { class: 'tx-main' }, h('b', null, t.desc), h('span', { class: 'tx-meta' }, `${fmtDay(t.date)} · ${t.category || 'No bucket'}${t.detail ? ` · ${t.detail}` : ''} · ${t.account}${t.note ? ` · ${t.note}` : ''}`)),
        h('div', { class: 'tx-right' }, h('span', { class: `amt ${t.direction === 'in' ? 'in' : ''}` }, `${t.direction === 'in' ? '+' : ''}${gbp2(t.amount)}`)))),
      txs.length > list.length ? h('p', { class: 'muted' }, `Showing the newest ${list.length}. Use the List tab to see them all.`) : null)));
  document.body.append(sheet);
  sheet.querySelector('button')?.focus();
}

// A calm empty state with a button to the place that fixes it.
export const emptyState = (text, label, hash) => h('div', { class: 'emptybox' }, h('p', null, text), label ? h('button', { class: 'btn', type: 'button', onclick: () => { location.hash = hash; } }, label) : null);
