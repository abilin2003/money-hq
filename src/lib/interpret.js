// Reading what you say or type about your money, with fixed rules (no AI): it only understands words it can
// match to your own categories, accounts, savings funds, people and past shops, and anything it can't match
// becomes a question instead of a guess. Nothing here saves anything: it proposes, and you confirm.
//
// vocab: {
//   categories: [{ id, name, bucket }], accounts: [{ id, name, type, institution }], funds: [{ id, name }],
//   people: [{ id, name }], tags: ['Cousins visit', ...], shops: Map(normalised shop -> category id)
// }
import { addDays, weekday } from './dates.js';
import { normKey } from './text.js';

const norm = (s) => ` ${normKey(s)} `;
const has = (text, phrase) => norm(text).includes(` ${normKey(phrase)} `);

// ---------------------------------------------------------------- amounts
const SMALL = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
// "forty five pounds" -> "45 pounds", "a hundred and twenty quid" -> "120 quid", "twelve pounds fifty" ->
// "12 pounds 50". Only number words next to money words change, so "Capital One" stays as it is.
// Speech-to-text usually gives digits already; this is for when it doesn't.
const isNumWord = (w) => Boolean(w) && w.toLowerCase().split('-').every((p) => p in SMALL || p in TENS || p === 'hundred' || p === 'thousand');
const MONEY_WORD = /^(pounds?|quid|p|pence|grand)$/i;
function runValue(words) {
  let value = 0; let current = 0;
  for (const w of words) for (const p of w.toLowerCase().split('-')) {
    if (p in SMALL) current += SMALL[p];
    else if (p in TENS) current += TENS[p];
    else if (p === 'hundred') current = (current || 1) * 100;
    else if (p === 'thousand') { value += (current || 1) * 1000; current = 0; }
  }
  return value + current;
}
export function wordsToDigits(text) {
  const toks = String(text).split(/\s+/).filter((x) => x !== '');
  const core = (t) => (t || '').replace(/[^A-Za-z-]/g, '');
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    const c = core(toks[i]);
    const aStart = /^a$/i.test(toks[i]) && /^(hundred|thousand)/i.test(core(toks[i + 1]));
    if (!(isNumWord(c) && /^[A-Za-z-]+[,.;!?]?$/.test(toks[i])) && !aStart) { out.push(toks[i]); continue; }
    const run = [];
    let j = i;
    let trail = '';
    if (aStart) j++;
    while (j < toks.length) {
      const t = toks[j];
      if (/^and$/i.test(t) && run.length && isNumWord(core(toks[j + 1]))) { j++; continue; }
      if (!isNumWord(core(t)) || !/^[A-Za-z-]+[,.;!?]?$/.test(t)) break;
      run.push(core(t));
      j++;
      if (/[,.;!?]$/.test(t)) { trail = t.slice(-1); break; }
    }
    const prev = toks[i - 1] || '';
    const next = core(toks[j]);
    const nearMoney = !trail && MONEY_WORD.test(next) || MONEY_WORD.test(core(prev)) || /£$/.test(prev);
    if (!run.length || !nearMoney) { out.push(toks[i]); continue; }
    out.push(`${/£$/.test(prev) ? '' : ''}${runValue(run)}${trail}`);
    i = j - 1;
  }
  return out.join(' ').replace(/£ (\d)/g, '£$1');
}

