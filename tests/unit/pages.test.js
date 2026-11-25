// Labels on the transactions list.
import { describe, it, expect } from 'vitest';
import { categoryLabel } from '../../src/views/pages.js';

describe('categoryLabel', () => {
  it('drops the bucket name when a split category repeats it', () => {
    expect(categoryLabel('Snacks & drinks (Fun)', 'Fun')).toBe('Snacks & drinks, Fun');
  });
  it('shows a category once when it has the same name as its bucket', () => {
    expect(categoryLabel('Groceries', 'Groceries')).toBe('Groceries');
  });
  it('shows category and bucket otherwise', () => {
    expect(categoryLabel('Health', 'Essentials')).toBe('Health, Essentials');
    expect(categoryLabel('Health', undefined)).toBe('Health');
  });
});
