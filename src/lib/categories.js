// The 16 categories agreed on 25 Nov 2026, each in one bucket, and how the old app's labels map onto them.

export const CATEGORIES = [
  { name: 'Bills & subscriptions', bucket: 'Essentials' },
  { name: 'Health', bucket: 'Essentials' },
  { name: 'Transport & car', bucket: 'Essentials' },
  { name: 'Groceries', bucket: 'Groceries' },
  { name: 'Household', bucket: 'Groceries' },
  { name: 'Personal care', bucket: 'Personal Upkeep' },
  { name: 'Clothes & shopping', bucket: 'Personal Upkeep' },
  { name: 'Partner', bucket: 'Life Fund' },
  { name: 'Friends & family', bucket: 'Life Fund' },
  { name: 'Gifts', bucket: 'Life Fund' },
  { name: 'Treats & plans', bucket: 'Life Fund' },
  { name: 'Eating out & takeaway', bucket: 'Fun' },
  { name: 'Snacks & energy drinks', bucket: 'Fun' },
  { name: 'Sport & fitness', bucket: 'Fun' },
  { name: 'Going out', bucket: 'Fun' },
  { name: 'Fuel', bucket: 'Fuel' },
];
export const bucketOfCategory = Object.fromEntries(CATEGORIES.map((c) => [c.name, c.bucket]));

// When only the bucket is known (a shop rule from the old app said "Groceries"), this is the best guess,
// and the line goes to the review inbox so you can confirm it.
export const BUCKET_DEFAULT = {
  Essentials: 'Bills & subscriptions',
  Groceries: 'Groceries',
  'Personal Upkeep': 'Personal care',
  'Life Fund': 'Treats & plans',
  Fun: 'Going out',
  Fuel: 'Fuel',
};

const BY_DETAIL = {
  Subscriptions: 'Bills & subscriptions',
  'Gym membership': 'Bills & subscriptions',
  Health: 'Health',
  Transport: 'Transport & car',
  Parking: 'Transport & car',
  Car: 'Transport & car',
  Groceries: 'Groceries',
  'Home Bargains': 'Household',
  'Personal care': 'Personal care',
  'Clothing & shoes': 'Clothes & shopping',
  Shopping: 'Clothes & shopping',
  Partner: 'Partner',
  Friends: 'Friends & family',
  'Family (mum)': 'Friends & family',
  'Family (dad)': 'Friends & family',
  'Family (brother)': 'Friends & family',
  Gifts: 'Gifts',
  'Takeaway & eating out': 'Eating out & takeaway',
  Bakery: 'Eating out & takeaway',
  'Work food': 'Eating out & takeaway',
  'Snacks & drinks': 'Snacks & energy drinks',
  'Energy drink': 'Snacks & energy drinks',
  'Sport & fitness': 'Sport & fitness',
  Cricket: 'Sport & fitness',
  'Gym supplements': 'Sport & fitness',
  'Pubs & bars': 'Going out',
  Entertainment: 'Going out',
  'Betting app (one-off)': 'Going out',
  Travel: 'Going out',
  Hotel: 'Going out',
  Fuel: 'Fuel',
};
const LIFE_FUND_KEEP = new Set(['Partner', 'Friends & family', 'Gifts']);
const FOOD = new Set(['Eating out & takeaway', 'Snacks & energy drinks']);

// Old detail + old bucket -> new category name, or null when there's nothing to go on (goes to the inbox).
//   - Anything logged under Life Fund stays in Life Fund ("Treats & plans" unless it's partner, people or a gift).
//   - Food lines logged under Groceries stay in Groceries.
//   - Fuel always goes to the Fuel bucket.
export function mapCategory(detail, bucket) {
  const d = String(detail || '').trim();
  const mapped = BY_DETAIL[d] || null;
  if (bucket === 'Life Fund') return mapped && LIFE_FUND_KEEP.has(mapped) ? mapped : 'Treats & plans';
  if (bucket === 'Groceries' && (d === 'Gym supplements' || (mapped && FOOD.has(mapped)))) return 'Groceries';
  if (mapped) return mapped;
  return BUCKET_DEFAULT[bucket] || null;
}

// Rough shop-name guesses for lines with no detail yet (ported from the old app).
const GUESSES = [
  [/protein|creatine|pre.?workout/, 'Gym supplements'],
  [/clubwise|\bgym\b/, 'Gym membership'],
  [/spotify|apple storage|icloud|apple\.com|claude|netflix|disney|subscription|voxi/, 'Subscriptions'],
  [/fuel|petrol|diesel|\besso\b|\bshell\b|texaco|\bmaxol\b|applegreen|circle k/, 'Fuel'],
  [/dentist|chemist|pharmacy|doctor|boots/, 'Health'],
  [/parking|translink|\bbus\b|\btrain\b|uber|taxi/, 'Transport'],
  [/energy drink|monster|red bull/, 'Energy drink'],
  [/snack|sweets|vape/, 'Snacks & drinks'],
  [/padel|football|racquet|court booking|squash|cricket|golf/, 'Sport & fitness'],
  [/cinema|rave|card game|bowling|ticketmaster/, 'Entertainment'],
  [/\bpub\b|\bbar\b|inn\b/, 'Pubs & bars'],
  [/takeaway|mcdonald|wingstop|shawarma|deliveroo|just eat|uber eats|costa|coffee|greggs|kfc|domino|pizza|nandos|subway/, 'Takeaway & eating out'],
  [/bakery|bake sale/, 'Bakery'],
  [/lidl|tesco|groceries|aldi|sainsbury|asda|spar|centra|mace|iceland|m ?& ?s food/, 'Groceries'],
  [/home bargains|b ?& ?m\b|poundland/, 'Home Bargains'],
  [/barber|haircut|skincare|hair product/, 'Personal care'],
  [/clothes|clothing|shoes|primark|next\b|zara|h ?& ?m\b/, 'Clothing & shoes'],
  [/\bgift/, 'Gifts'],
  [/amazon|temu|ebay|argos/, 'Shopping'],
];
export function guessDetail(description) {
  const text = String(description ?? '').toLowerCase();
  for (const [pattern, label] of GUESSES) if (pattern.test(text)) return label;
  return '';
}
