// Drawing the charts. Chart.js is loaded from cdnjs at an exact, pinned version (there is no build step).
// If it can't be loaded (for example offline), callers show a calm message and the rest of the page still works.

const CHART_JS = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';

let loading = null;
export function loadChartJs() {
  if (globalThis.Chart) return Promise.resolve(globalThis.Chart);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = CHART_JS;
      s.async = true;
      s.onload = () => (globalThis.Chart ? resolve(globalThis.Chart) : reject(new Error('The chart library loaded but is not usable.')));
      s.onerror = () => { loading = null; reject(new Error('The chart library could not be loaded. Charts need an internet connection.')); };
      document.head.append(s);
    });
  }
  return loading;
}

// Distinct colours that read well on the dark background. The last one (grey) is "Everything else".
const PALETTE = ['#7c8cff', '#ff6b8b', '#2ee6b6', '#ffc857', '#b794ff', '#22e1d0', '#ff9f5a', '#7e8aa3'];
const GREEN = '#2ee6b6';
const RED = '#ff5c7a';
const BLUE = '#4cc9ff';

const gbp = (n) => `£${Math.round(n).toLocaleString('en-GB')}`;
const gbpAxis = (v) => (Math.abs(v) >= 1000 ? `£${v / 1000}k` : `£${v}`);

// Chart colours follow the light/dark theme, read from the page's CSS variables each time a chart is drawn.
export function applyChartTheme(Chart) {
  const cs = getComputedStyle(document.documentElement);
  Chart.defaults.color = cs.getPropertyValue('--muted').trim() || '#9aa6b8';
  Chart.defaults.borderColor = cs.getPropertyValue('--line').trim() || '#26304a';
  Chart.defaults.font.family = '"Manrope Variable", Manrope, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif';
  Chart.defaults.font.size = 12;
  // Glass-style tooltips that follow the light/dark theme.
  const light = document.documentElement.dataset.theme === 'light';
  const tip = Chart.defaults.plugins.tooltip;
  tip.backgroundColor = light ? 'rgba(255,255,255,0.97)' : 'rgba(6,10,24,0.94)';
  tip.titleColor = light ? '#0f1636' : '#eaf0ff';
  tip.bodyColor = light ? '#0f1636' : '#eaf0ff';
  tip.borderColor = light ? 'rgba(80,95,170,0.25)' : 'rgba(160,175,255,0.28)';
  tip.borderWidth = 1;
  tip.cornerRadius = 12;
  tip.padding = 12;
  tip.boxPadding = 5;
  Chart.defaults.elements.bar.borderRadius = 6;
}

const theme = applyChartTheme;

const baseOptions = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 250 },
  interaction: { mode: 'index', intersect: false },
};

// Stacked bars: what you paid each month, by category.
export function drawSpendChart(Chart, canvas, labels, spend) {
  theme(Chart);
  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: spend.series.map((s, i) => ({
        label: s.name,
        data: s.values,
        backgroundColor: s.name === 'Everything else' ? PALETTE[PALETTE.length - 1] : PALETTE[i % (PALETTE.length - 1)],
        borderWidth: 0,
        stack: 'spend',
      })),
    },
    options: {
      ...baseOptions,
      scales: {
        x: { stacked: true, grid: { display: false } },
        y: { stacked: true, beginAtZero: true, ticks: { callback: gbpAxis } },
      },
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true } },
        tooltip: {
          itemSort: (a, b) => b.raw - a.raw,
          filter: (item) => item.raw > 0,
          callbacks: {
            label: (ctx) => ` ${ctx.dataset.label}: ${gbp(ctx.raw)}`,
            footer: (items) => `Total: ${gbp(items.reduce((a, i) => a + i.raw, 0))}`,
          },
        },
      },
    },
  });
}

// Grouped bars: money in, spent and invested, per month.
export function drawMoneyChart(Chart, canvas, labels, money) {
  theme(Chart);
  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'In', data: money.income, backgroundColor: GREEN, borderWidth: 0 },
        { label: 'Spent', data: money.spent, backgroundColor: RED, borderWidth: 0 },
        { label: 'Invested', data: money.invested, backgroundColor: BLUE, borderWidth: 0 },
      ],
    },
    options: {
      ...baseOptions,
      scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true, ticks: { callback: gbpAxis } },
      },
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true } },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.dataset.label}: ${gbp(ctx.raw)}`,
            afterBody: (items) => {
              const i = items[0].dataIndex;
              return money.back[i] > 0 ? [`Spent is after ${gbp(money.back[i])} paid back to you`] : [];
            },
          },
        },
      },
    },
  });
}