// Every amount of money in the text, in pence, with where it was found.
// "£12.50", "12.50", "£45", "45 pounds", "45 quid", "12 pounds 50", "50p", "£1,200".
export function findAmounts(text) {
  const s = wordsToDigits(text);
  const found = [];
  const re = /£\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?(?:\s*p\b)?|\b(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\s*(pounds?|quid|p|pence|gbp)\b(?:\s+(?:and\s+)?(\d{1,2})(?:\s*(?:p|pence))?\b)?|\b(\d+)\.(\d{2})\b/gi;
  let m;
  while ((m = re.exec(s))) {
    let pence = null;
    if (m[1] !== undefined) pence = +m[1].replace(/,/g, '') * 100 + (m[2] ? +m[2].padEnd(2, '0') : 0);
    else if (m[3] !== undefined) {
      const unit = m[5].toLowerCase();
      if (unit === 'p' || unit === 'pence') pence = +m[3].replace(/,/g, '');
      else pence = +m[3].replace(/,/g, '') * 100 + (m[4] ? +m[4].padEnd(2, '0') : m[6] ? +m[6].padEnd(2, '0') : 0);
    } else pence = +m[7] * 100 + +m[8];
    if (pence > 0) found.push({ pence, index: m.index, text: m[0] });
  }
  return found;
}

// ---------------------------------------------------------------- dates (today is Europe/London, YYYY-MM-DD)
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const iso = (y, m, d) => { const dt = new Date(Date.UTC(y, m, d)); return dt.getUTCMonth() === m && dt.getUTCDate() === d ? dt.toISOString().slice(0, 10) : null; };
// The date a phrase means, or null if there's no date in it. Days of the week mean the most recent one before
// today ("Monday" and "last Monday" on a Wednesday both mean two days ago); a date with no year that would be
// in the future means last year's.
export function findDate(text, today) {
  const t = norm(text);
  if (/ day before yesterday /.test(t)) return addDays(today, -2);
  if (/ yesterday /.test(t)) return addDays(today, -1);
  if (/ (today|this morning|this afternoon|tonight|this evening) /.test(t)) return today;
  let m = ` ${String(text).toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `.match(/ (\d+|a|one|two|three|four|five|six|seven) days? ago /);
  if (m) { const n = { a: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 }[m[1]] ?? +m[1]; return addDays(today, -n); }
  const raw = String(text).toLowerCase();
  m = raw.match(/\b(\d{1,2})(?:st|nd|rd|th)?(?:\s+of)?\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec)\b/)
    || raw.match(/\b(january|february|march|april|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec)\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\b/);
  if (m) {
    const [day, mon] = /\d/.test(m[1]) ? [+m[1], m[2]] : [+m[2], m[1]];
    const month = MONTHS.findIndex((x) => x.startsWith(mon.slice(0, 3)));
    let y = +today.slice(0, 4);
    let d = iso(y, month, day);
    if (d && d > today) d = iso(--y, month, day);
    if (d) return d;
  }
  m = raw.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (m) {
    let y = m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : +today.slice(0, 4);
    let d = iso(y, +m[2] - 1, +m[1]);
    if (d && !m[3] && d > today) d = iso(--y, +m[2] - 1, +m[1]);
    if (d) return d;
  }
  m = raw.match(/\bon the (\d{1,2})(?:st|nd|rd|th)\b/);
  if (m) {
    let [y, mo] = [+today.slice(0, 4), +today.slice(5, 7) - 1];
    let d = iso(y, mo, +m[1]);
    if (!d || d > today) { mo -= 1; if (mo < 0) { mo = 11; y -= 1; } d = iso(y, mo, +m[1]); }
    if (d) return d;
  }
  m = t.match(/ (?:last |on |this past )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)s? /);
  if (m) {
    const want = DAYS.indexOf(m[1]);
    let back = (weekday(today) - want + 7) % 7;
    if (back === 0) back = / last /.test(t.slice(0, t.indexOf(m[1]) + 1)) ? 7 : 0;
    return addDays(today, -back);
  }
  return null;
}

