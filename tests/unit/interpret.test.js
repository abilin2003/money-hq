// Reading explanations and spoken transactions with fixed rules. Made-up names and amounts.
import { describe, it, expect } from 'vitest';
import { findAmounts, findDate, wordsToDigits, interpretExplanation, parseSpoken, findFunding, findFund, possibleDuplicates } from '../../src/lib/interpret.js';

const vocab = {
  categories: [
    { id: 'gro', name: 'Groceries', bucket: 'Groceries' }, { id: 'fuel', name: 'Fuel', bucket: 'Fuel' },
    { id: 'eat', name: 'Eating out & takeaway', bucket: 'Fun' }, { id: 'misc', name: 'Miscellaneous', bucket: 'Fun' },
    { id: 'treats', name: 'Treats & plans', bucket: 'Life Fund' }, { id: 'bills', name: 'Bills & subscriptions', bucket: 'Essentials' },
  ],
  accounts: [
    { id: 'rev', name: 'Revolut', type: 'current', institution: 'Revolut' }, { id: 'ul', name: 'Ulster Bank', type: 'current', institution: 'Ulster Bank' },
    { id: 'cc', name: 'Capital One', type: 'credit_card', institution: 'Capital One' }, { id: 'mz', name: 'Monzo savings', type: 'savings', institution: 'Monzo' },
    { id: 'rp', name: 'Revolut Pockets', type: 'savings', institution: 'Revolut' },
  ],
  funds: [{ id: 'bg', name: 'Bulgaria holiday' }, { id: 'hp', name: 'Holiday Pot' }, { id: 'ef', name: 'Emergency fund' }],
  people: [{ id: 'p1', name: 'Ben' }, { id: 'p2', name: 'Dad' }],
  tags: ['Cousins visit'],
  shops: new Map([['tesco', 'gro']]),
};
const today = '2026-11-26'; // a Thursday

describe('amounts said or typed', () => {
  it('reads the ways people say money', () => {
    expect(findAmounts('£12.50 and £8.20').map((a) => a.pence)).toEqual([1250, 820]);
    expect(findAmounts('45 quid').map((a) => a.pence)).toEqual([4500]);
    expect(findAmounts('12 pounds 50').map((a) => a.pence)).toEqual([1250]);
    expect(findAmounts('50p').map((a) => a.pence)).toEqual([50]);
    expect(findAmounts('£1,200').map((a) => a.pence)).toEqual([120000]);
    expect(findAmounts('twelve pounds fifty').map((a) => a.pence)).toEqual([1250]);
    expect(findAmounts('forty-five pounds').map((a) => a.pence)).toEqual([4500]);
    expect(findAmounts('a hundred and twenty pounds').map((a) => a.pence)).toEqual([12000]);
    expect(findAmounts('I went to Tesco on the 3rd')).toEqual([]);
  });
  it('turns number words into digits without touching other words', () => {
    expect(wordsToDigits('spent twenty one pounds at one stop shop')).toBe('spent 21 pounds at one stop shop');
    expect(wordsToDigits('forty five quid on Capital One')).toBe('45 quid on Capital One');
  });
});

describe('dates, in Europe/London days', () => {
  it('today, yesterday, days ago', () => {
    expect(findDate('yesterday I spent', today)).toBe('2026-11-25');
    expect(findDate('the day before yesterday', today)).toBe('2026-11-24');
    expect(findDate('3 days ago', today)).toBe('2026-11-23');
    expect(findDate('today', today)).toBe(today);
  });
  it('a weekday is the most recent one before today; "last" on the same weekday is a week ago', () => {
    expect(findDate('on Monday', today)).toBe('2026-11-23');
    expect(findDate('last Monday', today)).toBe('2026-11-23');
    expect(findDate('on Thursday', today)).toBe(today);
    expect(findDate('last Thursday', today)).toBe('2026-11-19');
  });
  it('a date with no year is never in the future', () => {
    expect(findDate('on 3rd November', today)).toBe('2026-11-03');
    expect(findDate('December 5th', today)).toBe('2025-12-05');
    expect(findDate('on the 28th', today)).toBe('2026-10-28');
    expect(findDate('no date here', today)).toBe(null);
  });
});

