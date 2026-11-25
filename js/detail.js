// Gives a transaction a finer category (its "detail", used by the charts) from the words in its description.
// Used for lists you write or get from a chatbot, where there is no bank merchant name to go on.
// The first matching rule wins, so more specific rules come first.
const RULES = [
  [/protein|creatine|pre.?workout/, 'Gym supplements'],
  [/clubwise|\bgym\b/, 'Gym membership'],
  [/spotify|apple storage|icloud|claude|netflix|subscription/, 'Subscriptions'],
  [/fuel|petrol|diesel/, 'Fuel'],
  [/dentist|chemist|pharmacy|doctor/, 'Health'],
  [/energy drink/, 'Energy drink'],
  [/snack|sweets|apples|vape/, 'Snacks & drinks'],
  [/padel|football|racquet|court booking|squash/, 'Sport & fitness'],
  [/cinema|rave|card game|bowling/, 'Entertainment'],
  [/work (lunch|breakfast|food)/, 'Work food'],
  [/takeaway|mcdonald|wingstop|shawarma|bolt deli|dessert|costa|coffee|greggs|kfc|domino|pizza|food for friends/, 'Takeaway & eating out'],
  [/bakery|bake sale/, 'Bakery'],
  [/lidl|tesco|groceries|meal deal|aldi|sainsbury/, 'Groceries'],
  [/hair product|skincare|barber|haircut/, 'Personal care'],
  [/clothes|clothing|shoes/, 'Clothing & shoes'],
  [/\bgift/, 'Gifts'],
  [/amazon|temu|ebay|order|purchase/, 'Shopping'],
];

export function guessDetail(description) {
  const text = String(description ?? '').toLowerCase();
  for (const [pattern, label] of RULES) if (pattern.test(text)) return label;
  return '';
}
