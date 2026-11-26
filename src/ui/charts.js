// Small SVG charts in the Midnight style (spec section 9): direct labels instead of legends, no donuts,
// bucket colours, tabular figures. Each chart can take onPick(i) so a bar or day opens what's behind it.
const NS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined && v !== false) el.setAttribute(k, v);
  for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return el;
};
const gbp = (p) => `£${Math.round(p / 100).toLocaleString('en-GB')}`;
const niceMax = (v) => { if (v <= 0) return 100; const p = 10 ** Math.floor(Math.log10(v)); const m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; };
const C = { grid: '#1E2833', axis: '#5F6B7A', text2: '#C3CAD4', muted: '#8E99A8', accent: '#8B9CFF', text: '#E8ECF2', surface: '#121923' };

function frame(w, h, label) {
  return s('svg', { viewBox: `0 0 ${w} ${h}`, width: '100%', role: 'img', 'aria-label': label, class: 'chart' });
}
function yAxis(svg, max, x0, x1, y0, y1, ticks = 4) {
  for (let i = 0; i <= ticks; i++) {
    const v = (max / ticks) * i;
    const y = y0 - ((y0 - y1) * i) / ticks;
    svg.append(s('line', { x1: x0, x2: x1, y1: y, y2: y, stroke: C.grid, 'stroke-width': 1 }));
    svg.append(s('text', { x: x0 - 6, y: y + 4, fill: C.axis, 'font-size': 11, 'text-anchor': 'end' }, gbp(v)));
  }
}