// ---------------------------------------------------------------- your categories, accounts and funds
// Words that point to a kind of spending, mapped to category names Money HQ might have. Only used when you
// have a category with that name. "word" entries beat "shop" entries ("petrol at Tesco" is Fuel).
const CATEGORY_WORDS = [
  ['Fuel', ['petrol', 'diesel', 'fuel', 'filled up', 'fill up']],
  ['Groceries', ['groceries', 'grocery', 'food shop', 'food shopping', 'weekly shop', 'big shop']],
  ['Eating out & takeaway', ['takeaway', 'take away', 'eating out', 'ate out', 'restaurant', 'lunch', 'dinner', 'breakfast', 'meal', 'coffee', 'brunch', 'buffet']],
  ['Snacks & energy drinks', ['snacks', 'snack', 'energy drink', 'energy drinks', 'crisps', 'sweets', 'chocolate']],
  ['Sport & fitness', ['gym', 'football', 'fitness', 'sport', 'sports', 'five a side', 'swimming']],
  ['Bills & subscriptions', ['phone bill', 'bill', 'subscription', 'subscriptions', 'direct debit']],
  ['Clothes & shopping', ['clothes', 'shoes', 'trainers', 'hoodie', 'jacket', 'jeans', 'shirt']],
  ['Personal care', ['haircut', 'barber', 'barbers', 'toiletries', 'shampoo', 'aftershave', 'deodorant']],
  ['Gifts', ['gift', 'gifts', 'present', 'presents', 'birthday present']],
  ['Going out', ['cinema', 'pub', 'drinks', 'night out', 'bowling', 'concert', 'club', 'gig']],
  ['Household', ['household', 'cleaning', 'washing up liquid', 'kitchen']],
  ['Health', ['pharmacy', 'chemist', 'prescription', 'doctor', 'dentist', 'medicine', 'paracetamol']],
  ['Transport & car', ['parking', 'car wash', 'mot', 'car insurance', 'bus', 'train', 'taxi', 'uber', 'tolls', 'car service']],
  ['Travel', ['flight', 'flights', 'hotel', 'airbnb', 'travel', 'plane', 'airport']],
];
const CATEGORY_SHOPS = [
  ['Groceries', ['tesco', 'asda', 'lidl', 'aldi', 'sainsburys', 'sainsbury', 'spar', 'eurospar', 'centra', 'co op', 'coop', 'iceland', 'm and s food', 'dunnes', 'supervalu']],
  ['Eating out & takeaway', ['mcdonalds', 'mcdonald s', 'kfc', 'burger king', 'subway', 'nandos', 'greggs', 'starbucks', 'costa', 'dominos', 'pizza hut', 'five guys', 'deliveroo', 'just eat', 'uber eats', 'cosmo']],
  ['Bills & subscriptions', ['netflix', 'spotify', 'voxi', 'apple', 'disney plus', 'amazon prime', 'icloud']],
  ['Clothes & shopping', ['primark', 'next', 'zara', 'jd sports', 'nike', 'adidas', 'h and m', 'asos']],
  ['Personal care', ['boots', 'superdrug']],
];
const GENERIC = new Set(['fund', 'funds', 'pot', 'pots', 'savings', 'saving', 'spending', 'money', 'my', 'the', 'account', 'and', 'of', 'for', 'a']);
const tokens = (s) => normKey(s).split(' ').filter((w) => w.length > 1 && !GENERIC.has(w));

function categoryByName(vocab, name) { return vocab.categories.find((c) => normKey(c.name) === normKey(name)) || null; }

// The categories the text points to, best first. tier 3: you named the category; 2: a word for that kind of
// spending; 1: a shop you've used before or a well-known shop.
export function findCategories(text, vocab, { shop = '' } = {}) {
  const out = new Map();
  const add = (cat, tier, why) => { if (cat && (!out.has(cat.id) || out.get(cat.id).tier < tier)) out.set(cat.id, { category: cat, tier, why }); };
  for (const c of vocab.categories) if (has(text, c.name)) add(c, 3, `you said “${c.name}”`);
  for (const [name, words] of CATEGORY_WORDS) { const w = words.find((x) => has(text, x)); if (w) add(categoryByName(vocab, name), 2, `“${w}”`); }
  const shopKey = normKey(shop);
  const learned = shopKey && vocab.shops?.get(shopKey);
  if (learned) add(vocab.categories.find((c) => c.id === learned), 1, `you used it for ${shop} before`);
  for (const [name, shops] of CATEGORY_SHOPS) { const s = shops.find((x) => has(shop || text, x)); if (s) add(categoryByName(vocab, name), 1, `${s} is usually that`); }
  return [...out.values()].sort((a, b) => b.tier - a.tier);
}
// One category, or why not: { category, why } | { choices } | { missing: 'Travel' } | {} (+ bucket if named).
// A kind of spending you named but have no category for is asked about, not swapped for a guess from the shop.
export function pickCategory(text, vocab, shop = '') {
  const cats = findCategories(text, vocab, { shop });
  const bucket = findBucket(text, vocab);
  const pool = bucket && cats.some((c) => c.category.bucket === bucket) ? cats.filter((c) => c.category.bucket === bucket) : cats;
  const missing = missingCategoryFor(text, vocab)[0];
  if (missing && !pool.some((c) => c.tier >= 2)) return { missing, bucket };
  const top = pool.filter((c) => c.tier === pool[0]?.tier);
  if (top.length === 1) return { category: top[0].category, why: top[0].why, bucket };
  if (top.length > 1) return { choices: top.map((c) => c.category), bucket };
  return { bucket };
}
// A word that means travel but there's no category for it: worth saying, so you can add one.
export const missingCategoryFor = (text, vocab) => CATEGORY_WORDS.filter(([name, words]) => !categoryByName(vocab, name) && words.some((w) => has(text, w))).map(([name]) => name);

