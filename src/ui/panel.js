// A detail panel: slides in from the right on a laptop, comes up as a bottom sheet on a phone. It is part of the
// page address, so Back closes it and a link reopens it. Escape closes it too (see main.js).
import { h } from './dom.js';

export function panel({ title, crumbs = [], closeHref, body, summary = null }) {
  return h('div', { class: 'panel-wrap', 'data-close': closeHref },
    h('a', { class: 'panel-backdrop', href: closeHref, 'aria-label': 'Close the detail panel', tabindex: '-1' }),
    h('aside', { class: 'panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'panel-title' },
      h('div', { class: 'panel-grip', 'aria-hidden': 'true' }),
      h('div', { class: 'panel-head' },
        crumbs.length ? h('nav', { class: 'crumbs small', 'aria-label': 'Where you are' },
          crumbs.map((c, i) => [i ? h('span', { class: 'muted', 'aria-hidden': 'true' }, ' › ') : null, c.href ? h('a', { href: c.href }, c.label) : h('span', { 'aria-current': 'page' }, c.label)])) : null,
        h('div', { class: 'panel-title-row' },
          h('h2', { id: 'panel-title' }, title),
          h('a', { href: closeHref, class: 'panel-x', 'aria-label': 'Close' }, '×')),
        summary),
      h('div', { class: 'panel-body' }, body)));
}
