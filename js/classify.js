// Decides what each bank line is: spending, income, a transfer, and so on.
// Order of trust: your payer rules, then the bank's own transfer flags, then learned shop rules, then hints.
import { normKey } from './money.js';
import { KINDS, SEED_MERCHANT_RULES, INTERNAL_PATTERNS, BANK_CATEGORY_HINTS, INVESTED_ACCOUNTS } from './seed.js';

const MONEY_IN_ONLY = ['income', 'payback', 'fund'];

// Payer rules are the private rules in data/payer-rules.json: { match, label, category, direction?, confirm? }.
// Income, payback and fund rules only apply to money coming in, unless the rule says otherwise.
export function matchPayerRule(row, rules = []) {
  const text = ` ${normKey(row.desc)} `;
  let best = null;
  let bestLen = 0;
  for (const rule of rules) {
    if (!KINDS.includes(rule.label)) continue;
    const key = normKey(rule.match);
    if (!key || !text.includes(` ${key} `)) continue;
    const wanted = rule.direction || (MONEY_IN_ONLY.includes(rule.label) ? 'in' : null);
    if (wanted && wanted !== row.direction) continue;
    if (key.length > bestLen) { best = rule; bestLen = key.length; }
  }
  return best;
}

// Learned and seed shop rules. A key starting "in:" only applies to money coming in.
export function findMerchantRule(desc, rules, direction) {
  const text = ` ${normKey(desc)} `;
  let best = null;
  let bestScore = 0;
  for (const [rawKey, rule] of Object.entries(rules || {})) {
    const directional = rawKey.startsWith('in:');
    if (directional && direction !== 'in') continue;
    const key = directional ? rawKey.slice(3) : rawKey;
    if (!key || !text.includes(` ${key} `)) continue;
    const score = key.length + (directional ? 0.5 : 0);
    if (score > bestScore) { best = { rule, directional }; bestScore = score; }
  }
  return best;
}

// Returns { kind, category, status, reason }.
//   status 'auto'      sorted with confidence, no need to look
//   status 'suggested' a good guess that is worth a quick look
//   status 'review'    no idea yet, needs a decision
export function classifyRow(row, settings = {}) {
  // A list you wrote yourself already says what each line is: your category wins over any rule.
  const chosen = String(row.userCategory || '').trim();
  if (chosen) {
    const budgets = (settings.categories || []).map((c) => c.name);
    if (INVESTED_ACCOUNTS.includes(chosen) && row.direction === 'out') return { kind: 'invested', category: chosen, status: 'auto', reason: 'from your list' };
    if (budgets.includes(chosen)) return { kind: row.direction === 'out' ? 'spending' : 'payback', category: chosen, status: 'auto', reason: 'from your list' };
    return { kind: 'unsure', category: '', status: 'review', reason: row.note || `"${chosen}" is not one of your budgets` };
  }

  const payer = matchPayerRule(row, settings.payerRules);
  if (payer) {
    const status = payer.label === 'unsure' ? 'review' : payer.confirm ? 'suggested' : 'auto';
    return { kind: payer.label, category: payer.category || '', status, reason: 'your payer rule' };
  }

  if (row.internalHint) {
    return { kind: 'internal', category: row.internalHint, status: 'auto', reason: 'the bank marks this as a move' };
  }
  if (INTERNAL_PATTERNS.test(row.desc)) {
    return { kind: 'internal', category: 'Transfer', status: 'auto', reason: 'looks like a move between your own accounts' };
  }

  const found = findMerchantRule(row.desc, { ...SEED_MERCHANT_RULES, ...settings.merchantRules }, row.direction);
  if (found) {
    const { kind, category = '' } = found.rule;
    if (row.direction === 'in' && !found.directional) {
      if (kind === 'spending') return { kind: 'payback', category, status: 'suggested', reason: 'looks like a refund' };
      if (kind === 'invested') return { kind: 'internal', category: 'ISA withdrawal', status: 'suggested', reason: 'money back from an investment account' };
    }
    const wrongWay = row.direction === 'out' && (kind === 'income' || kind === 'payback' || kind === 'fund');
    if (!wrongWay) return { kind, category, status: 'auto', reason: 'a rule you taught me' };
  }

  const bankCategory = String(row.bankCategory || '').trim().toLowerCase();
  const hint = BANK_CATEGORY_HINTS[bankCategory];
  if (row.direction === 'out' && hint && (settings.categories || []).some((c) => c.name === hint)) {
    return { kind: 'spending', category: hint, status: 'suggested', reason: "from the bank's own category" };
  }
  if (row.direction === 'in' && bankCategory === 'income') {
    return { kind: 'income', category: 'Income', status: 'suggested', reason: "from the bank's own category" };
  }

  return { kind: 'unsure', category: '', status: 'review', reason: 'no rule yet' };
}