export function findBucket(text, vocab) {
  const buckets = [...new Set(vocab.categories.map((c) => c.bucket).filter(Boolean))];
  // "rather than my normal Fun budget" names the budget it isn't from: ignored.
  const said = String(text).toLowerCase().replace(/\b(rather than|instead of|not|isn ?t|wasn ?t|didn ?t come out of)\b(\s+(my|the|your|a|normal|usual|regular))*\s+[a-z]+(\s+[a-z]+)?\s+(budget|bucket)\b/g, ' ');
  return buckets.find((b) => has(said, `${b} budget`) || has(said, `${b} bucket`) || has(said, `my ${b}`)) || null;
}

const ACCOUNT_WORDS = (a) => [a.name, a.institution, a.type === 'credit_card' ? 'credit card' : null, a.type === 'credit_card' ? 'my card' : null].filter(Boolean);
export function findAccount(text, vocab) {
  const scored = vocab.accounts.map((a) => {
    // 3: you said its whole name ("Revolut" is the Revolut account, not Revolut Pockets); 2: its bank or
    // "credit card"; 1: the first word of its name.
    const named = has(text, a.name);
    const words = ACCOUNT_WORDS(a);
    const full = words.some((w) => has(text, w));
    const first = normKey(a.name).split(' ')[0];
    const part = first.length > 3 && has(text, first);
    return { a, score: named ? 3 : full ? 2 : part ? 1 : 0 };
  }).filter((x) => x.score);
  if (!scored.length) return null;
  const best = Math.max(...scored.map((x) => x.score));
  const top = scored.filter((x) => x.score === best);
  return top.length === 1 ? top[0].a : { ambiguous: top.map((x) => x.a) };
}

// Funds by how many of their distinctive words the text uses ("Bulgaria holiday" beats "Holiday Pot" when you
// mention Bulgaria). Ties are returned as ambiguous rather than picked.
export function findFund(text, vocab) {
  const words = new Set(tokens(text));
  const scored = vocab.funds.map((f) => ({ f, score: tokens(f.name).filter((w) => words.has(w)).length })).filter((x) => x.score);
  if (!scored.length) return null;
  const best = Math.max(...scored.map((x) => x.score));
  const top = scored.filter((x) => x.score === best);
  return top.length === 1 ? top[0].f : { ambiguous: top.map((x) => x.f) };
}

// Paid from savings? Said with words like "out of my fund", "used my savings", "covered by the pot".
const SAVINGS_CUE = /\b(fund|savings|pot|saved up|sinking)\b/;
const FROM_CUE = /\b(from|out of|used|use|using|cover|covered|covering|assigned|assign|paid for by|take|took|came out)\b/;
const NOT_FROM = /\b(not|didn ?t|did not|wasn ?t|was not|no)\b[^.]{0,40}\b(fund|savings|pot)\b|\b(normal|usual|regular) (budget|spending)\b(?![^.]{0,30}\brather than\b)|\bout of my pay\b/;
export function findFunding(text) {
  const t = String(text).toLowerCase();
  if (/\brather than (my |the )?(normal|usual|regular)\b/.test(t) && SAVINGS_CUE.test(t)) return true;
  if (NOT_FROM.test(t)) return false;
  if (SAVINGS_CUE.test(t) && FROM_CUE.test(t)) return true;
  return null;
}

// Money in or out, and what kind it is.
export function findKind(text, amountSign = -1) {
  const t = String(text).toLowerCase();
  if (/\b(paid me back|paying me back|pay me back|owed me|gave me back|sent me)\b/.test(t)) return 'repayment';
  if (/\brefund(ed)?\b|\bmoney back\b/.test(t)) return 'refund';
  if (/\b(salary|wages?|payslip|got paid|pay day|payday)\b/.test(t)) return 'income';
  if (/\b(invested|investing|into my (stocks|s ?& ?s|shares)|bought (shares|stocks))\b/.test(t)) return 'invested';
  if (/\b(put|moved|transferred|added)\b.{0,30}\binto\b.{0,30}\b(pot|fund|savings)\b/.test(t)) return 'saved';
  if (/\b(transferred|moved|move between|transfer to|transfer from|topped up|top up)\b/.test(t)) return 'transfer';
  return amountSign < 0 ? 'spend' : null;
}

