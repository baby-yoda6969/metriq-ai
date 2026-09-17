// Shared, format-agnostic report copy: every sentence a case report says,
// independent of whether it's being laid out as a PDF (see
// lib/pdf/caseReport.js) or a Word document (see lib/docx/caseReport.js).
// Pulled out so the two exports can never drift into saying different
// things about the same case — a fix or a wording change here reaches both.
import { RULE_CITATIONS, STATUTORY_BASIS } from "../data/citations.js";
import { formatDate, formatDateTime } from "./format.js";

export { STATUTORY_BASIS };

export const STATUS_LABEL = { compliant: "COMPLIANT", non_compliant: "NON-COMPLIANT", missing: "MISSING", retake_needed: "RETAKE REQUIRED" };

// One sentence of plain-language regulatory context per declaration, added
// alongside the AI-derived explanation in Explanatory Notes so a reader
// unfamiliar with the Rules understands why the declaration is required,
// not only that it failed.
export const REGULATORY_CONTEXT = {
  "Manufacturer / Packer / Importer Name & Address": "This declaration fixes legal accountability for the package: without it, a consumer or officer has no way to identify who is answerable for the goods.",
  "Net Quantity": "A net quantity declaration protects buyers from short-weighting or short-measure and lets quantity be verified against the price paid.",
  "Maximum Retail Price (incl. of all taxes)": "A single, tax-inclusive MRP prevents a seller from charging more than the declared ceiling or shifting undisclosed taxes onto the buyer at the till.",
  "Month & Year of Manufacture / Packing": "This date lets a buyer judge the freshness or shelf life of the commodity, and lets an officer trace a defective batch back to its production run.",
  "Consumer Care Details": "A working consumer care contact gives a buyer a route to raise a complaint or seek redress after the point of sale.",
};

export function refNo(scan) {
  return "LM/" + scan.region.replace(/\s+/g, "").toUpperCase() + "/" + scan.id;
}

export function subjectLine(scan) {
  return "Subject: Field inspection report on the packaged commodity “" + scan.brand + "”, " +
    (scan.status === "retake_needed" ? "attempted on " : "inspected on ") + formatDate(scan.date) + ".";
}

export function narrativeSummary(scan) {
  if (scan.status === "retake_needed") {
    return "The photograph submitted for the inspection of " + scan.brand + " (" + scan.category + "), attempted on " +
      formatDate(scan.date) + " at " + scan.region +
      ", could not be verified against the declarations required under Rule 6(1) of the Legal Metrology (Packaged Commodities) Rules, 2011. Re-inspection with a legible photograph is required before a compliance verdict can be recorded for this commodity.";
  }
  const compliantCount = scan.fields.filter((f) => f.status === "compliant").length;
  const shortfallCount = scan.fields.length - compliantCount;
  return "In the course of field inspection duties under the Legal Metrology (Packaged Commodities) Rules, 2011, the undersigned inspecting officer examined a sample of " +
    scan.brand + " (" + scan.category + ") on " + formatDate(scan.date) + " at " + scan.region + ". Of the " +
    scan.fields.length + " mandatory declarations required under Rule 6(1) of the said Rules, " + compliantCount +
    (compliantCount === 1 ? " was" : " were") + " found compliant and " + shortfallCount +
    (shortfallCount === 1 ? " was" : " were") +
    " found non-compliant or missing. The overall verdict recorded for this inspection is " +
    STATUS_LABEL[scan.status] + ". Full findings, statutory citations, and photographic evidence are set out below for record and such further action as may be necessary.";
}

export function explanatoryNote(field) {
  const citation = RULE_CITATIONS[field.name];
  const context = REGULATORY_CONTEXT[field.name];
  return `${field.name}${citation ? ` (${citation.rule})` : ""}: ${field.explanation}${context ? ` ${context}` : ""}`;
}

// Real first/second/third-offence compounding structure under Section
// 18(1) read with Section 36(1) of the Legal Metrology Act, 2009, as
// reproduced in the Indian Small Scale Paint Association's published
// guidance booklet on the Act and the 2011 Rules (a real industry
// compliance reference, not an invented schedule), consistent with this
// app's own STATUTORY_BASIS citation.
export const PENAL_PROVISIONS_INTRO = "Non-compliance with the declarations required under Rule 6(1) of the Legal Metrology (Packaged Commodities) Rules, 2011 is punishable under Section 18(1) read with Section 36(1) of the Legal Metrology Act, 2009. The offence is compoundable.";

export const PENAL_PROVISIONS = [
  "First offence: fine which may extend to Rs. 25,000, payable by the nominated compliance officer and the firm or company, as the case may be.",
  "Second offence: fine which may extend to Rs. 50,000.",
  "Third and subsequent offence: fine not less than Rs. 50,000, extending to Rs. 1,00,000, or imprisonment for a term which may extend to one year, or both.",
];

export function recommendedNextSteps(scan) {
  if (scan.status === "compliant") {
    return "No further action is required on the declarations examined. This report should be retained as part of the routine field-compliance record for this jurisdiction and produced if the sample is re-examined at a later date.";
  }
  if (scan.status === "retake_needed") {
    return "The inspecting officer should obtain a legible photograph of the same physical sample, covering the full Principal Display Panel, and re-submit it for verification. No compliance verdict has been recorded and no penal provision applies until re-inspection is complete.";
  }
  return "The inspecting officer should proceed under Section 18(1) read with Section 36(1) of the Legal Metrology Act, 2009 in respect of the non-compliant or missing declarations identified above, and may issue a hold notice on the sampled stock pending correction. Where a repeat violation by the same manufacturer, packer, or importer is suspected, this case should be referred to the jurisdictional Controller of Legal Metrology for further action.";
}

export const CERTIFICATION_TEXT = "I/We hereby certify that the observations recorded in this report are based on physical examination of the sample packaging and, where applicable, the photographic evidence annexed hereto, and are true and correct to the best of my/our knowledge and belief.";

export const CLOSING_LINE = "This report is submitted for information and necessary action.";

export const DISCLAIMER = "This report was produced by an AI-assisted screening tool as part of a Legal Metrology field-compliance pilot. Extracted values and rule citations are provided to support, not replace, the inspecting officer's judgment, and should be independently verified against the physical sample and the current gazetted Rules before reliance in any formal or legal proceeding.";

export function caseMetaPairs(scan) {
  return [
    ["Report / Case No.", scan.id],
    ["Report Generated", formatDateTime(new Date())],
    ["Brand / Trade Name", scan.brand],
    ["Category of Commodity", scan.category],
    ["Date of Inspection", formatDate(scan.date)],
    ["Region / Jurisdiction", scan.region],
    ["Inspecting Officer", scan.inspector],
    ["Report Status", STATUS_LABEL[scan.status]],
  ];
}

// Fits an image into a maxW x maxH box without distorting its aspect ratio
// (like CSS object-fit: contain) — shared by the PDF and Word exporters so
// neither can regress into the width-only sizing bug that let a portrait
// photo balloon past the page and strand its section heading on the page
// before it. `naturalWidth`/`naturalHeight` are the source image's actual
// pixel dimensions; the return value is in whatever unit maxW/maxH are.
export function fitWithinBox(naturalWidth, naturalHeight, maxW, maxH) {
  const ratio = naturalHeight / naturalWidth;
  if (maxW * ratio <= maxH) {
    return { width: maxW, height: maxW * ratio };
  }
  return { width: maxH / ratio, height: maxH };
}
