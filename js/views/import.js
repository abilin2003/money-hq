// Importing bank files. Drop in all your CSVs at once; only the uncertain rows need a look.
import { h, option, fmtMoney, fmtDay, plural, toast } from '../ui.js';
import { buildImportPlan, commitImport } from '../importer.js';
import { KINDS, INVESTED_ACCOUNTS } from '../seed.js';

// What you can choose for a group of similar lines. Values are "kind|category".
function choicesFor(direction, categories) {
  if (direction === 'out') {
    return [
      ...categories.map((c) => [`spending|${c}`, c]),
      ['spending|Uncategorised', 'Uncategorised spending'],
      ...INVESTED_ACCOUNTS.map((a) => [`invested|${a}`, `Invested: ${a}`]),
      ['internal|Transfer', 'Move between my accounts'],
      ['unsure|', 'Not sure yet'],
    ];
  }
  return [
    ['income|Income', 'Income'],
    ['payback|', 'Paid back to me (reduces spending)'],
    ['internal|Transfer', 'Move between my accounts'],
    ['fund|', 'Fund money (not mine)'],
    ['unsure|', 'Not sure yet'],
  ];
}

export function initImport(ctx, root) {
  let files = [];
  let plan = null;
  let choices = {};

  const fileInput = h('input', { id: 'file-csv', type: 'file', accept: '.csv,text/csv', multiple: true, hidden: true, onchange: onFiles });
  const rulesInput = h('input', { id: 'file-rules', type: 'file', accept: 'application/json,.json', hidden: true, onchange: onRules });
  const rulesInfo = h('p', { class: 'muted', id: 'rules-info' });
  const status = h('p', { class: 'status', id: 'import-status', role: 'status' });
  const planBox = h('div', { id: 'import-plan', hidden: true });

  root.append(
    h('section', { class: 'card' },
      h('h2', null, '1. Your payer rules'),
      h('p', { class: 'muted' }, 'Do this first. These private rules say who is salary, a friend paying you back, or you moving your own money, so far fewer lines need your attention. Choose your payer-rules file once; it is saved on this device only.'),
      rulesInfo,
      h('label', { class: 'btn ghost', for: 'file-rules' }, 'Choose rules file'), rulesInput),
    h('section', { class: 'card' },
      h('h2', null, '2. Import bank files'),
      h('p', { class: 'muted' }, 'Choose all your CSV files at once from Ulster Bank, Revolut and Monzo. I work out which bank each one is from. Files stay on this device.'),
      h('label', { class: 'btn', for: 'file-csv' }, 'Choose CSV files'), fileInput,
      status),
    planBox);

  const say = (message, kind = '') => { status.textContent = message; status.className = `status ${kind}`.trim(); };

  async function onFiles(event) {
    const picked = [...event.target.files];
    event.target.value = '';
    if (!picked.length) return;
    try {
      files = await Promise.all(picked.map(async (f) => ({ name: f.name, text: await f.text() })));
      rebuild();
    } catch (err) {
      say(`Could not read those files: ${err.message}`, 'bad');
    }
  }

  async function onRules(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const rules = Array.isArray(parsed) ? parsed : parsed.rules;
      if (!Array.isArray(rules)) throw new Error('I could not find a list of rules in that file.');
      for (const r of rules) {
        if (!r || typeof r.match !== 'string' || !r.match.trim()) throw new Error('Every rule needs a "match" name.');
        if (!KINDS.includes(r.label)) throw new Error(`"${r.label}" is not a label I know. Use one of: ${KINDS.join(', ')}.`);
      }
      await ctx.update((data) => { data.settings.payerRules = rules; });
      toast(`Loaded ${plural(rules.length, 'payer rule')}.`, 'ok');
      if (files.length) rebuild();
    } catch (err) {
      say(err instanceof SyntaxError ? "That file isn't readable JSON." : err.message, 'bad');
    }
  }

  function rebuild() {
    plan = buildImportPlan(files, ctx.data.settings, ctx.data.transactions);
    choices = {};
    renderPlan();
  }

  function renderPlan() {
    if (!plan) { planBox.hidden = true; return; }
    const { counts } = plan;
    const categories = ctx.data.settings.categories.map((c) => c.name);
    const groups = new Map();
    for (const r of plan.rows) {
      if (r.status !== 'review' && r.status !== 'suggested') continue;
      const g = groups.get(r.group) || { key: r.group, direction: r.direction, name: r.desc, count: 0, total: 0, first: r, others: new Set() };
      g.count += 1;
      g.total += r.amount;
      if (r.desc !== g.name) g.others.add(r.desc);
      groups.set(r.group, g);
    }
    const list = [...groups.values()].sort((a, b) => b.total - a.total);

    const fileLines = plan.files.map((f) => h('li', null,
      h('b', null, f.name), ' ',
      f.error ? h('span', { class: 'bad-t' }, f.error)
        : `${f.bank}: ${plural(f.rows, 'line')}, ${fmtDay(f.from)} to ${fmtDay(f.to)}${f.duplicates ? `, ${f.duplicates} already saved` : ''}${f.unreadable ? `, ${f.unreadable} with unreadable dates left out` : ''}`));

    const fact = (label, value) => h('div', null, h('dt', null, label), h('dd', null, String(value)));
    const tagInput = h('input', { id: 'import-tag', type: 'text', class: 'inp', placeholder: 'e.g. London trip' });
    const importBtn = h('button', { id: 'btn-import', class: 'btn', type: 'button', disabled: counts.toImport === 0, onclick: () => commit(tagInput.value.trim()) },
      counts.toImport ? `Import all ${plural(counts.toImport, 'transaction')}` : 'Nothing new to import');

    planBox.replaceChildren(h('section', { class: 'card' },
      h('h2', null, 'Ready to import'),
      h('ul', { class: 'filelist' }, fileLines),
      ctx.data.settings.payerRules.length ? null : h('p', { class: 'tip', id: 'rules-tip' },
        'Tip: you have not loaded your payer rules yet (step 1 above). Loading them first sorts salary, friends and your own moves automatically, and the list below gets much shorter. Choose them, then choose your files again.'),
      h('dl', { class: 'facts' },
        fact('To import', counts.toImport),
        fact('Sorted automatically', counts.auto),
        fact('Need a quick look', `${plural(list.length, 'group')} (${plural(counts.check, 'line')})`),
        fact('Moves between your accounts (left out of totals)', counts.internal),
        fact('Already saved, skipped', counts.duplicates + (counts.matchedByHand ? ` (${counts.matchedByHand} match entries you typed by hand)` : ''))),
      list.length ? h('p', { class: 'muted' }, 'Anything you leave alone is imported with my best guess, or as "Not sure yet" (left out of totals until you decide). Choosing here teaches me for next time.') : null,
      h('div', { class: 'groups', id: 'import-groups' }, list.map((g) => groupEl(g, categories))),
      h('div', { class: 'field' }, h('label', { for: 'import-tag' }, 'Tag all as (optional)'), tagInput),
      h('div', { class: 'actions' }, importBtn)));
    planBox.hidden = false;
  }

  function groupEl(g, categories) {
    const opts = choicesFor(g.direction, categories);
    const current = `${g.first.kind}|${g.first.category}`;
    if (!opts.some(([v]) => v === current)) opts.unshift([current, g.first.category ? `${g.first.category} (suggested)` : 'Suggested']);
    const sel = h('select', { class: 'inp', 'aria-label': `What is ${g.name}?`, onchange: () => {
      const [kind, ...rest] = sel.value.split('|');
      choices[g.key] = { kind, category: rest.join('|') };
    } }, opts.map(([v, l]) => option(v, l, v === current)));
    return h('div', { class: `group${g.first.status === 'review' ? ' needs' : ''}` },
      h('div', { class: 'g-main' },
        h('b', null, g.name),
        h('span', { class: 'muted' }, `${plural(g.count, 'payment')} · ${fmtMoney(g.total)} · ${g.direction === 'in' ? 'money in' : 'money out'}`),
        g.others.size ? h('span', { class: 'muted' }, `Also: ${[...g.others].slice(0, 3).join(', ')}${g.others.size > 3 ? ` and ${g.others.size - 3} more` : ''}`) : null),
      sel);
  }

  async function commit(tag) {
    try {
      const result = await ctx.update((data) => {
        const out = commitImport(plan, choices, data.settings, { tag });
        data.transactions.push(...out.transactions);
        data.settings.merchantRules = out.merchantRules;
        return out.transactions;
      });
      const unsure = result.filter((t) => t.kind === 'unsure').length;
      const message = `Imported ${plural(result.length, 'transaction')}.${unsure ? ` ${unsure} are marked "Not sure yet" and left out of totals until you decide: find them in the List tab.` : ''}`;
      files = [];
      plan = null;
      choices = {};
      renderPlan();
      say(message, 'ok');
      toast(`Imported ${plural(result.length, 'transaction')}.`, 'ok');
    } catch (err) {
      say(`Import failed. Nothing was saved: ${err.message}`, 'bad');
    }
  }

  function render() {
    const n = ctx.data.settings.payerRules.length;
    rulesInfo.textContent = n ? `${plural(n, 'payer rule')} loaded.` : 'No payer rules loaded yet.';
  }

  return { render };
}
