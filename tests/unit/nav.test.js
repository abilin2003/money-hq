// The menu is five sections. Every page that existed before still has a home, and no page is in two places.
import { describe, it, expect } from 'vitest';
import { SECTIONS, OUTSIDE, sectionOf } from '../../src/ui/sections.js';

const BEFORE = ['overview', 'trends', 'inbox', 'budgets', 'plan', 'goals', 'wealth', 'moneyday', 'people', 'transactions', 'history', 'import', 'add', 'settings'];

describe('navigation', () => {
  it('has exactly five sections, in order', () => {
    expect(SECTIONS.map((s) => s.label)).toEqual(['Overview', 'Analytics', 'Planning', 'Wealth', 'Activity']);
  });
  it('keeps every page that existed before', () => {
    const all = [...SECTIONS.flatMap((s) => s.pages.map(([id]) => id)), ...OUTSIDE.map(([id]) => id)];
    for (const id of BEFORE) expect(all).toContain(id);
    expect(new Set(all).size).toBe(all.length);
  });
  it('puts pages in the sections the plan asks for', () => {
    expect(['spending', 'trends', 'history', 'transactions'].map((r) => sectionOf(r).id)).toEqual(Array(4).fill('analytics'));
    expect(['plan', 'budgets', 'goals', 'bills', 'moneyday'].map((r) => sectionOf(r).id)).toEqual(Array(5).fill('planning'));
    expect(['inbox', 'people', 'import'].map((r) => sectionOf(r).id)).toEqual(Array(3).fill('activity'));
    expect(sectionOf('settings')).toBe(null);
  });
});
