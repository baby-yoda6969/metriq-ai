import { jsPDF } from "jspdf";
import { PDF_COLORS } from "../reportTheme.js";
import { formatDate, formatDateTime } from "../format.js";
import { groupByCategory, parseRuleCatalog } from "../ruleCatalog.js";

// A formal, standalone record of one rule version's full text — for filing
// alongside the gazette notification it implements, or handing to a
// reviewer who wants the whole clause set on paper rather than in the
// changelog UI. Mirrors the layout conventions of the case report (see
// ../pdf/caseReport.js): memo header, statutory framing, then the content.
export function downloadRuleVersionPdf(version) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 18;
  const contentW = pageW - marginX * 2;
  let y = 0;

  function newPage() {
    doc.addPage();
    y = 18;
  }

  function ensureSpace(needed) {
    if (y + needed > pageH - 20) newPage();
  }

  function rule(color = PDF_COLORS.border, weight = 0.3) {
    doc.setDrawColor(...color);
    doc.setLineWidth(weight);
    doc.line(marginX, y, pageW - marginX, y);
  }

  function heading(text) {
    ensureSpace(12);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...PDF_COLORS.navyDeep);
    doc.text(text.toUpperCase(), marginX, y);
    y += 2;
    rule(PDF_COLORS.brass, 0.5);
    y += 6;
  }

  function paragraph(text, opts = {}) {
    const size = opts.size || 9.5;
    const color = opts.color || PDF_COLORS.ink;
    doc.setFont("helvetica", opts.bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(text, opts.width || contentW);
    ensureSpace(lines.length * 5 + 2);
    doc.text(lines, marginX, y);
    y += lines.length * 5 + (opts.spaceAfter ?? 3);
  }

  // ---- header ------------------------------------------------------
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...PDF_COLORS.inkSoft);
  doc.text("LEGAL METROLOGY · RULE ADMINISTRATION", pageW / 2, 16, { align: "center" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(...PDF_COLORS.navyDeep);
  doc.text("RULE VERSION RECORD " + version.version.toUpperCase(), pageW / 2, 25, { align: "center" });
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(...PDF_COLORS.inkSoft);
  doc.text("Legal Metrology (Packaged Commodities) Rules, 2011 — declaration ruleset", pageW / 2, 31, { align: "center" });
  y = 37;
  rule(PDF_COLORS.brass, 0.8);
  y += 8;

  // ---- meta ----------------------------------------------------------
  const metaPairs = [
    ["Version", version.version],
    ["Published", formatDate(version.date)],
    ["Author", version.author],
    ["Status", (version.status || "published").toUpperCase()],
    ["Record generated", formatDateTime(new Date())],
  ];
  metaPairs.forEach(([label, value]) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...PDF_COLORS.inkSoft);
    doc.text(label.toUpperCase() + ":", marginX, y);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...PDF_COLORS.ink);
    doc.text(String(value || "—"), marginX + 34, y);
    y += 6;
  });
  y += 3;

  heading("Amendment Summary");
  paragraph(version.desc || "No summary recorded.", { spaceAfter: 4 });
  if (version.reviewerComments) {
    paragraph("Reviewer comments: " + version.reviewerComments, { color: PDF_COLORS.inkSoft, spaceAfter: 4 });
  }

  // ---- clause catalog --------------------------------------------------
  heading("Declaration Ruleset (Full Text)");
  const catalog = parseRuleCatalog(version.ruleText);
  const groups = groupByCategory(catalog);
  let clauseNumber = 0;
  groups.forEach((group) => {
    // Bug fix: this used to reserve space for the category heading alone
    // (ensureSpace(9)), the same "orphaned heading" mistake fixed earlier
    // in the case report's Photo Evidence section — a heading landing near
    // the bottom of a page would fit, but its first clause right after it
    // could still overflow onto the next page, stranding the heading alone.
    // Reserving room for the heading AND its first clause together, before
    // drawing either, keeps them on the same page every time.
    const first = group.clauses[0];
    const firstRefLines = doc.splitTextToSize(first.ref, contentW - 6);
    const firstBodyLines = doc.splitTextToSize(first.body, contentW - 6);
    ensureSpace(9 + firstRefLines.length * 4.6 + firstBodyLines.length * 4.6 + 4);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...PDF_COLORS.brass);
    doc.text(group.category.toUpperCase(), marginX, y);
    y += 6;
    group.clauses.forEach((clause) => {
      clauseNumber += 1;
      const refLines = doc.splitTextToSize(clause.ref, contentW - 6);
      const bodyLines = doc.splitTextToSize(clause.body, contentW - 6);
      ensureSpace(refLines.length * 4.6 + bodyLines.length * 4.6 + 4);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(...PDF_COLORS.navy);
      doc.text(String(clauseNumber) + ". " + clause.ref, marginX, y);
      y += refLines.length * 4.6 + 1;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(...PDF_COLORS.ink);
      doc.text(bodyLines, marginX + 4, y);
      y += bodyLines.length * 4.6 + 3;
    });
    y += 2;
  });

  // ---- footer + page numbers -------------------------------------------
  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(...PDF_COLORS.border);
    doc.setLineWidth(0.2);
    doc.line(marginX, pageH - 14, pageW - marginX, pageH - 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...PDF_COLORS.inkSoft);
    doc.text(`Page ${p} of ${totalPages}`, pageW - marginX, pageH - 8, { align: "right" });
  }

  try {
    doc.save(`rule-version-${version.version}.pdf`);
  } catch (e) {
    window.alert("Couldn't generate the PDF in this preview: " + ((e && e.message) || e));
  }
}
