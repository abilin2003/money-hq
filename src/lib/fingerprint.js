// A transaction's fingerprint: account + date + amount + normalised description, plus a counter for genuine
// same-day duplicates (two identical coffees). Importing the same file twice gives the same fingerprints,
// and the database refuses a fingerprint it already has (unique per user).

export const normaliseDescription = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// rows: [{ account, date, amount_pence, raw_description }] -> the same rows with `fingerprint` added.
export function addFingerprints(rows) {
  const seen = new Map();
  return rows.map((r) => {
    const base = `${normaliseDescription(r.account)}|${r.date}|${r.amount_pence}|${normaliseDescription(r.raw_description)}`;
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    return { ...r, fingerprint: `${base}|${n}` };
  });
}
