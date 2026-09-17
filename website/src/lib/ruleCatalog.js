// Turns the flat, line-per-clause rule text format ("Rule 6(1)(a): ...",
// one clause per line — see RULE_BASE_TEXT in App.jsx) into a structured
// catalog for the Rule Admin console, and back into that same flat text so
// nothing downstream (the diff view, /api/rules, /api/analyze's prompt
// injection) has to change. One clause per line was already the actual
// shape of every rule version in this app; this module just gives the UI a
// table to browse/edit instead of a single opaque textarea.

const CATEGORY_RULES = [
  // Checked before the rule-number patterns below: an exemption clause
  // (e.g. "Rule 6(1)(e) exemption: packs under 150g are EXEMPT from...")
  // is numbered under whichever declaration it excuses, not under Rule 26
  // specifically — so a keyword match has to win over the number match, or
  // every exemption not literally filed under Rule 26 gets miscategorized
  // as the very declaration it's exempting someone from.
  { test: /exempt/i, category: "Exemptions" },
  { test: /rule\s*26/i, category: "Exemptions" },
  { test: /rule\s*7\b/i, category: "Display & Font" },
  { test: /consumer care|6\(2\)/i, category: "Consumer Care" },
  { test: /6\(1\)/i, category: "Mandatory Declarations" },
];

export function categorizeClause(ref, body) {
  const probe = ref + " " + body;
  for (const { test, category } of CATEGORY_RULES) {
    if (test.test(probe)) return category;
  }
  return "General";
}

export const CATEGORY_TONE = {
  "Mandatory Declarations": "navy",
  "Exemptions": "caution",
  "Consumer Care": "neutral",
  "Display & Font": "neutral",
  "General": "neutral",
};

// Splits "Rule 6(1)(e) (combo packs): Combo/bundle packs must show..." into
// { ref: "Rule 6(1)(e) (combo packs)", body: "Combo/bundle packs must show..." }.
// A line that doesn't match the "Rule ...: ..." shape (a free-form addition
// typed straight into the raw editor) still round-trips fine: ref falls
// back to "—" and the whole line is kept as the body.
export function parseRuleCatalog(ruleText) {
  const lines = (ruleText || "").split("\n").filter((l) => l.trim().length > 0);
  return lines.map((raw, index) => {
    const m = raw.match(/^(Rule\s+[^:]+):\s*(.*)$/i);
    const ref = m ? m[1].trim() : "—";
    const body = m ? m[2].trim() : raw.trim();
    return { index, raw, ref, body, category: categorizeClause(ref, body) };
  });
}

const CATEGORY_ORDER = ["Mandatory Declarations", "Consumer Care", "Exemptions", "Display & Font", "General"];

// Groups a parsed catalog by category, in a fixed reading order, instead of
// just whatever order the clauses happen to appear in the flat rule text
// (which — since amendments get appended chronologically — would otherwise
// scatter e.g. two "Consumer Care" clauses to opposite ends of the list).
// Each clause keeps its original `index`, so edits/removals still target
// the right line in the underlying flat text regardless of display order.
export function groupByCategory(catalog) {
  const groups = new Map();
  for (const clause of catalog) {
    if (!groups.has(clause.category)) groups.set(clause.category, []);
    groups.get(clause.category).push(clause);
  }
  const ordered = CATEGORY_ORDER.filter((c) => groups.has(c)).map((category) => ({ category, clauses: groups.get(category) }));
  for (const [category, clauses] of groups) {
    if (!CATEGORY_ORDER.includes(category)) ordered.push({ category, clauses });
  }
  return ordered;
}

export function stringifyCatalog(catalog) {
  return catalog.map((c) => c.raw).join("\n");
}

// Both writers below collapse any embedded newline in the incoming text to
// a space first. Bug fix: the catalog's per-clause editors are plain
// <textarea>s, which happily accept a pasted multi-line paragraph (or a
// stray Enter press) — saving that raw would silently inject extra "\n"s
// into the flat rule text, and since one clause is defined as one line,
// that one edit would fracture into several bogus clauses (with mangled
// ref/body parsing) the next time the text was parsed, with no error or
// indication anything had gone wrong.
function sanitizeClauseLine(text) {
  return (text || "").replace(/\s*\n\s*/g, " ").trim();
}

export function updateClauseText(ruleText, index, newRaw) {
  const catalog = parseRuleCatalog(ruleText);
  const target = catalog.find((c) => c.index === index);
  if (!target) return ruleText;
  target.raw = sanitizeClauseLine(newRaw);
  return stringifyCatalog(catalog);
}

export function removeClauseAt(ruleText, index) {
  const catalog = parseRuleCatalog(ruleText).filter((c) => c.index !== index);
  return stringifyCatalog(catalog);
}

export function addClauseLine(ruleText, newRaw) {
  const text = (ruleText || "").trim();
  const clean = sanitizeClauseLine(newRaw);
  return text ? text + "\n" + clean : clean;
}

// Naive line-set diff — enough to visualize what changed between two rule
// texts without a full LCS implementation. Used both for draft-vs-active
// and for comparing any two published versions.
export function diffRuleText(oldText, newText) {
  const oldLines = (oldText || "").split("\n");
  const newLines = (newText || "").split("\n");
  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);
  const removed = oldLines.filter((l) => l.trim() && !newSet.has(l));
  const added = newLines.filter((l) => l.trim() && !oldSet.has(l));
  return { added, removed };
}