// Who owes you what: "Ben owes me £10", "split it with Ben and Alton", "half of it was for Dad".
export function findSplits(text, vocab, totalPence) {
  const out = [];
  const known = (name) => vocab.people.find((p) => normKey(p.name) === normKey(name));
  const raw = String(text);
  for (const m of raw.matchAll(/\b([A-Z][a-z]+)\s+(?:owes|still owes|has to pay|needs to pay)\s+(?:me\s+)?(.{0,30})/g)) {
    const amt = /half/i.test(m[2]) && totalPence ? Math.round(totalPence / 2) : findAmounts(m[2])[0]?.pence;
    if (amt) out.push({ name: known(m[1])?.name || m[1], pence: amt });
  }
  const sw = raw.match(/\bsplit (?:it |this |the bill )?(?:equally |evenly )?(?:with|between) ([A-Z][a-z]+(?:(?:,\s*|\s+and\s+)[A-Z][a-z]+)*)/);
  if (sw && totalPence) {
    const names = sw[1].split(/,\s*|\s+and\s+/).filter((n) => n && !/^me$/i.test(n));
    const each = Math.floor(totalPence / (names.length + 1));
    for (const n of names) if (!out.some((o) => normKey(o.name) === normKey(n))) out.push({ name: known(n)?.name || n, pence: each });
  }
  for (const p of vocab.people) {
    if (out.some((o) => normKey(o.name) === normKey(p.name))) continue;
    if (new RegExp(`\\b(on behalf of|for) ${p.name}\\b`, 'i').test(raw)) out.push({ name: p.name, pence: null, question: `Does ${p.name} owe you all of it, or part?` });
  }
  return out;
}

// ---------------------------------------------------------------- one inbox line, explained in your words
// Returns what it understood about the transaction, as proposed changes to confirm, plus questions for what it
// couldn't tell. The payment account, the category and the savings fund are kept apart: paying on Capital One
// says nothing about which budget it comes from.
export function interpretExplanation(text, tx, vocab, others = []) {
  const changes = {};
  const understood = [];
  const questions = [];
  const clean = String(text || '').trim();
  if (!clean) return { changes, understood, questions: ['Type or say what this was.'], splits: [], alsoApply: [] };
  const sign = tx.amount_pence < 0 ? -1 : 1;

  const kind = findKind(clean, sign);
  const savingsKinds = new Set(['saved', 'invested', 'transfer']);
  if (kind && kind !== tx.kind && !(kind === 'spend' && tx.kind === 'spend')) {
    if ((sign < 0 && ['spend', ...savingsKinds].includes(kind)) || (sign > 0 && ['repayment', 'refund', 'income', 'transfer', 'invested'].includes(kind))) {
      changes.kind = kind;
      understood.push({ field: 'kind', label: 'Type', value: kind, why: 'from how you described it' });
    }
  }
  const finalKind = changes.kind || (sign < 0 ? 'spend' : tx.kind);

  if (finalKind === 'spend' || finalKind === 'refund') {
    const pick = pickCategory(clean, vocab, tx.raw_description);
    if (pick.category) { changes.category_id = pick.category.id; understood.push({ field: 'category_id', label: 'Category', value: pick.category.name, why: pick.why }); }
    else if (pick.missing) questions.push(`You don’t have a ${pick.missing} category yet. Pick the closest one below, or add ${pick.missing} on Set-up first.`);
    else if (pick.choices) questions.push(`Which category: ${pick.choices.map((c) => c.name).join(' or ')}?`);
    else questions.push('Which category is it?');
    if (pick.bucket && !changes.category_id) understood.push({ field: 'bucket', label: 'Budget', value: pick.bucket, why: `you said your ${pick.bucket} budget` });
  }

  const funding = findFunding(clean);
  const fund = findFund(clean, vocab);
  if (sign < 0 && funding === true) {
    changes.from_savings = true;
    if (fund?.ambiguous) questions.push(`Which fund paid for it: ${fund.ambiguous.map((f) => f.name).join(' or ')}?`);
    understood.push({ field: 'from_savings', label: 'Paid for by', value: fund && !fund.ambiguous ? fund.name : 'your savings', why: 'not counted against this cycle’s budgets' });
  } else if (funding === false && tx.from_savings) {
    changes.from_savings = false;
    understood.push({ field: 'from_savings', label: 'Paid for by', value: 'this cycle’s budget', why: 'you said it wasn’t from savings' });
  }
  if (fund && !fund.ambiguous) {
    changes.tag = fund.name;
    changes.fund_id = fund.id;
    understood.push({ field: 'tag', label: 'For', value: fund.name, why: 'tagged, so it shows with that fund' });
  } else {
    const tag = (vocab.tags || []).find((g) => has(clean, g));
    if (tag) { changes.tag = tag; understood.push({ field: 'tag', label: 'For', value: tag, why: 'an event you’ve tagged before' }); }
  }

  const acc = findAccount(clean, vocab);
  if (acc && !acc.ambiguous) {
    if (acc.id === tx.account_id) understood.push({ field: 'account', label: 'Paid with', value: acc.name, why: 'matches the bank line' });
    else if (tx.source === 'manual') { changes.account_id = acc.id; understood.push({ field: 'account_id', label: 'Paid with', value: acc.name, why: 'you said so' }); }
    else questions.push(`This line came from your ${tx.accountName || 'bank'} statement, but you said ${acc.name}. Which is right?`);
  }

  const splits = sign < 0 ? findSplits(clean, vocab, -tx.amount_pence) : [];
  for (const s of splits) {
    if (s.question) questions.push(s.question);
    else understood.push({ field: 'split', label: 'Owes you', value: `${s.name} £${(s.pence / 100).toFixed(2)}`, why: 'only your share counts as spending' });
  }

  // Other waiting lines this answer probably covers too: same distinctive word in the description.
  const mine = new Set(tokens(tx.raw_description).filter((w) => w.length > 3));
  const alsoApply = others.filter((o) => o.id !== tx.id && Math.sign(o.amount_pence) === sign && tokens(o.raw_description).some((w) => mine.has(w)));

  if (!understood.length && questions.every((q) => q === 'Which category is it?')) questions.splice(0, questions.length,'I couldn’t match that to a category, fund, account or person. Choose below, and your words are kept as the note.');
  return { changes, understood, questions, splits: splits.filter((s) => s.pence), alsoApply };
}

