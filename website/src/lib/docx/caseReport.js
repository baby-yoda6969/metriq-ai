import {
  AlignmentType, BorderStyle, Document, HeadingLevel, ImageRun, Packer, Paragraph,
  ShadingType, Table, TableCell, TableRow, TextRun, WidthType,
} from "docx";
import { PRINT_COLORS as COLORS } from "../reportTheme.js";
import { RULE_CITATIONS } from "../../data/citations.js";
import { formatDate, formatDateTime, todayLocalISO } from "../format.js";
import {
  STATUS_LABEL, STATUTORY_BASIS, refNo, subjectLine, narrativeSummary, explanatoryNote,
  PENAL_PROVISIONS_INTRO, PENAL_PROVISIONS, recommendedNextSteps, CERTIFICATION_TEXT,
  CLOSING_LINE, DISCLAIMER, caseMetaPairs, fitWithinBox,
} from "../reportContent.js";

// docx wants hex without the leading "#".
const HEX = Object.fromEntries(Object.entries(COLORS).map(([k, v]) => [k, v.replace("#", "")]));
const STATUS_COLOR = { compliant: HEX.green, non_compliant: HEX.red, missing: HEX.red, retake_needed: HEX.brass };

function heading(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 120 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: HEX.brass, space: 4 } },
    children: [new TextRun({ text: text.toUpperCase(), bold: true, color: HEX.navyDeep, size: 22 })],
  });
}

function body(text, opts = {}) {
  return new Paragraph({
    spacing: { after: opts.spaceAfter ?? 160 },
    children: [new TextRun({ text, bold: !!opts.bold, italics: !!opts.italics, color: opts.color || HEX.ink, size: opts.size || 19 })],
  });
}

function bulletList(items) {
  return items.map((item) => new Paragraph({ text: item, bullet: { level: 0 }, spacing: { after: 80 } }));
}

function labelValueTable(pairs) {
  const rows = [];
  for (let i = 0; i < pairs.length; i += 2) {
    rows.push(new TableRow({
      children: [pairs[i], pairs[i + 1]].filter(Boolean).map(([label, value]) => new TableCell({
        width: { size: 50, type: WidthType.PERCENTAGE },
        borders: { top: NONE, bottom: NONE, left: NONE, right: NONE },
        margins: { top: 80, bottom: 160, left: 0, right: 120 },
        children: [
          new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: label.toUpperCase(), size: 15, color: HEX.inkSoft })] }),
          new Paragraph({ children: [new TextRun({ text: String(value || "N/A"), bold: true, size: 20, color: HEX.ink })] }),
        ],
      })),
    }));
  }
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows });
}

const NONE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const CELL_BORDER = { style: BorderStyle.SINGLE, size: 4, color: HEX.border };
const cellBorders = { top: CELL_BORDER, bottom: CELL_BORDER, left: CELL_BORDER, right: CELL_BORDER };

function headerCell(text, widthPct) {
  return new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    borders: cellBorders,
    shading: { type: ShadingType.CLEAR, fill: "EFEDE6" },
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
    children: [new Paragraph({ children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 15, color: HEX.inkSoft })] })],
  });
}

function dataCell(text, widthPct, opts = {}) {
  return new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    borders: cellBorders,
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
    children: [new Paragraph({ children: [new TextRun({ text: String(text), bold: !!opts.bold, color: opts.color || HEX.ink, size: 16 })] })],
  });
}

function declarationTable(scan) {
  const rows = [
    // Bug fix: without `tableHeader: true`, Word has no reason to repeat
    // this row when the declaration table spans a page break (the same
    // missing-header-on-continuation-page bug the PDF export had) — a case
    // with enough fields/explanation text to overflow one page produced a
    // second page of unlabeled columns.
    new TableRow({
      tableHeader: true,
      children: [
        headerCell("#", 5), headerCell("Declaration (Rule Reference)", 27), headerCell("Value Observed", 27),
        headerCell("Status", 13), headerCell("Remarks", 28),
      ],
    }),
  ];
  scan.fields.forEach((f, i) => {
    const citation = RULE_CITATIONS[f.name];
    rows.push(new TableRow({
      children: [
        dataCell(i + 1, 5),
        dataCell(f.name + (citation ? ` (${citation.rule})` : ""), 27),
        dataCell(f.value || "N/A", 27),
        dataCell(f.status.replace("_", " ").toUpperCase(), 13, { bold: true, color: f.status === "compliant" ? HEX.green : HEX.red }),
        dataCell(f.explanation || "", 28),
      ],
    }));
  });
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows });
}

