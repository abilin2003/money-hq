// What is each bank line? Order of trust (ported from the previous app, plus learned rules):
//   1. a category you wrote in your own list
//   2. a rule you taught Money HQ in the review inbox ("Always do this for Tesco")
//   3. your payer rules from the old app (people, salary, own transfers)
//   4. the bank's own transfer flags (Revolut pockets, Monzo pots) and transfer wording
//   5. shop rules from the old app
//   6. the bank's own category (Monzo), as a suggestion
// Anything not confidently sorted is `needs_review` and goes to the inbox.
import { normKey, merchantKey } from '../text.js';
import { mapCategory, guessDetail, BUCKET_DEFAULT, bucketOfCategory } from '../categories.js';

const OLD_KIND = { spending: 'spend', income: 'income', invested: 'invested', payback: 'repayment', internal: 'transfer', fund: 'saved' };
const MONEY_IN_ONLY = ['income', 'payback', 'fund'];
export const CARD_REPAYMENT = /\b(capital one|credit card (re)?payment|card repayment|barclaycard|american express|amex)\b/i;
export const INTERNAL_PATTERNS =/\b(pocket withdrawal|withdrawing savings|depositing savings|to pocket|from pocket|pot transfer|exchanged to|exchanged from)\b/i;
const SEED_MERCHANT_RULES = { trading: { kind: 'invested', category: 'Cash ISA (Trading 212)' }, investengine: { kind: 'invested', category: 'S&S ISA (InvestEngine)' } };
const BANK_HINTS = { groceries: 'Groceries', 'eating out': 'Eating out & takeaway', eating_out: 'Eating out & takeaway', entertainment: 'Going out', transport: 'Transport & car', bills: 'Bills & subscriptions', 'personal care': 'Personal care', personal_care: 'Personal care', family: 'Friends & family', gifts: 'Gifts', shopping: 'Clothes & shopping' };

const contains = (text, key) => key && ` ${text} `.includes(` ${key} `);
const dirOf = (row) => (row.amount_pence < 0 ? 'out' : 'in');

// Splits the rules from Supabase into the three kinds the classifier uses.
export function prepareRules(rules = []) {
  const learned = [];
  const payer = [];
  const merchant = { ...SEED_MERCHANT_RULES };
  for (const r of rules) {
    if (r.created_from === 'learned') learned.push(r);
    else if (r.set?.legacy?.label) payer.push(r.set.legacy);
    else if (r.set?.legacy?.kind) merchant[normKey(r.match?.description_contains)] = r.set.legacy;
  }
  learned.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
  return { learned, payer, merchant };
}

// A spending line's category from its description and the bucket a rule gave it. Confident only when the
// description itself names the kind of thing (e.g. "Tesco" -> Groceries).
function spendCategory(desc, bucket) {
  const detail = guessDetail(desc);
  if (detail) return { category: mapCategory(detail, bucket), confident: true };
  if (bucket && bucketOfCategory[bucket]) return { category: bucket, confident: true }; // a rule that already names a new category
  return { category: BUCKET_DEFAULT[bucket] || null, confident: false };
}

