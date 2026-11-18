// Built-in defaults. Nothing personal and no real figures live here.

export const ACCOUNTS = ['Ulster Bank', 'Revolut', 'Monzo', 'Credit Card', 'Trading 212', 'InvestEngine'];

export const INVESTED_ACCOUNTS = ['Cash ISA (Trading 212)', 'S&S ISA (InvestEngine)'];

export const DEFAULT_CATEGORIES = [
  { name: 'Essentials', emoji: '🏠', color: '#9184ff' },
  { name: 'Groceries', emoji: '🛒', color: '#4ade80' },
  { name: 'Personal Upkeep', emoji: '💈', color: '#60a5fa' },
  { name: 'Life Fund', emoji: '❤️', color: '#2ee6b6' },
  { name: 'Fun', emoji: '🎉', color: '#ffc94d' },
];

// What each kind of transaction means for the totals:
//   spending  money out on things you bought (counts as spending)
//   income    salary and other real income
//   invested  money moved into an ISA or pension (shown separately, never spending)
//   payback   money back for something (a refund, or a friend paying you back): reduces spending
//   internal  a move between your own accounts or pots: left out of every total
//   fund      money held for a shared fund, not yours: left out of income and spending
//   unsure    not decided yet: left out of totals until you decide
export const KINDS = ['spending', 'income', 'invested', 'payback', 'internal', 'fund', 'unsure'];

export const SEED_MERCHANT_RULES = {
  trading: { kind: 'invested', category: 'Cash ISA (Trading 212)' },
  investengine: { kind: 'invested', category: 'S&S ISA (InvestEngine)' },
};

// Wording that banks use for moves between your own pots and accounts.
export const INTERNAL_PATTERNS = /\b(pocket withdrawal|withdrawing savings|depositing savings|to pocket|from pocket|pot transfer|exchanged to|exchanged from)\b/i;

// Suggestions from a bank's own category (Monzo). Only used if the category exists in your settings.
export const BANK_CATEGORY_HINTS = {
  groceries: 'Groceries',
  'eating out': 'Fun',
  eating_out: 'Fun',
  entertainment: 'Fun',
  transport: 'Essentials',
  bills: 'Essentials',
  'personal care': 'Personal Upkeep',
  personal_care: 'Personal Upkeep',
  family: 'Life Fund',
  gifts: 'Life Fund',
};