// Pace chart: running spend this cycle vs the budget line vs last cycle's pace. Spec: Overview hero.
// days: total days; spentByDay: cumulative pence per day so far; budget, lastTotal: pence.
// onDay({ day, spent, budgetLine, lastLine }) makes it interactive: point, tap or use the arrow keys to read any day
// (spent is null for days still to come); onDay(null) when the pointer leaves.
export function paceChart({ days, today, spentByDay, budget, lastTotal, startLabel, endLabel, onDay = null }) {
  const W = 520; const H = 190; const x0 = 46; const x1 = 508; const y0 = 150; const y1 = 20;
  const max = niceMax(Math.max(budget, lastTotal, spentByDay[spentByDay.length - 1] || 0) * 1.05);
  const X = (d) => x0 + ((x1 - x0) * d) / Math.max(1, days);
  const Y = (p) => y0 - ((y0 - y1) * p) / max;
  const svg = frame(W, H, `Spending this cycle: ${gbp(spentByDay[spentByDay.length - 1] || 0)} so far, against a ${gbp(budget)} budget line and last cycle's ${gbp(lastTotal)}`);
  yAxis(svg, max, x0, x1, y0, y1);
  if (lastTotal) svg.append(s('line', { x1: X(0), y1: Y(0), x2: X(days), y2: Y(lastTotal), stroke: C.axis, 'stroke-width': 1.5, 'stroke-dasharray': '2 4' }));
  if (budget) svg.append(s('line', { x1: X(0), y1: Y(0), x2: X(days), y2: Y(budget), stroke: C.muted, 'stroke-width': 1.5, 'stroke-dasharray': '6 5' }));
  svg.append(s('line', { x1: X(today), x2: X(today), y1: y1 - 6, y2: y0, stroke: '#2A3644', 'stroke-width': 1 }));
  const pts = [[X(0), Y(0)], ...spentByDay.map((p, i) => [X(i + 1), Y(p)])];
  svg.append(s('polyline', { points: pts.map((p) => p.join(',')).join(' '), fill: 'none', stroke: C.accent, 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  const last = pts[pts.length - 1];
  svg.append(s('circle', { cx: last[0], cy: last[1], r: 5, fill: C.accent, stroke: C.surface, 'stroke-width': 2 }));
  if (lastTotal) svg.append(s('text', { x: x1, y: Y(lastTotal) - 6, fill: C.muted, 'font-size': 11, 'text-anchor': 'end' }, `Last cycle, ${gbp(lastTotal)}`));
  if (budget) svg.append(s('text', { x: x1, y: Y(budget) + (Math.abs(Y(budget) - Y(lastTotal)) < 14 ? 16 : -6), fill: C.text2, 'font-size': 11, 'text-anchor': 'end' }, `Budget, ${gbp(budget)}`));
  svg.append(s('text', { x: Math.min(X(today) + 6, x1 - 40), y: 12, fill: C.text2, 'font-size': 11 }, 'Today'));
  svg.append(s('text', { x: x0, y: H - 14, fill: C.axis, 'font-size': 11 }, startLabel));
  svg.append(s('text', { x: x1, y: H - 14, fill: C.axis, 'font-size': 11, 'text-anchor': 'end' }, endLabel));
  if (onDay) {
    const guide = s('line', { y1: y1 - 6, y2: y0, stroke: C.text2, 'stroke-width': 1, opacity: 0, 'pointer-events': 'none' });
    const dot = s('circle', { r: 4.5, fill: C.text, opacity: 0, 'pointer-events': 'none' });
    let cur = Math.max(1, today);
    const zone = s('rect', { x: x0, y: y1 - 6, width: x1 - x0, height: y0 - y1 + 6, fill: 'transparent', tabindex: 0, role: 'slider', 'aria-label': 'Day of the cycle', 'aria-valuemin': 1, 'aria-valuemax': days, class: 'pick-zone' });
    const show = (d) => {
      cur = Math.max(1, Math.min(days, d));
      const spent = cur <= spentByDay.length ? spentByDay[cur - 1] : null;
      guide.setAttribute('x1', X(cur)); guide.setAttribute('x2', X(cur)); guide.setAttribute('opacity', 1);
      if (spent !== null) { dot.setAttribute('cx', X(cur)); dot.setAttribute('cy', Y(spent)); dot.setAttribute('opacity', 1); } else dot.setAttribute('opacity', 0);
      zone.setAttribute('aria-valuenow', cur);
      onDay({ day: cur, spent, budgetLine: budget ? Math.round((budget * cur) / days) : null, lastLine: lastTotal ? Math.round((lastTotal * cur) / days) : null });
    };
    const hide = () => { guide.setAttribute('opacity', 0); dot.setAttribute('opacity', 0); onDay(null); };
    const at = (e) => { const r = svg.getBoundingClientRect(); return Math.round(((((e.clientX - r.left) / r.width) * W - x0) / (x1 - x0)) * days); };
    zone.addEventListener('pointermove', (e) => show(at(e)));
    zone.addEventListener('pointerdown', (e) => show(at(e)));
    zone.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hide(); });
    zone.addEventListener('focus', () => show(cur));
    zone.addEventListener('blur', hide);
    zone.addEventListener('keydown', (e) => {
      const step = { ArrowLeft: -1, ArrowRight: 1, Home: -days, End: days }[e.key];
      if (step) { e.preventDefault(); show(cur + step); }
    });
    svg.append(guide, dot, zone);
  }
  return svg;
}

// Stacked bars per period. series: [{ name, colour, values: [pence per period] }]. avg line optional.
export function stackedBars({ labels, series, avg = null, onPick, label = 'Spending per period' }) {
  const W = 640; const H = 240; const x0 = 52; const x1 = 630; const y0 = 200; const y1 = 16;
  const totals = labels.map((_, i) => series.reduce((a, se) => a + Math.max(0, se.values[i] || 0), 0));
  const max = niceMax(Math.max(...totals, avg || 0) * 1.05);
  const Y = (p) => y0 - ((y0 - y1) * p) / max;
  const step = (x1 - x0) / labels.length;
  const bw = Math.min(36, step * 0.6);
  const svg = frame(W, H, label);
  yAxis(svg, max, x0, x1, y0, y1);
  labels.forEach((lab, i) => {
    let acc = 0;
    const cx = x0 + step * i + step / 2;
    const g = s('g', { class: onPick ? 'pick' : null, tabindex: onPick ? 0 : null, role: onPick ? 'button' : null, 'aria-label': `${lab}: ${gbp(totals[i])}` });
    for (const se of series) {
      const v = Math.max(0, se.values[i] || 0);
      if (!v) continue;
      g.append(s('rect', { x: cx - bw / 2, y: Y(acc + v), width: bw, height: Math.max(0, Y(acc) - Y(acc + v)), fill: se.colour, rx: 2 }, s('title', {}, `${se.name}: ${gbp(v)}`)));
      acc += v;
    }
    g.append(s('rect', { x: cx - step / 2, y: y1, width: step, height: y0 - y1, fill: 'transparent' }));
    if (onPick) { g.addEventListener('click', () => onPick(i)); g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(i); } }); }
    svg.append(g);
    svg.append(s('text', { x: cx, y: H - 22, fill: C.axis, 'font-size': 11, 'text-anchor': 'middle' }, lab));
    svg.append(s('text', { x: cx, y: Y(totals[i]) - 5, fill: C.text2, 'font-size': 10, 'text-anchor': 'middle' }, totals[i] ? gbp(totals[i]) : ''));
  });
  if (avg) {
    svg.append(s('line', { x1: x0, x2: x1, y1: Y(avg), y2: Y(avg), stroke: '#F7B955', 'stroke-width': 1.5, 'stroke-dasharray': '6 4' }));
    svg.append(s('text', { x: x1, y: Y(avg) - 5, fill: '#F7B955', 'font-size': 11, 'text-anchor': 'end' }, `Average ${gbp(avg)}`));
  }
  return svg;
}