function signatureBlock(scan) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE },
    rows: [
      new TableRow({
        children: [0, 1].map((i) => new TableCell({
          width: { size: 50, type: WidthType.PERCENTAGE },
          borders: { top: NONE, bottom: NONE, left: NONE, right: NONE },
          margins: { right: 200 },
          children: [
            new Paragraph({
              spacing: { before: 400, after: 40 },
              border: { top: { style: BorderStyle.SINGLE, size: 4, color: HEX.inkSoft, space: 1 } },
              children: [new TextRun({ text: " ", size: 2 })],
            }),
            body(i === 0 ? "Signature: Inspecting Officer" : "Signature: Reviewing Supervisor", { size: 17, color: HEX.inkSoft, spaceAfter: 20 }),
            body("Name: " + (i === 0 ? scan.inspector : "_______________________"), { size: 17, color: HEX.inkSoft, spaceAfter: 20 }),
            body("Date: _______________________", { size: 17, color: HEX.inkSoft, spaceAfter: 0 }),
          ],
        })),
      }),
    ],
  });
}

// Builds an editable Word-document version of the same field-inspection
// report downloadReport() (see ../pdf/caseReport.js) produces as a PDF —
// same content, same section order, same shared copy (reportContent.js) —
// so a supervisor who needs to annotate, retype a value, or attach it into
// another document isn't stuck with a flattened PDF. Triggers a browser
// download of the resulting .docx.
export async function downloadReportDocx(scan) {
  const children = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 20 },
      children: [new TextRun({ text: "LEGAL METROLOGY · FIELD COMPLIANCE ENFORCEMENT", size: 17, color: HEX.inkSoft })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [new TextRun({ text: "COMPLIANCE INSPECTION REPORT", bold: true, size: 34, color: HEX.navyDeep })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: HEX.brass, space: 8 } },
      children: [new TextRun({ text: "Issued under the Legal Metrology (Packaged Commodities) Rules, 2011", italics: true, size: 18, color: HEX.inkSoft })],
    }),
    new Paragraph({
      tabStops: [{ type: "right", position: 9600 }],
      spacing: { after: 160 },
      children: [
        new TextRun({ text: "Ref. No.: " + refNo(scan), size: 17, color: HEX.inkSoft }),
        new TextRun({ text: "\tDate: " + formatDate(todayLocalISO()), size: 17, color: HEX.inkSoft }),
      ],
    }),
    body("To: The Controller of Legal Metrology, " + scan.region + ".", { bold: true, spaceAfter: 40 }),
    body(subjectLine(scan), { spaceAfter: 160 }),
    body("Sir/Madam,", { spaceAfter: 120 }),
    body(narrativeSummary(scan), { spaceAfter: 200 }),
    labelValueTable(caseMetaPairs(scan)),
    new Paragraph({ spacing: { before: 200, after: 200 } }),
    new Paragraph({
      shading: { type: ShadingType.CLEAR, fill: "FFFFFF" },
      border: {
        top: { style: BorderStyle.SINGLE, size: 8, color: STATUS_COLOR[scan.status] },
        bottom: { style: BorderStyle.SINGLE, size: 8, color: STATUS_COLOR[scan.status] },
        left: { style: BorderStyle.SINGLE, size: 8, color: STATUS_COLOR[scan.status] },
        right: { style: BorderStyle.SINGLE, size: 8, color: STATUS_COLOR[scan.status] },
      },
      spacing: { before: 120, after: 120 },
      children: [new TextRun({ text: "  OVERALL VERDICT: " + STATUS_LABEL[scan.status], bold: true, size: 25, color: STATUS_COLOR[scan.status] })],
    }),
    heading("Statutory Basis"),
    ...bulletList(STATUTORY_BASIS),
  ];

  if (scan.status === "retake_needed") {
    children.push(
      heading("Declaration Verification"),
      body(
        "The declarations required under Rule 6 of the Legal Metrology (Packaged Commodities) Rules, 2011 could not be verified from the submitted image. The inspecting officer must obtain a legible photograph and re-submit before a compliance verdict can be recorded.",
        { spaceAfter: 120 }
      ),
      body("Reason for retake: " + (scan.retakeReason || "Not specified."), { bold: true, spaceAfter: 120 })
    );
  } else {
    children.push(heading("Declaration Verification"), declarationTable(scan), new Paragraph({ spacing: { after: 200 } }));

    const nonCompliantFields = scan.fields.filter((f) => f.status !== "compliant");
    if (nonCompliantFields.length > 0) {
      children.push(
        heading("Explanatory Notes"),
        ...bulletList(nonCompliantFields.map(explanatoryNote)),
        heading("Applicable Penal Provisions"),
        body(PENAL_PROVISIONS_INTRO, { spaceAfter: 120 }),
        ...bulletList(PENAL_PROVISIONS)
      );
    }

    // Bug fix (round 2): 320x420px was a small thumbnail box, and it forced
    // a tall/narrow back-panel photo down to an illegibly thin strip to
    // respect the height cap. The photo now gets its own page and a much
    // larger box (bounded by both width AND height via the same
    // fitWithinBox as the PDF export, so it still never distorts or
    // balloons off the page) so any product's photo renders at full,
    // readable size regardless of its aspect ratio.
    //
    // Bug fix (round 3): only the single main photo (scan.imageDataUrl) was
    // ever embedded — a scan with Side and/or Back evidence photos attached
    // had those captured and saved onto the case, but the report silently
    // dropped them, so only part of the package ever reached the document a
    // supervisor or regulator actually reads. renderPhoto() below is reused
    // for the main photo AND every additional angle.
    async function renderPhoto(headingText, introText, dataUrl) {
      if (dataUrl) children.push(new Paragraph({ pageBreakBefore: true, children: [] }));
      children.push(heading(headingText));
      if (dataUrl) {
        children.push(body(introText, { spaceAfter: 160 }));
        try {
          const base64 = dataUrl.split(",")[1];
          const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
          const dims = await imagePixelSize(dataUrl);
          const { width, height } = fitWithinBox(dims.width, dims.height, 600, 760);
          children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: bytes, transformation: { width, height }, type: "jpg" })] }));
        } catch (e) {
          children.push(body("(Photo could not be embedded in this export.)", { color: HEX.inkSoft, spaceAfter: 160 }));
        }
      } else {
        children.push(body("No photo is on file for this historical record: this case predates in-app image retention, or the record was entered without an attached photograph.", { color: HEX.inkSoft, spaceAfter: 160 }));
      }
    }

    await renderPhoto(
      "Photo Evidence",
      "The label photograph captured for this inspection is reproduced below in full as evidence, alongside its digital-integrity record.",
      scan.imageDataUrl
    );
    if (scan.additionalPhotos?.side) {
      await renderPhoto(
        "Additional Evidence — Side Panel",
        "A supplementary photograph of the package's side panel, captured alongside the main declaration photo, is reproduced below in full.",
        scan.additionalPhotos.side
      );
    }
    if (scan.additionalPhotos?.back) {
      await renderPhoto(
        "Additional Evidence — Back Panel",
        "A supplementary photograph of the package's back panel, captured alongside the main declaration photo, is reproduced below in full.",
        scan.additionalPhotos.back
      );
    }
  }

  // Bug fix: this used to print "hashed ... using SHA-256" unconditionally,
  // even when hashDataUrl() (src/lib/capture.js) had actually fallen back to
  // a much weaker non-cryptographic hash (SubtleCrypto unavailable) —
  // reports the algorithm actually recorded on this scan instead.
  const hashAlgorithm = scan.hashAlgorithm || "an unspecified algorithm (not recorded for this record)";
  children.push(
    heading("Digital Integrity Record"),
    body(`The image captured for this inspection was hashed at the time of scan using ${hashAlgorithm}. Any subsequent alteration of the image file would produce a different hash value, providing a basic tamper-evidence check for this record.`, { spaceAfter: 120 }),
    new Paragraph({
      shading: { type: ShadingType.CLEAR, fill: "EFEDE6" },
      spacing: { after: 40 },
      children: [new TextRun({ text: "Hash:  " + scan.hash, font: "Courier New", size: 17 })],
    }),
    new Paragraph({
      shading: { type: ShadingType.CLEAR, fill: "EFEDE6" },
      spacing: { after: 40 },
      children: [new TextRun({ text: "Captured:  " + formatDateTime(new Date(scan.timestamp)), font: "Courier New", size: 17 })],
    }),
    new Paragraph({
      shading: { type: ShadingType.CLEAR, fill: "EFEDE6" },
      spacing: { after: 200 },
      children: [new TextRun({ text: "Location:  " + scan.gps, font: "Courier New", size: 17 })],
    }),
    heading("Recommended Next Steps"),
    body(recommendedNextSteps(scan), { spaceAfter: 200 }),
    heading("Certification"),
    body(CERTIFICATION_TEXT, { spaceAfter: 200 }),
    signatureBlock(scan),
    body(CLOSING_LINE, { size: 17, color: HEX.inkSoft, spaceAfter: 200, }),
    new Paragraph({
      border: { top: { style: BorderStyle.SINGLE, size: 4, color: HEX.border, space: 8 } },
      children: [new TextRun({ text: DISCLAIMER, italics: true, size: 13, color: HEX.inkSoft })],
    })
  );

  const doc = new Document({ sections: [{ children }] });

  try {
    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `compliance-report-${scan.id}.docx`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    window.alert("Couldn't generate the Word report in this preview: " + ((e && e.message) || e));
  }
}

function imagePixelSize(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = dataUrl;
  });
}
