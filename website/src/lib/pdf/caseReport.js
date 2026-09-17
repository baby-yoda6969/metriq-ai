import { jsPDF } from "jspdf";
import { PDF_COLORS } from "../reportTheme.js";
import { RULE_CITATIONS } from "../../data/citations.js";
import { formatDate, formatDateTime, todayLocalISO } from "../format.js";
import {
  STATUS_LABEL, STATUTORY_BASIS, refNo, subjectLine, narrativeSummary, explanatoryNote,
  PENAL_PROVISIONS_INTRO, PENAL_PROVISIONS, recommendedNextSteps, CERTIFICATION_TEXT,
  CLOSING_LINE, DISCLAIMER, caseMetaPairs, fitWithinBox,
} from "../reportContent.js";

// Builds a formal, paginated PDF inspection report, headed as an official
// Legal Metrology record, with per-declaration statutory citations, a
// signature block, and a digital-integrity section, and triggers its
// download.
// NOTE: this is a screening-round aid. The disclaimer printed on the report
// itself (and repeated in the app) makes clear it is not a certified legal
// opinion; citations should be verified against the current gazetted Rules
// before use in formal proceedings, see PRD §4 (non-goals) and §11 (roadmap).
export function downloadReport(scan) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 18;
  const contentW = pageW - marginX * 2;
  let y = 0;
  let page = 1;

  function newPage() {
    doc.addPage();
    page += 1;
    y = 18;
  }

  // Bug fix: `onBreak` lets a caller re-draw context that only makes sense
  // right after a page break (the declaration table's column header, below)
  // — without it, `newPage()` had no way to signal "this triggered a break"
  // back to a mid-table caller, so a table spanning a page boundary
  // continued on the new page with no header row at all.
  function ensureSpace(needed, onBreak) {
    if (y + needed > pageH - 22) {
      newPage();
      if (onBreak) onBreak();
    }
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
    const gap = opts.gap ?? 5;
    doc.setFont("helvetica", opts.bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(text, opts.width || contentW);
    ensureSpace(lines.length * gap + 2);
    doc.text(lines, marginX, y);
    y += lines.length * gap + (opts.spaceAfter ?? 3);
  }

  function bulletList(items) {
    items.forEach((item) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...PDF_COLORS.ink);
      const lines = doc.splitTextToSize(item, contentW - 5);
      ensureSpace(lines.length * 4.6 + 1);
      doc.text("•", marginX, y);
      doc.text(lines, marginX + 4, y);
      y += lines.length * 4.6 + 2;
    });
    y += 2;
  }

  function labelValueRow(pairs) {
    const colW = contentW / 2;
    ensureSpace(6);
    pairs.forEach(([label, value], i) => {
      const x = marginX + (i % 2) * colW;
      const rowY = y;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(...PDF_COLORS.inkSoft);
      doc.text(label.toUpperCase(), x, rowY);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...PDF_COLORS.ink);
      doc.text(String(value || "N/A"), x, rowY + 5);
      if (i % 2 === 1) y += 12;
    });
    if (pairs.length % 2 === 1) y += 12;
  }

  // ---- header ------------------------------------------------------
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...PDF_COLORS.inkSoft);
  doc.text("LEGAL METROLOGY · FIELD COMPLIANCE ENFORCEMENT", pageW / 2, 16, { align: "center" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(...PDF_COLORS.navyDeep);
  doc.text("COMPLIANCE INSPECTION REPORT", pageW / 2, 25, { align: "center" });
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(...PDF_COLORS.inkSoft);
  doc.text("Issued under the Legal Metrology (Packaged Commodities) Rules, 2011", pageW / 2, 31, { align: "center" });
  y = 37;
  rule(PDF_COLORS.brass, 0.8);
  y += 8;

  // ---- formal memo block ---------------------------------------------
  // Modeled on the reference/to/subject block used in real Legal Metrology
  // office correspondence (department circulars and the guidance booklets
  // built on them follow this shape), rather than an invented layout, so
  // the report reads as an actual field-office record instead of a plain
  // data printout.
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...PDF_COLORS.inkSoft);
  doc.text("Ref. No.: " + refNo(scan), marginX, y);
  doc.text("Date: " + formatDate(todayLocalISO()), pageW - marginX, y, { align: "right" });
  y += 7;
  paragraph("To: The Controller of Legal Metrology, " + scan.region + ".", { bold: true, spaceAfter: 2 });
  paragraph(subjectLine(scan), { spaceAfter: 4 });
  paragraph("Sir/Madam,", { spaceAfter: 3 });

  // ---- narrative summary -----------------------------------------------------
  paragraph(narrativeSummary(scan), { spaceAfter: 4 });

  // ---- case meta -----------------------------------------------------
  labelValueRow(caseMetaPairs(scan));
  y += 2;

  // ---- verdict box -----------------------------------------------------
  const verdictColor = scan.status === "compliant" ? PDF_COLORS.green : scan.status === "non_compliant" ? PDF_COLORS.red : PDF_COLORS.brass;
  ensureSpace(16);
  doc.setDrawColor(...verdictColor);
  doc.setLineWidth(0.6);
  doc.rect(marginX, y, contentW, 12);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12.5);
  doc.setTextColor(...verdictColor);
  doc.text("OVERALL VERDICT: " + STATUS_LABEL[scan.status], marginX + 4, y + 8);
  y += 20;

  // ---- statutory basis -----------------------------------------------------
  heading("Statutory Basis");
  bulletList(STATUTORY_BASIS);

  // ---- declarations -----------------------------------------------------
  if (scan.status === "retake_needed") {
    heading("Declaration Verification");
    paragraph(
      "The declarations required under Rule 6 of the Legal Metrology (Packaged Commodities) Rules, 2011 could not be verified from the submitted image. The inspecting officer must obtain a legible photograph and re-submit before a compliance verdict can be recorded.",
      { spaceAfter: 3 }
    );
    paragraph("Reason for retake: " + (scan.retakeReason || "Not specified."), { bold: true, spaceAfter: 3 });
  } else {
    heading("Declaration Verification");
    const cols = [
      { title: "#", w: 8 },
      { title: "Declaration (Rule Reference)", w: 50 },
      { title: "Value Observed", w: 46 },
      { title: "Status", w: 27 },
      { title: "Remarks", w: contentW - 8 - 50 - 46 - 27 },
    ];
    function tableHeader() {
      ensureSpace(9);
      let x = marginX;
      doc.setFillColor(239, 237, 230);
      doc.rect(marginX, y, contentW, 7, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...PDF_COLORS.inkSoft);
      cols.forEach((c) => {
        doc.text(c.title.toUpperCase(), x + 1.5, y + 4.8);
        x += c.w;
      });
      y += 9;
    }
    tableHeader();
    scan.fields.forEach((f, i) => {
      const citation = RULE_CITATIONS[f.name];
      const declText = f.name + (citation ? `\n(${citation.rule})` : "");
      const declLines = doc.splitTextToSize(declText, cols[1].w - 3);
      const valueLines = doc.splitTextToSize(f.value || "N/A", cols[2].w - 3);
      const statusLines = doc.splitTextToSize(f.status.replace("_", " ").toUpperCase(), cols[3].w - 3);
      const remarkLines = doc.splitTextToSize(f.explanation || "", cols[4].w - 3);
      const rowLines = Math.max(declLines.length, valueLines.length, statusLines.length, remarkLines.length, 1);
      const rowH = rowLines * 4 + 3;
      ensureSpace(rowH + 2, tableHeader);
      let x = marginX;
      const rowTop = y;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...PDF_COLORS.ink);
      doc.text(String(i + 1), x + 1.5, rowTop + 4);
      x += cols[0].w;
      doc.text(declLines, x + 1.5, rowTop + 4);
      x += cols[1].w;
      doc.text(valueLines, x + 1.5, rowTop + 4);
      x += cols[2].w;
      const statusColor = f.status === "compliant" ? PDF_COLORS.green : PDF_COLORS.red;
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...statusColor);
      doc.text(statusLines, x + 1.5, rowTop + 4);
      x += cols[3].w;
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...PDF_COLORS.ink);
      doc.text(remarkLines, x + 1.5, rowTop + 4);
      y = rowTop + rowH;
      doc.setDrawColor(...PDF_COLORS.border);
      doc.setLineWidth(0.2);
      doc.line(marginX, y, pageW - marginX, y);
      y += 2;
    });
    y += 4;

    // ---- explanatory notes -----------------------------------------------------
    const nonCompliantFields = scan.fields.filter((f) => f.status !== "compliant");
    if (nonCompliantFields.length > 0) {
      heading("Explanatory Notes");
      bulletList(nonCompliantFields.map(explanatoryNote));

      // ---- applicable penal provisions -----------------------------------
      heading("Applicable Penal Provisions");
      paragraph(PENAL_PROVISIONS_INTRO, { spaceAfter: 3 });
      bulletList(PENAL_PROVISIONS);
    }

    // ---- photo evidence -----------------------------------------------------
    // Bug fix (round 2): the photo was still boxed to a small fixed 60x80mm
    // thumbnail. That's fine for a squarish photo, but a label's back panel
    // (or any long, narrow panel — not specific to any one product) is often
    // shot in a tall, elongated frame; fitWithinBox then had to shrink it to
    // a barely-20mm-wide strip to respect the 80mm height cap, squashing all
    // the printed text down to illegible size even though nothing was
    // technically "broken". Fix: the photo now always starts on a fresh,
    // dedicated page and is sized against the FULL page width and height
    // budget, so whatever its aspect ratio, it renders as large as the page
    // allows rather than being capped by an arbitrary small box.
    //
    // Bug fix (round 3): only the single main photo (scan.imageDataUrl,
    // effectively the "front" angle) was ever embedded — a scan with Side
    // and/or Back evidence photos attached (see ScanView's optional angle
    // slots) had those additional images captured and saved onto the case,
    // but the report silently dropped them: only half the package (or less)
    // ever showed up in the PDF a supervisor or regulator actually reads.
    // renderPhoto() is now reused for the main photo AND every additional
    // angle, each getting the same full-page treatment.
    function renderPhoto(headingText, introText, dataUrl) {
      if (dataUrl) newPage();
      let w = null;
      let h = null;
      if (dataUrl) {
        try {
          const imgProps = doc.getImageProperties(dataUrl);
          ({ width: w, height: h } = fitWithinBox(imgProps.width, imgProps.height, contentW, pageH - 60));
        } catch (e) {
          // leave w/h null — falls through to the "couldn't embed" note below
        }
      }
      heading(headingText);
      if (dataUrl) {
        paragraph(introText, { spaceAfter: 4 });
        if (w) {
          const x = marginX + (contentW - w) / 2;
          doc.setDrawColor(...PDF_COLORS.border);
          doc.setLineWidth(0.3);
          doc.addImage(dataUrl, "JPEG", x, y, w, h);
          doc.rect(x, y, w, h);
          y += h + 6;
        } else {
          paragraph("(Photo could not be embedded in this export.)", { color: PDF_COLORS.inkSoft, spaceAfter: 4 });
        }
      } else {
        paragraph("No photo is on file for this historical record: this case predates in-app image retention, or the record was entered without an attached photograph.", { color: PDF_COLORS.inkSoft, spaceAfter: 4 });
      }
    }

    renderPhoto(
      "Photo Evidence",
      "The label photograph captured for this inspection is reproduced below in full as evidence, alongside its digital-integrity record.",
      scan.imageDataUrl
    );
    if (scan.additionalPhotos?.side) {
      renderPhoto(
        "Additional Evidence — Side Panel",
        "A supplementary photograph of the package's side panel, captured alongside the main declaration photo, is reproduced below in full.",
        scan.additionalPhotos.side
      );
    }
    if (scan.additionalPhotos?.back) {
      renderPhoto(
        "Additional Evidence — Back Panel",
        "A supplementary photograph of the package's back panel, captured alongside the main declaration photo, is reproduced below in full.",
        scan.additionalPhotos.back
      );
    }
  }

  // ---- digital integrity -----------------------------------------------------
  // Bug fix: this used to print "hashed ... using SHA-256" unconditionally,
  // even when hashDataUrl() (src/lib/capture.js) had actually fallen back to
  // a much weaker non-cryptographic hash (SubtleCrypto unavailable — plain
  // HTTP, some embedded webviews) — misrepresenting the tamper-evidence
  // guarantee of a document meant to support legal proceedings. Reports the
  // algorithm actually recorded on this scan instead.
  const hashAlgorithm = scan.hashAlgorithm || "an unspecified algorithm (not recorded for this record)";
  heading("Digital Integrity Record");
  paragraph(
    `The image captured for this inspection was hashed at the time of scan using ${hashAlgorithm}. Any subsequent alteration of the image file would produce a different hash value, providing a basic tamper-evidence check for this record.`,
    { spaceAfter: 4 }
  );
  ensureSpace(24);
  doc.setFillColor(239, 237, 230);
  doc.rect(marginX, y, contentW, 20, "F");
  doc.setFont("courier", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...PDF_COLORS.ink);
  doc.text("Hash:  " + scan.hash, marginX + 3, y + 6);
  doc.text("Captured:  " + formatDateTime(new Date(scan.timestamp)), marginX + 3, y + 12);
  doc.text("Location:  " + scan.gps, marginX + 3, y + 18);
  y += 26;

  // ---- recommended next steps -----------------------------------------------------
  heading("Recommended Next Steps");
  paragraph(recommendedNextSteps(scan), { spaceAfter: 4 });

  // ---- signatures -----------------------------------------------------
  heading("Certification");
  paragraph(CERTIFICATION_TEXT, { spaceAfter: 4 });
  ensureSpace(28);
  const sigColW = contentW / 2 - 5;
  [0, 1].forEach((i) => {
    const x = marginX + i * (sigColW + 10);
    doc.setDrawColor(...PDF_COLORS.inkSoft);
    doc.setLineWidth(0.3);
    doc.line(x, y + 16, x + sigColW, y + 16);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...PDF_COLORS.inkSoft);
    doc.text(i === 0 ? "Signature: Inspecting Officer" : "Signature: Reviewing Supervisor", x, y + 20);
    doc.text("Name: " + (i === 0 ? scan.inspector : "_______________________"), x, y + 25);
    doc.text("Date: _______________________", x, y + 29.5);
  });
  y += 34;
  paragraph(CLOSING_LINE, { size: 8.5, color: PDF_COLORS.inkSoft, spaceAfter: 4 });

  // ---- disclaimer + page numbers on every page -----------------------------------------------------
  const disclaimer = DISCLAIMER;
  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(...PDF_COLORS.border);
    doc.setLineWidth(0.2);
    doc.line(marginX, pageH - 18, pageW - marginX, pageH - 18);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(6.8);
    doc.setTextColor(...PDF_COLORS.inkSoft);
    const discLines = doc.splitTextToSize(disclaimer, contentW);
    doc.text(discLines, marginX, pageH - 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(`Page ${p} of ${totalPages}`, pageW - marginX, pageH - 6, { align: "right" });
  }

  try {
    doc.save(`compliance-report-${scan.id}.pdf`);
  } catch (e) {
    window.alert("Couldn't generate the PDF report in this preview: " + ((e && e.message) || e));
  }
}