// Grouped bars per period: [{ name, colour, values }], e.g. money in / spent / invested.
export function groupedBars({ labels, series, onPick, label = 'Money in and out' }) {
  const W = 640; const H = 240; const x0 = 52; const x1 = 630; const y0 = 200; const y1 = 16;
  const max = niceMax(Math.max(1, ...series.flatMap((se) => se.values)) * 1.05);
  const Y = (p) => y0 - ((y0 - y1) * p) / max;
  const step = (x1 - x0) / labels.length;
  const bw = Math.min(14, (step * 0.8) / series.length);
  const svg = frame(W, H, label);
  yAxis(svg, max, x0, x1, y0, y1);
  labels.forEach((lab, i) => {
    const cx = x0 + step * i + step / 2;
    const g = s('g', { class: onPick ? 'pick' : null, tabindex: onPick ? 0 : null, role: onPick ? 'button' : null, 'aria-label': `${lab}: ${series.map((se) => `${se.name} ${gbp(se.values[i] || 0)}`).join(', ')}` });
    series.forEach((se, k) => {
      const v = Math.max(0, se.values[i] || 0);
      g.append(s('rect', { x: cx - (bw * series.length) / 2 + k * bw, y: Y(v), width: bw - 2, height: y0 - Y(v), fill: se.colour, rx: 2 }, s('title', {}, `${se.name}: ${gbp(v)}`)));
    });
    g.append(s('rect', { x: cx - step / 2, y: y1, width: step, height: y0 - y1, fill: 'transparent' }));
    if (onPick) g.addEventListener('click', () => onPick(i));
    svg.append(g);
    svg.append(s('text', { x: cx, y: H - 22, fill: C.axis, 'font-size': 11, 'text-anchor': 'middle' }, lab));
  });
  series.forEach((se, k) => {
    svg.append(s('rect', { x: x0 + k * 120, y: H - 10, width: 10, height: 10, rx: 2, fill: se.colour }));
    svg.append(s('text', { x: x0 + k * 120 + 15, y: H - 1, fill: C.text2, 'font-size': 11 }, se.name));
  });
  return svg;
}

