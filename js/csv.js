// Minimal RFC4180-ish CSV parser: quote-aware (handles embedded commas and
// escaped "" quotes), which a naive split(',') can't — some columns in the
// real nodes CSVs (e.g. `paths`) contain quoted commas.
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else if (c === '\r') {
      // skip — the following \n (if any) ends the row
    } else {
      field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];

  const header = rows[0];
  return rows.slice(1)
    .filter(r => r.length > 1 || r[0] !== '')
    .map(r => {
      const obj = {};
      header.forEach((h, i) => { obj[h] = r[i] !== undefined ? r[i] : ''; });
      return obj;
    });
}
