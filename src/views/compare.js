// Analytics → Compare: two pay cycles (or months) side by side, and exactly which categories, shops and payments
// make up the difference. The rows add up to the whole difference (lib/explore.js compare()).
//   #compare/a=c.2026-09-24&b=c.2026-10-26          the two periods
//            &k=Going out | &mm=pizza place          open a category or shop in the panel
//            &t=<id>                                  open one of its transactions
import { h } from '../ui/dom.js';
import { formatPence } from '../lib/money.js';
import { cycleList, cycleName } from '../lib/cycles.js';
import { monthName } from '../lib/summary.js';
import { resolvePeriod, previousPeriod, encodePeriod, decodePeriod } from '../lib/period.js';
import { spendLines, inRange, total, compare, shopName } from '../lib/explore.js';
import { head, shortDay, pounds } from '../ui/parts.js';
import { bridgeChart } from '../ui/charts.js';
import { panel } from '../ui/panel.js';
import { periodInfo, lineRow, txPanel } from './explorer.js';

const signed = (p) => `${p > 0 ? '+' : p < 0 ? '−' : ''}${pounds(Math.abs(p))}`;
const money = (p) => `${p < 0 ? '−' : ''}${pounds(Math.abs(p))}`; // paybacks and refunds can make a row negative

export function comparePage(ctx, param, rerender) {
  const q = new URLSearchParams(param || '');
  const info = periodInfo(ctx);
  // B defaults to the period you're looking at in Analytics (if it's one cycle or month), A to the one before it.
  const lastSel = ctx.period && ['cycle', 'current', 'month'].includes(ctx.period.kind) ? ctx.period : { kind: 'current' };
  const B = resolvePeriod(q.get('b') ? decodePeriod(q.get('b')) : lastSel, info);
  const A = q.get('a') ? resolvePeriod(decodePeriod(q.get('a')), info) : previousPeriod(B, info);
  const code = (x) => (x.current ? 'cur' : encodePeriod(x.sel.kind === 'range' ? { kind: 'cycle', start: x.from } : x.sel));
  const href = (extra = {}) => { const u = new URLSearchParams({ a: code(A), b: code(B), ...extra }); return `#compare/${u.toString()}`; };

  const cycles = cycleList(info.paydays, info.firstDate, info.today, info.usualDay);
  const months = [];
  for (let ym = info.today.slice(0, 7); ym >= info.firstDate.slice(0, 7); ym = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 2, 1)).toISOString().slice(0, 7)) months.push(ym);
  const picker = (which, x) => {
    const s = h('select', { class: 'input', 'aria-label': `Period ${which}`, onchange: (e) => { const u = new URLSearchParams({ a: code(A), b: code(B) }); u.set(which.toLowerCase(), e.target.value); location.hash = `#compare/${u.toString()}`; } },
      h('optgroup', { label: 'Pay cycles' }, h('option', { value: 'cur' }, `Current cycle (${cycleName(cycles[0])})`), cycles.slice(1).map((c) => h('option', { value: `c.${c.start}` }, `${cycleName(c)} ${c.end.slice(0, 4)} (${shortDay(c.start)} to ${shortDay(c.end)})`))),
      h('optgroup', { label: 'Calendar months' }, months.map((ym) => h('option', { value: `m.${ym}` }, monthName(ym)))));
    s.value = code(x);
    return h('label', { class: 'cmp-pick' }, h('span', { class: `cmp-tag ${which === 'A' ? 'ta' : 'tb'}` }, which), s);
  };

  if (!A) {
    return h('div', { class: 'page' }, head('Compare', 'Pick two periods to compare.'), h('section', { class: 'card cmp-pickers' }, picker('A', B), picker('B', B)));
  }

  const la = spendLines(info.rows.filter(inRange(A.from, A.to)), ctx.splitMap, ctx.settled, info.merchants);
  const lb = spendLines(info.rows.filter(inRange(B.from, B.to)), ctx.splitMap, ctx.settled, info.merchants);
  const ta = total(la); const tb = total(lb);
  const byBucket = compare(la, lb, (l) => l.bucket);
  const byCat = compare(la, lb, (l) => l.category);
  const byShop = compare(la, lb, (l) => l.merchant);
  const nameA = A.label.replace(/ \(current\)$/, ''); const nameB = B.label.replace(/ \(current\)$/, '');

  const pickers = h('section', { class: 'card cmp-pickers', 'aria-label': 'Periods to compare' }, picker('A', A), h('span', { class: 'muted', 'aria-hidden': 'true' }, 'vs'), picker('B', B),
    h('a', { class: 'btn', href: (() => { const u = new URLSearchParams({ a: code(B), b: code(A) }); return `#compare/${u.toString()}`; })() }, 'Swap'));
  const tiles = h('div', { class: 'tiles three' },
    h('div', { class: 'card tile' }, h('span', { class: 'muted small' }, h('span', { class: 'cmp-tag ta' }, 'A'), ` ${nameA}`), h('span', { class: 'tile-v display' }, pounds(ta)), h('span', { class: 'muted small' }, `${pounds(ta / A.days)} a day · ${A.days} days`)),
    h('div', { class: 'card tile' }, h('span', { class: 'muted small' }, h('span', { class: 'cmp-tag tb' }, 'B'), ` ${nameB}`), h('span', { class: 'tile-v display' }, pounds(tb)), h('span', { class: 'muted small' }, `${pounds(tb / B.days)} a day · ${B.days} days${B.current ? ' (so far)' : ''}`)),
    h('div', { class: 'card tile' }, h('span', { class: 'muted small' }, 'Difference (B − A)'), h('span', { class: `tile-v display ${tb > ta ? 'over' : 'good'}` }, signed(tb - ta)), h('span', { class: 'muted small' }, ta ? `${tb >= ta ? 'up' : 'down'} ${Math.abs(Math.round(((tb - ta) / ta) * 100))}%` : '')));

  const bridge = h('section', { class: 'card', 'aria-labelledby': 'cb' }, h('h2', { id: 'cb' }, 'What made the difference, by bucket'),
    bridgeChart({ fromLabel: 'A', from: ta, steps: byBucket.filter((r) => r.diff).slice(0, 8).map((r) => ({ name: r.key, delta: r.diff })).concat(byBucket.slice(8).some((r) => r.diff) ? [{ name: 'Others', delta: byBucket.slice(8).reduce((a, r) => a + r.diff, 0) }] : []), toLabel: 'B', label: `From ${pounds(ta)} to ${pounds(tb)}` }));

  const nm = (r, key) => (key === 'mm' ? shopName([...r.linesB, ...r.linesA]) : r.key);
  const table = (rows, key, title, id) => h('section', { class: 'card', 'aria-labelledby': id },
    h('div', { class: 'ch' }, h('h2', { id }, title), h('span', { class: 'muted small' }, 'biggest change first · tap one')),
    h('div', { class: 'cmp-row cmp-head muted small' }, h('span', null, ''), h('span', { class: 'r' }, 'A'), h('span', { class: 'r' }, 'B'), h('span', { class: 'r' }, 'Change')),
    rows.slice(0, 12).map((r) => h('a', { href: href({ [key]: r.key }), class: 'cmp-row linkrow' },
      h('span', { class: 'cname' }, nm(r, key), !r.a ? h('span', { class: 'muted small' }, ' · new') : !r.b ? h('span', { class: 'muted small' }, ' · none in B') : null),
      h('span', { class: 'r muted' }, money(r.a)), h('span', { class: 'r' }, money(r.b)), h('span', { class: `r ${r.diff > 0 ? 'over' : r.diff < 0 ? 'good' : 'muted'}` }, signed(r.diff)))),
    rows.length > 12 ? h('div', { class: 'cmp-row muted small' }, h('span', null, `${rows.length - 12} more`), h('span', { class: 'r' }, pounds(rows.slice(12).reduce((a, r) => a + r.a, 0))), h('span', { class: 'r' }, pounds(rows.slice(12).reduce((a, r) => a + r.b, 0))), h('span', { class: 'r' }, signed(rows.slice(12).reduce((a, r) => a + r.diff, 0)))) : null,
    h('div', { class: 'cmp-row btotal' }, h('span', null, 'Total'), h('span', { class: 'r' }, pounds(ta)), h('span', { class: 'r' }, pounds(tb)), h('span', { class: `r ${tb > ta ? 'over' : 'good'}` }, signed(tb - ta))));

  // ---- the panel: a category or shop, with the payments on each side that make up the change
  let drawer = null;
  const k = q.get('k'); const mm = q.get('mm'); const txId = q.get('t');
  if (k || mm) {
    const pick = (l) => (k ? l.category === k : true) && (mm ? l.merchant === mm : true);
    const sa = la.filter(pick).sort((x, y) => y.cost - x.cost); const sb = lb.filter(pick).sort((x, y) => y.cost - x.cost);
    const keep = { ...(k ? { k } : {}), ...(mm ? { mm } : {}) };
    const mmName = mm ? shopName([...sa, ...sb]) || mm : null;
    const crumbs = [{ label: `${nameA} vs ${nameB}`, href: href() }, ...(k ? [{ label: k, href: href({ k }) }] : []), ...(mm ? [{ label: mmName, href: href(keep) }] : [])];
    const tx = txId && [...sa, ...sb].find((l) => l.id === txId);
    if (tx) drawer = txPanel(ctx, tx.t, [...crumbs, { label: tx.t.raw_description }], href(keep), rerender, href());
    else {
      const shops = k && !mm ? compare(sa, sb, (l) => l.merchant) : [];
      const side = (tag, list, name) => h('div', { class: 'panel-sec' }, h('h3', { class: 'small-h' }, h('span', { class: `cmp-tag ${tag}` }, tag === 'ta' ? 'A' : 'B'), ` ${name}: ${pounds(total(list))} (${list.length} line${list.length === 1 ? '' : 's'})`),
        list.length ? list.map((l) => lineRow(l, href({ ...keep, t: l.id }))) : h('p', { class: 'muted small' }, 'Nothing.'));
      drawer = panel({ title: mmName || k, crumbs, closeHref: href(),
        summary: h('p', { class: 'panel-sum' }, `${pounds(total(sa))} → ${pounds(total(sb))} · `, h('strong', { class: total(sb) > total(sa) ? 'over' : 'good' }, signed(total(sb) - total(sa)))),
        body: [shops.length > 1 ? h('div', { class: 'panel-sec' }, h('h3', { class: 'small-h' }, 'By shop or payee'),
          shops.slice(0, 10).map((r) => h('a', { href: href({ k, mm: r.key }), class: 'cmp-row linkrow' }, h('span', { class: 'cname' }, nm(r, 'mm')), h('span', { class: 'r muted' }, pounds(r.a)), h('span', { class: 'r' }, pounds(r.b)), h('span', { class: `r ${r.diff > 0 ? 'over' : 'good'}` }, signed(r.diff))))) : null,
        side('tb', sb, nameB), side('ta', sa, nameA)] });
    }
  }

  return h('div', { class: 'page' },
    head('Compare', `${nameA} against ${nameB}: ${tb >= ta ? `${pounds(tb - ta)} more` : `${pounds(ta - tb)} less`} spent in B. Tap a row to see the payments behind the change.`),
    pickers, tiles, bridge,
    h('div', { class: 'grid-even' }, table(byCat, 'k', 'By category', 'cc'), table(byShop, 'mm', 'By shop or payee', 'cs')),
    h('p', { class: 'muted small' }, `Every row adds up: the changes total ${formatPence(tb - ta)}, the same as B − A. Big buys paid from savings are included.`),
    drawer);
}