// Lines over time: [{ name, colour, values }] with direct end labels.
export function lineChart({ labels, series, label = 'Over time', percent = false }) {
  const W = 640; const H = 220; const x0 = 52; const x1 = 560; const y0 = 180; const y1 = 16;
  const all = series.flatMap((se) => se.values.filter((v) => v !== null));
  const lo = Math.min(0, ...all);
  const max = percent ? Math.max(100, ...all) : niceMax(Math.max(1, ...all) * 1.05);
  const Y = (v) => y0 - ((y0 - y1) * (v - lo)) / (max - lo || 1);
  const X = (i) => x0 + ((x1 - x0) * i) / Math.max(1, labels.length - 1);
  const svg = frame(W, H, label);
  for (let i = 0; i <= 4; i++) {
    const v = lo + ((max - lo) / 4) * i;
    svg.append(s('line', { x1: x0, x2: x1, y1: Y(v), y2: Y(v), stroke: C.grid }));
    svg.append(s('text', { x: x0 - 6, y: Y(v) + 4, fill: C.axis, 'font-size': 11, 'text-anchor': 'end' }, percent ? `${Math.round(v)}%` : gbp(v)));
  }
  labels.forEach((lab, i) => { if (labels.length <= 8 || i % Math.ceil(labels.length / 8) === 0 || i === labels.length - 1) svg.append(s('text', { x: X(i), y: H - 16, fill: C.axis, 'font-size': 11, 'text-anchor': 'middle' }, lab)); });
  for (const se of series) {
    const pts = se.values.map((v, i) => (v === null ? null : [X(i), Y(v)])).filter(Boolean);
    if (!pts.length) continue;
    svg.append(s('polyline', { points: pts.map((p) => p.join(',')).join(' '), fill: 'none', stroke: se.colour, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }));
    for (const p of pts) svg.append(s('circle', { cx: p[0], cy: p[1], r: 3, fill: se.colour }));
    const lastV = se.values.filter((v) => v !== null).pop();
    const end = pts[pts.length - 1];
    svg.append(s('text', { x: end[0] + 8, y: end[1] + 4, fill: se.colour, 'font-size': 11 }, `${se.name} ${percent ? `${Math.round(lastV)}%` : gbp(lastV)}`));
  }
  return svg;
}

// Bridge (waterfall) from one total to another, one step per bucket. steps: [{ name, delta (pence) }].
export function bridgeChart({ fromLabel, from, steps, toLabel, label = 'What changed' }) {
  const W = 640; const H = 230; const x0 = 52; const x1 = 630; const y0 = 180; const y1 = 16;
  const to = from + steps.reduce((a, st) => a + st.delta, 0);
  let run = from;
  const levels = [from, ...steps.map((st) => (run += st.delta)), to];
  const max = niceMax(Math.max(...levels, from) * 1.05);
  const Y = (p) => y0 - ((y0 - y1) * p) / max;
  const n = steps.length + 2;
  const step = (x1 - x0) / n;
  const bw = Math.min(40, step * 0.6);
  const svg = frame(W, H, label);
  yAxis(svg, max, x0, x1, y0, y1);
  const bar = (i, top, bottom, fill, name, text) => {
    const cx = x0 + step * i + step / 2;
    svg.append(s('rect', { x: cx - bw / 2, y: Y(Math.max(top, bottom)), width: bw, height: Math.max(1, Math.abs(Y(top) - Y(bottom))), fill, rx: 2 }));
    svg.append(s('text', { x: cx, y: H - 30, fill: C.axis, 'font-size': 10.5, 'text-anchor': 'middle' }, name.length > 11 ? `${name.slice(0, 10)}…` : name));
    svg.append(s('text', { x: cx, y: Y(Math.max(top, bottom)) - 5, fill: C.text2, 'font-size': 10, 'text-anchor': 'middle' }, text));
  };
  bar(0, from, 0, '#5F6B7A', fromLabel, gbp(from));
  run = from;
  steps.forEach((st, i) => { const before = run; run += st.delta; bar(i + 1, run, before, st.delta > 0 ? '#FF8A80' : '#5BD6A0', st.name, `${st.delta > 0 ? '+' : '−'}${gbp(Math.abs(st.delta))}`); });
  bar(n - 1, to, 0, C.accent, toLabel, gbp(to));
  return svg;
}