// Returns { kind, category, status, reason }. category is a category name or null.
export function classify(row, rules) {
  const dir = dirOf(row);
  const text = normKey(row.raw_description);
  const review = (kind, category, reason) => ({ kind, category, status: 'needs_review', reason });
  const sure = (kind, category, reason) => ({ kind, category, status: 'reviewed', reason });

  // 1. Your own list.
  if (row.userCategory) {
    const c = row.userCategory;
    if (/isa|trading 212|investengine/i.test(c) && dir === 'out') return sure('invested', null, 'from your list');
    if (bucketOfCategory[c]) return sure(dir === 'out' ? 'spend' : 'refund', c, 'from your list');
    if (BUCKET_DEFAULT[c]) {
      const { category, confident } = spendCategory(row.raw_description, c);
      return confident ? sure(dir === 'out' ? 'spend' : 'refund', category, 'from your list') : review(dir === 'out' ? 'spend' : 'refund', category, 'your list gave the bucket, not the category');
    }
    return review(dir === 'out' ? 'spend' : 'repayment', null, `"${c}" isn't one of your categories`);
  }

  // 2. Rules you taught Money HQ.
  for (const r of rules.learned) {
    const key = normKey(r.match?.description_contains);
    if (!contains(text, key)) continue;
    if (r.match?.direction && r.match.direction !== dir) continue;
    return sure(r.set.kind, r.set.category || null, 'a rule you taught me');
  }

  // 3. Payer rules (longest match wins).
  let payer = null;
  for (const rule of rules.payer) {
    const key = normKey(rule.match);
    if (!contains(text, key)) continue;
    const wanted = rule.direction || (MONEY_IN_ONLY.includes(rule.label) ? 'in' : null);
    if (wanted && wanted !== dir) continue;
    if (!payer || key.length > normKey(payer.match).length) payer = rule;
  }
  if (payer) {
    if (payer.label === 'unsure') return review(dir === 'out' ? 'spend' : 'repayment', null, 'your payer rule says to check this one');
    // An ISA withdrawal counts against investing (net), not as a plain transfer.
    const kind = payer.category === 'ISA withdrawal' && dir === 'in' ? 'invested' : OLD_KIND[payer.label] || 'spend';
    const category = kind === 'spend' ? spendCategory(row.raw_description, payer.category).category : null;
    return payer.confirm ? review(kind, category, 'your payer rule (marked "check")') : sure(kind, category, 'your payer rule');
  }

  // 4. Moves between your own accounts.
  if (row.internalHint) return sure('transfer', null, 'the bank marks this as a move between your accounts');
  if (INTERNAL_PATTERNS.test(row.raw_description)) return sure('transfer', null, 'looks like a move between your own accounts');
  // Paying off a credit card from a bank account is a transfer: the card purchases were already counted as
  // spending when you made them, so counting the repayment too would double it.
  if (dir === 'out' && row.account !== 'Capital One' && CARD_REPAYMENT.test(row.raw_description)) return sure('transfer', null, 'a credit card repayment (the purchases were counted when you made them)');

  // 5. Shop rules (longest key wins; "in:" keys only apply to money coming in).
  let best = null;
  let bestScore = 0;
  for (const [rawKey, rule] of Object.entries(rules.merchant)) {
    const directional = rawKey.startsWith('in:');
    if (directional && dir !== 'in') continue;
    const key = directional ? rawKey.slice(3) : rawKey;
    if (!contains(text, key)) continue;
    const score = key.length + (directional ? 0.5 : 0);
    if (score > bestScore) { best = { rule, directional }; bestScore = score; }
  }
  if (best) {
    const kind = OLD_KIND[best.rule.kind] || 'spend';
    if (dir === 'in' && !best.directional) {
      if (kind === 'spend') return review('refund', spendCategory(row.raw_description, best.rule.category).category, 'money back from a shop: a refund?');
      if (kind === 'invested') return sure('invested', null, 'taken out of an ISA: counts against what you invested');
    }
    if (!(dir === 'out' && ['income', 'repayment', 'saved'].includes(kind))) {
      if (kind !== 'spend') return sure(kind, null, 'a shop rule from your old app');
      const { category, confident } = spendCategory(row.raw_description, best.rule.category);
      return confident ? sure('spend', category, 'a shop rule from your old app') : review('spend', category, `your old rule says ${best.rule.category}; which category?`);
    }
  }

  // 6. The bank's own category (Monzo), as a suggestion.
  const hint = BANK_HINTS[String(row.bankCategory || '').trim().toLowerCase()];
  if (dir === 'out' && hint) return review('spend', hint, "from the bank's own category");
  if (dir === 'in' && /income/i.test(row.bankCategory || '')) return review('income', null, "from the bank's own category");

  const guess = guessDetail(row.raw_description);
  return review(dir === 'out' ? 'spend' : 'repayment', guess ? mapCategory(guess, null) : null, 'no rule yet');
}

export const groupKeyOf = (row) => `${dirOf(row)}|${merchantKey(row.raw_description) || normKey(row.raw_description)}`;
