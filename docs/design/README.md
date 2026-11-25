# Midnight reference designs

The three Money HQ designs, exported from the Claude design canvas:
https://claude.ai/artifact/5Z7MW95crQ1h4FFcxEQg8N

| File | Screen | Size |
| --- | --- | --- |
| `overview-laptop.dc.html` | Overview, laptop | 1440 wide, fluid |
| `overview-phone.dc.html` | Overview, phone | 390 × 844 |
| `quick-add-phone.dc.html` | Quick add, phone | 390 × 844 |

These are reference markup, not app code, and they won't run on their own. They use the canvas's template format:

- `{{name}}` holes are filled by the `renderVals()` script at the bottom of each file.
- `<sc-for>` repeats an element and `<sc-if>` shows one conditionally.
- The typeface switch defaults to **Archivo**: `font-stretch: 125%` for headings and big numbers, 100% for text.

Use them for structure, spacing, colours and copy. The numbers in them are a snapshot from 25 Nov 2026 (day 2 of the cycle, last cycle's real totals). The app must use live data.
