// The five main sections and the pages inside each. Each page keeps its own address (#trends, #plan, ...), so old
// links still work; a section's tab row switches between its pages. Settings and Add sit outside the sections.
export const SECTIONS = [
  { id: 'overview', label: 'Overview', icon: 'overview', pages: [['overview', 'Overview']] },
  { id: 'analytics', label: 'Analytics', icon: 'trends', pages: [['spending', 'Spending'], ['insights', 'Insights'], ['compare', 'Compare'], ['trends', 'Trends'], ['history', 'History'], ['transactions', 'Transactions']] },
  { id: 'planning', label: 'Planning', icon: 'plan', pages: [['plan', 'Payday plan'], ['budgets', 'Budgets'], ['goals', 'Goals'], ['bills', 'Bills'], ['moneyday', 'Money day']] },
  { id: 'wealth', label: 'Wealth', icon: 'wealth', pages: [['wealth', 'Wealth']] },
  { id: 'activity', label: 'Activity', icon: 'activity', pages: [['inbox', 'Review inbox'], ['people', 'IOUs'], ['import', 'Import']] },
];
export const OUTSIDE = [['add', 'Add a transaction'], ['settings', 'Settings']];

export const sectionOf = (route) => SECTIONS.find((s) => s.pages.some(([id]) => id === route)) || null;
export const pageLabel = (route) => [...SECTIONS.flatMap((s) => s.pages), ...OUTSIDE].find(([id]) => id === route)?.[1];
