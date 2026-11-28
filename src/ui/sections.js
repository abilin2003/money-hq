// The five main sections and the pages inside each. Each page keeps its own address (#trends, #plan, ...), so old
// links still work; a section's tab row switches between its pages. Settings and Add sit outside the sections.
// A page can have extra addresses that open inside it (Manage → Bills), listed third.
export const SECTIONS = [
  { id: 'overview', label: 'Overview', icon: 'overview', pages: [['overview', 'Overview']] },
  { id: 'analytics', label: 'Analytics', icon: 'trends', pages: [['spending', 'Spending'], ['insights', 'Insights'], ['compare', 'Compare'], ['reports', 'Reports', ['review']], ['trends', 'Trends'], ['history', 'History'], ['transactions', 'Transactions']] },
  { id: 'planning', label: 'Planning', icon: 'plan', pages: [['plan', 'Payday plan'], ['moneyday', 'Money day'], ['budgets', 'Budgets'], ['goals', 'Goals'], ['manage', 'Manage', ['bills']]] },
  { id: 'wealth', label: 'Wealth', icon: 'wealth', pages: [['wealth', 'Wealth', ['account']]] },
  { id: 'activity', label: 'Activity', icon: 'activity', pages: [['inbox', 'Review inbox'], ['people', 'IOUs'], ['import', 'Import']] },
];
export const OUTSIDE = [['add', 'Add a transaction'], ['settings', 'Settings'], ['bills', 'Bills'], ['review', 'Cycle review']];
export const isPage = ([id, , aliases = []], route) => id === route || aliases.includes(route);

export const sectionOf = (route) => SECTIONS.find((s) => s.pages.some((p) => isPage(p, route))) || null;
export const pageLabel = (route) => [...SECTIONS.flatMap((s) => s.pages), ...OUTSIDE].find(([id]) => id === route)?.[1];