// Calendar of a cycle, darker on bigger days. days: [{ date, pence }].
export function calendarChart({ days, onPick, label = 'Spending by day' }) {
  const cols = 7; const size = 34; const gap = 4;
  const first = new Date(`${days[0].date}T12:00:00Z`).getUTCDay();
  const offset = (first + 6) % 7; // Monday first
  const rows = Math.ceil((offset + days.length) / cols);
  const W = cols * (size + gap); const H = rows * (size + gap) + 18;
  const max = Math.max(1, ...days.map((d) => d.pence));
  const svg = frame(W, H, label);
  ['M', 'T', 'W', 'T', 'F', 'S', 'S'].forEach((d, i) => svg.append(s('text', { x: i * (size + gap) + size / 2, y: 11, fill: C.axis, 'font-size': 10, 'text-anchor': 'middle' }, d)));
  days.forEach((d, i) => {
    const k = offset + i;
    const x = (k % cols) * (size + gap); const y = 18 + Math.floor(k / cols) * (size + gap);
    const a = d.pence ? 0.18 + 0.82 * (d.pence / max) : 0;
    const g = s('g', { class: onPick && d.pence ? 'pick' : null, tabindex: onPick && d.pence ? 0 : null, role: onPick && d.pence ? 'button' : null, 'aria-label': `${d.date}: ${gbp(d.pence)}` });
    g.append(s('rect', { x, y, width: size, height: size, rx: 6, fill: d.pence ? `rgba(139,156,255,${a.toFixed(2)})` : C.grid, stroke: d.today ? C.text : 'none', 'stroke-width': 1.5 }, s('title', {}, `${d.date}: ${gbp(d.pence)}`)));
    g.append(s('text', { x: x + 5, y: y + 13, fill: d.pence && a > 0.6 ? '#0B1016' : C.muted, 'font-size': 10 }, String(+d.date.slice(8, 10))));
    if (onPick && d.pence) g.addEventListener('click', () => onPick(d));
    svg.append(g);
  });
  return svg;
}

// Sankey-style flow: pay on the left into groups on the right. flows: [{ name, pence, colour }].
export function payFlow({ total, flows, label = 'Where your pay went' }) {
  const W = 640; const gap = 6; const H = Math.max(200, flows.length * 26 + 40);
  const usable = H - 20 - gap * (flows.length - 1);
  const sum = flows.reduce((a, f) => a + f.pence, 0) || 1;
  const svg = frame(W, H, label);
  const leftH = H - 20;
  svg.append(s('rect', { x: 10, y: 10, width: 14, height: leftH, rx: 3, fill: C.text2 }));
  svg.append(s('text', { x: 32, y: 26, fill: C.text, 'font-size': 12, 'font-weight': 600 }, `Pay ${gbp(total)}`));
  let ly = 10; let ry = 10;
  for (const f of flows) {
    const lh = (leftH * f.pence) / sum;
    const rh = Math.max(4, (usable * f.pence) / sum);
    const xL = 24; const xR = 420;
    const path = `M${xL},${ly} C${(xL + xR) / 2},${ly} ${(xL + xR) / 2},${ry} ${xR},${ry} L${xR},${ry + rh} C${(xL + xR) / 2},${ry + rh} ${(xL + xR) / 2},${ly + lh} ${xL},${ly + lh} Z`;
    svg.append(s('path', { d: path, fill: f.colour, opacity: 0.35 }, s('title', {}, `${f.name}: ${gbp(f.pence)}`)));
    svg.append(s('rect', { x: xR, y: ry, width: 10, height: rh, rx: 2, fill: f.colour }));
    svg.append(s('text', { x: xR + 16, y: ry + Math.min(rh, 16) / 2 + 5, fill: C.text2, 'font-size': 12 }, `${f.name} ${gbp(f.pence)}`));
    ly += lh; ry += rh + gap;
  }
  return svg;
}

export { gbp as chartGbp };
