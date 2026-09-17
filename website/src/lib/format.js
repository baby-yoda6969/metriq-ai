// Shared date formatters, used across scan results, case history, the
// dashboard, and PDF exports so a date reads the same everywhere.

// Bug fix: every "today's date" call site in the app used to write
// `new Date().toISOString().slice(0, 10)`, which is the UTC calendar date,
// not the local one — for any user between UTC and UTC+the local offset
// past midnight (e.g. 00:00-05:29 IST), that's still yesterday's date. A
// report generated at 1am IST on the 2nd printed "1st" as its date, one day
// behind every other locally-timestamped record in the same case file. This
// returns the actual local calendar date in the same YYYY-MM-DD shape.
export function todayLocalISO() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDate(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function monthLabel(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
}

// Deliberately avoids "/"-separated date formats here: jsPDF's built-in
// Helvetica metrics render a "/" right after certain digit pairs (e.g. "31")
// so tightly that text extraction reads it back as ".". Spelled-out months
// sidestep the glyph-spacing issue entirely and read more formally besides.
export function formatDateTime(date) {
  const datePart = date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const timePart = date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  return `${datePart}, ${timePart}`;
}