// ---------------------------------------------------------------- several transactions, said out loud
// "Yesterday I spent £12.50 at Tesco on groceries using Revolut. Then £8.20 at McDonald's from my Fun budget."
// One proposed transaction per amount. A date carries on to the next ones until a new date is said; an account
// doesn't (say it each time, or it's marked to confirm). Nothing is invented: unknown fields are left empty
// and listed in `unsure`.
const STOP = /\s+(?:on|using|with|from|for|by|in|via|yesterday|today|on my|and|then|which|that|because|cos|paid|it|at)\b|[,.;!?]/i;
export function parseSpoken(text, vocab, today) {
  const src = wordsToDigits(String(text || '')).replace(/\s+/g, ' ').trim();
  if (!src) return [];
  // Cut into pieces, each with one amount.
  const pieces = [];
  const amounts = findAmounts(src);
  if (!amounts.length) return [];
  const boundaries = [/[.;!?]\s+/g, /\b(?:and then|then|also|after that|plus)\b/gi];
  let cuts = [0];
  for (const re of boundaries) for (const m of src.matchAll(re)) cuts.push(m.index);
  cuts = [...new Set(cuts)].sort((a, b) => a - b);
  // Make sure no piece holds two amounts: cut before the second one's clause.
  for (let i = 1; i < amounts.length; i++) {
    const prev = amounts[i - 1].index; const cur = amounts[i].index;
    if (!cuts.some((c) => c > prev && c <= cur)) {
      const between = src.slice(prev, cur);
      const m = [...between.matchAll(/,|\band\b/gi)].pop();
      cuts.push(m ? prev + m.index : cur);
    }
  }
  cuts = [...new Set(cuts)].sort((a, b) => a - b);
  for (let i = 0; i < cuts.length; i++) {
    const piece = src.slice(cuts[i], cuts[i + 1] ?? src.length).replace(/^[\s,.;]*(and then|then|also|after that|plus|and)?\s*/i, '').trim();
    if (piece) pieces.push(piece);
  }
  const out = [];
  let lastDate = null;
  let pendingDate = null; // a date said in a piece with no amount ("On Monday, ...") applies to the next one
  for (const piece of pieces) {
    const amt = findAmounts(piece)[0];
    const date = findDate(piece, today);
    if (!amt) { if (date) pendingDate = date; continue; }
    const whenSaid = date || pendingDate;
    pendingDate = null;
    if (whenSaid) lastDate = whenSaid;
    const t = { text: piece, amount_pence: amt.pence, date: lastDate, description: '', category_id: null, account_id: null, kind: 'spend', from_savings: false, tag: null, note: null, splits: [], unsure: [] };
    const lower = piece.toLowerCase();
    const moneyIn = /\b(got|received|paid me|sent me|refund|salary|wages|earned)\b/.test(lower) && !/\bi (spent|paid|bought)\b/.test(lower);
    t.kind = findKind(piece, moneyIn ? 1 : -1) || (moneyIn ? null : 'spend');
    if (moneyIn) t.amount_pence = amt.pence; else t.amount_pence = -amt.pence;
    // Where: "at Tesco", "in Primark", "from Amazon" (money out), "from Ben" (money in).
    const at = piece.match(/\b(?:at|in|from|to)\s+((?:[A-Za-z0-9'&’]+\s?){1,4})/i);
    let where = at ? at[1].split(STOP)[0].trim() : '';
    if (where && (findAccount(where, vocab) || findBucket(`${where} budget`, vocab) || /^(my|the|a)$/i.test(where) || findFund(where, vocab))) where = '';
    if (t.kind === 'spend' || t.kind === 'refund') {
      const pick = pickCategory(piece, vocab, where);
      if (pick.category) t.category_id = pick.category.id;
      else t.unsure.push('category');
      if (pick.missing) t.note = `No ${pick.missing} category yet`;
      else if (pick.bucket && !t.category_id) t.note = `${pick.bucket} budget`;
    }
    const catWord = CATEGORY_WORDS.flatMap(([, w]) => w).find((w) => has(piece, w));
    t.description = where ? where.replace(/(^|\s)(\S)/g, (x, a, c) => a + c.toUpperCase()) : catWord ? catWord.replace(/^\w/, (c) => c.toUpperCase()) : '';
    if (!t.description) t.unsure.push('description');
    const acc = findAccount(piece, vocab);
    if (acc && !acc.ambiguous) t.account_id = acc.id; else t.unsure.push('account');
    if (!t.date) t.unsure.push('date');
    if (!t.kind) t.unsure.push('type');
    const funding = findFunding(piece);
    const fund = findFund(piece, vocab);
    if (funding === true && t.amount_pence < 0) t.from_savings = true;
    if (fund && !fund.ambiguous) t.tag = fund.name;
    t.splits = t.amount_pence < 0 ? findSplits(piece, vocab, amt.pence).filter((s) => s.pence) : [];
    out.push(t);
  }
  return out;
}

// Lines you already have that look like the same payment: same account (if known) and amount, within 3 days.
export function possibleDuplicates(t, existing) {
  if (!t.date || !t.amount_pence) return [];
  return existing.filter((e) => e.amount_pence === t.amount_pence && (!t.account_id || e.account_id === t.account_id) && Math.abs((new Date(e.date) - new Date(t.date)) / 86400000) <= 3);
}

// The words to match against, from what Money HQ already knows.
export function vocabFrom(ctx) {
  const bucketName = Object.fromEntries(ctx.ref.buckets.map((b) => [b.id, b.name]));
  const shops = new Map();
  for (const t of ctx.transactions) if (t.kind === 'spend' && t.category_id && t.raw_description) { const k = normKey(t.raw_description); if (k && !shops.has(k)) shops.set(k, t.category_id); }
  return {
    categories: ctx.ref.categories.filter((c) => c.is_active).map((c) => ({ id: c.id, name: c.name, bucket: bucketName[c.bucket_id] })),
    accounts: ctx.ref.accounts.filter((a) => a.is_active !== false).map((a) => ({ id: a.id, name: a.name, type: a.type, institution: a.institution })),
    funds: (ctx.ref.funds || []).map((f) => ({ id: f.id, name: f.name })),
    people: ctx.ref.people || [],
    tags: [...new Set(ctx.all.map((t) => t.tag).filter(Boolean))],
    shops,
  };
}