describe('an inbox line explained in your own words', () => {
  const flight = { id: 'f1', amount_pence: -10180, kind: 'spend', account_id: 'cc', accountName: 'Capital One', raw_description: 'Bulgaria outbound flight', source: 'manual', from_savings: false };
  const back = { id: 'f2', amount_pence: -4200, kind: 'spend', account_id: 'cc', raw_description: 'Bulgaria return flight', source: 'manual' };
  it('keeps the card, the category and the fund apart', () => {
    const r = interpretExplanation('This flight was for my Bulgaria holiday. I paid using my Capital One credit card, but I want the expense assigned to my Bulgaria holiday fund rather than my normal Fun budget.', flight, vocab, [flight, back]);
    expect(r.changes).toMatchObject({ from_savings: true, tag: 'Bulgaria holiday', fund_id: 'bg' });
    expect(r.changes.account_id).toBeUndefined(); // already on Capital One
    expect(r.understood.find((u) => u.field === 'account').value).toBe('Capital One');
    expect(r.questions.some((q) => /Travel category/.test(q))).toBe(true); // no Travel category: asked, not guessed
    expect(r.changes.category_id).toBeUndefined();
    expect(r.alsoApply.map((o) => o.id)).toEqual(['f2']); // the return flight too
    expect(r.understood.some((u) => u.field === 'bucket')).toBe(false); // "rather than my Fun budget" is not a choice of Fun
  });
  it('the holiday savings that mean Bulgaria when you mention Bulgaria, and asks when it can’t tell', () => {
    const r = interpretExplanation('That payment was for my Bulgaria flights. It was made on my credit card, and I used money from my holiday savings to cover it.', flight, vocab);
    expect(r.changes).toMatchObject({ from_savings: true, fund_id: 'bg' });
    const vague = interpretExplanation('I used my holiday savings for it', flight, vocab);
    expect(vague.changes.from_savings).toBe(true);
    expect(vague.questions.some((q) => /Bulgaria holiday or Holiday Pot/.test(q))).toBe(true);
  });
  it('a category, a bucket and who owes you', () => {
    const meal = { id: 'm', amount_pence: -6000, kind: 'spend', account_id: 'rev', raw_description: 'Cosmo', source: 'import:revolut' };
    const r = interpretExplanation('Group dinner out. Ben owes me £20.', meal, vocab);
    expect(r.changes.category_id).toBe('eat');
    expect(r.splits).toEqual([{ name: 'Ben', pence: 2000 }]);
  });
  it('on a bank line, a different account is a question, not a change', () => {
    const line = { id: 'x', amount_pence: -1000, kind: 'spend', account_id: 'ul', accountName: 'Ulster Bank', raw_description: 'Tesco', source: 'import:ulster' };
    const r = interpretExplanation('groceries on my Revolut', line, vocab);
    expect(r.changes).toMatchObject({ category_id: 'gro' });
    expect(r.changes.account_id).toBeUndefined();
    expect(r.questions[0]).toMatch(/Ulster Bank statement, but you said Revolut/);
  });
  it('money in from a friend, and words it can’t match', () => {
    const inn = { id: 'i', amount_pence: 1838, kind: 'transfer', account_id: 'rev', raw_description: 'Payment from B', source: 'import:revolut' };
    expect(interpretExplanation('Ben paid me back for the buffet', inn, vocab).changes.kind).toBe('repayment');
    const r = interpretExplanation('no idea honestly', { ...flight, raw_description: 'XYZ' }, vocab);
    expect(r.changes).toEqual({});
    expect(r.questions[0]).toMatch(/couldn’t match/);
  });
  it('savings: from, not from', () => {
    expect(findFunding('it came out of my emergency fund')).toBe(true);
    expect(findFunding('it was not from my savings')).toBe(false);
    expect(findFunding('just normal spending')).toBe(false);
    expect(findFunding('bought a coffee')).toBe(null);
    expect(findFund('emergency', vocab).id).toBe('ef');
  });
});

describe('transactions said out loud', () => {
  it('the example from the brief: three transactions, dates carried on, accounts never guessed', () => {
    const out = parseSpoken('Yesterday I spent £12.50 at Tesco on groceries using Revolut. Then I spent £8.20 at McDonald\'s from my Fun budget. On Monday I spent £45 on petrol using Capital One.', vocab, today);
    expect(out.map((t) => [t.date, t.description, t.amount_pence, t.category_id, t.account_id])).toEqual([
      ['2026-11-25', 'Tesco', -1250, 'gro', 'rev'],
      ['2026-11-25', 'McDonald\'s', -820, 'eat', null],
      ['2026-11-23', 'Petrol', -4500, 'fuel', 'cc'],
    ]);
    expect(out[1].unsure).toEqual(['account']);
    expect(out[0].unsure).toEqual([]);
  });
  it('several amounts in one sentence become separate transactions', () => {
    const out = parseSpoken('today £3 on snacks at Spar and £20 fuel at Tesco with Ulster', vocab, today);
    expect(out.map((t) => [t.amount_pence, t.category_id])).toEqual([[-300, null], [-2000, 'fuel']]);
    expect(out[0].unsure).toContain('category'); // no Snacks category in this test: asked, not guessed
  });
  it('nothing invented: no date, no account, no shop are all left for you', () => {
    const [t] = parseSpoken('spent 9 quid', vocab, today);
    expect(t).toMatchObject({ amount_pence: -900, date: null, account_id: null, description: '' });
    expect(t.unsure).toEqual(expect.arrayContaining(['date', 'account', 'description', 'category']));
    expect(parseSpoken('hello there', vocab, today)).toEqual([]);
  });
  it('money in, savings and splits', () => {
    const [a, b] = parseSpoken('Yesterday Ben paid me back £18.38 on Revolut. Then £60 dinner on Capital One, split with Ben and Dad.', vocab, today);
    expect(a).toMatchObject({ amount_pence: 1838, kind: 'repayment', account_id: 'rev' });
    expect(b.splits).toEqual([{ name: 'Ben', pence: 2000 }, { name: 'Dad', pence: 2000 }]);
    const [c] = parseSpoken('£100 hotel out of my Bulgaria holiday fund yesterday on my credit card', vocab, today);
    expect(c).toMatchObject({ from_savings: true, tag: 'Bulgaria holiday', account_id: 'cc' });
  });
  it('spots a payment you already have', () => {
    const t = { date: '2026-11-25', amount_pence: -1250, account_id: 'rev' };
    expect(possibleDuplicates(t, [{ id: 'a', date: '2026-11-24', amount_pence: -1250, account_id: 'rev' }, { id: 'b', date: '2026-11-24', amount_pence: -1250, account_id: 'ul' }]).map((x) => x.id)).toEqual(['a']);
  });
});
