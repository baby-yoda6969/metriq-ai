import { useState, useMemo, useEffect, useRef, useCallback, Component } from "react";
import {
  Search, FileText,
  X, ChevronRight, AlertTriangle,
  LayoutDashboard, Download,
  Ban, ScrollText, CheckCircle2, Loader2,
  Flag, Gavel, PenLine, UserCheck,
  Link2, GaugeCircle,
  PlayCircle, ShoppingCart, Radar, Box
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from "recharts";
import { jsPDF } from "jspdf";
import { COLORS, FONTS, PDF_COLORS } from "./lib/theme.js";
import { useTheme } from "./lib/ThemeContext.jsx";
import { AppFrame, BottomNav } from "./components/AppShell.jsx";
import { Login } from "./screens/Login.jsx";
import { PullToScan } from "./components/PullToScan.jsx";
import { SplashScreen } from "./components/SplashScreen.jsx";
import { HomeView } from "./screens/HomeView.jsx";
import { CasesView } from "./screens/CasesView.jsx";
import { ProfileView } from "./screens/ProfileView.jsx";
import { RulesFeedView } from "./screens/RulesFeedView.jsx";
import { RuleAdminView } from "./screens/RuleAdminView.jsx";
import { ScanView } from "./screens/ScanView.jsx";
import { ThreeDCaptureModal } from "./screens/scan/modals.jsx";
import {
  ChainOfCustody, FieldRow, IntegrityBadge, RuleVersionBadge, Stamp, StatusIcon,
} from "./screens/scan/parts.jsx";
import { TickDivider } from "./components/TickDivider.jsx";
import { CATEGORIES, REGIONS } from "./data/fixtures.js";
import { hashSeed } from "./lib/hash.js";
import { formatDate, formatDateTime, monthLabel } from "./lib/format.js";
import { computeOverallStatus, GPS_BY_REGION } from "./lib/scanLogic.js";
import { downloadReport } from "./lib/pdf/caseReport.js";
import { downloadReportDocx } from "./lib/docx/caseReport.js";
import { useDismissOnBack } from "./lib/useDismissOnBack.js";
import { apiUrl, DEFAULT_3D_API_BASE } from "./lib/apiBase.js";
import {
  firebaseReady,
  firebaseSignOut,
  loadUserProfile,
  seedCloudIfEmpty,
  signInWithSession,
  subscribeRuleVersions,
  subscribeScans,
  subscribeUserSettings,
  upsertRuleVersion,
  upsertScan,
  upsertScans,
  upsertUserSettings,
  watchAuth,
} from "./lib/firebaseSync.js";

/* ---------------------------------------------------------------- */
/* shared hooks                                                       */
/* ---------------------------------------------------------------- */

// Locks background scroll while a modal is mounted — without this, the
// fixed-position scrim sits on top of the page but the page underneath
// keeps scrolling (mouse wheel, touch drag), which is disorienting and
// can leave the modal visually detached from what's behind it.
function useBodyScrollLock() {
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);
}

/* ---------------------------------------------------------------- */
/* constants                                                          */
/* ---------------------------------------------------------------- */

const REQUIRED_FIELDS = [
  "Manufacturer / Packer / Importer Name & Address",
  "Net Quantity",
  "Maximum Retail Price (incl. of all taxes)",
  "Month & Year of Manufacture / Packing",
  "Consumer Care Details",
];

// Rule Admin repository: each entry is a version of the rule engine's
// declaration ruleset, with the actual rule text snapshotted at that version
// so a later draft can be diffed against whichever version is "active".
// status: "published" (in force), "in_review" (awaiting human verification),
// "rejected" (sent back with reviewer comments), "draft" (being edited).
//
// Bug fix: each version's ruleText used to be built by taking the *latest*
// (v2.4) text and swapping out only its last line for that version's own
// amendment — so every older version's text was really "the current base
// rules plus this one line," not "everything published up to that point."
// The result: v2.2's "e-mail is an accepted alternative to a toll-free
// number" amendment never carried forward into v2.3/v2.4's text, even
// though the changelog UI shows v2.2 as still-published/in-force — so the
// currently-active version (index 0, per getActiveRuleVersion) silently
// dropped an amendment the app was actively advertising as live. Fixed by
// building each version's text cumulatively on top of the previous one, the
// way a real amendment history actually works.
const RULE_BASE_TEXT = [
  "Rule 6(1)(a): Manufacturer/Packer/Importer name and complete address, including PIN code, must be declared.",
  "Rule 6(1)(c) r/w Rule 5: Net quantity must be declared in standard metric units.",
  "Rule 6(1)(e) r/w Rule 18: MRP must be declared inclusive of all taxes, as a single fixed value (not a range).",
  "Rule 6(1)(d): Month and year of manufacture or packing must be declared.",
  "Rule 6(2): Consumer care contact (phone or e-mail) must be declared.",
].join("\n");

const RULE_TEXT_V2_1 = RULE_BASE_TEXT + "\n" +
  "Rule 26 (exemptions): Packages of 10g/10ml or less are exempt from declaration requirements, under review for Q3.";
const RULE_TEXT_V2_2 = RULE_TEXT_V2_1 + "\n" +
  "Rule 6(2) (consumer care): A consumer-care e-mail address is an accepted alternative to a toll-free number.";
const RULE_TEXT_V2_3 = RULE_TEXT_V2_2 + "\n" +
  "Rule 6(1)(e) (combo packs): Combo/bundle packs must show both the combined MRP and a legible per-unit MRP.";
const RULE_TEXT_V2_4 = RULE_TEXT_V2_3 + "\n" +
  "Rule 7 (font-size guidance): Numerals/letters on a Principal Display Panel up to 100 sq cm must use a minimum height of 1.5mm.";

const RULE_CHANGELOG = [
  {
    version: "v2.4", date: "2026-07-02", author: "Rule Admin",
    desc: "Tightened minimum font-size guidance for declarations on small Principal Display Panels (Rule 7).",
    status: "published", reviewerComments: "Matches the gazetted amendment text. Approved.",
    ruleText: RULE_TEXT_V2_4,
  },
  {
    version: "v2.3", date: "2026-05-18", author: "Rule Admin",
    desc: "Clarified that combo/bundle packs must show both the combined MRP and a legible per-unit MRP.",
    status: "published", reviewerComments: "Approved without changes.",
    ruleText: RULE_TEXT_V2_3,
  },
  {
    version: "v2.2", date: "2026-03-30", author: "Rule Admin",
    desc: "Added consumer-care e-mail as an accepted alternative to a toll-free number.",
    status: "published", reviewerComments: "Approved; aligns with the 2026 clarification circular.",
    ruleText: RULE_TEXT_V2_2,
  },
  {
    version: "v2.1", date: "2026-02-11", author: "Rule Admin",
    desc: "Extended exemption threshold review for sub-10g / 10ml sachets.",
    status: "published", reviewerComments: "Approved pending the Q3 exemption-threshold review.",
    ruleText: RULE_TEXT_V2_1,
  },
];

// Every seeded rule version is (correctly) status: "published" — "published"
// here means "was in force at some point," not "is the current one," so
// picking the active version by filtering on status alone is ambiguous the
// moment there's more than one. handlePublishRule always prepends the newest
// version (`[newVersion, ...prev]`), so index 0, not a status filter, is
// the actual, robust contract for "currently active." Centralized in
// src/lib/scanLogic.js so every consumer agrees on it instead of each
// re-deriving it with `.find`.

// The Rule Admin console (draft/review/publish, the structured clause
// catalog, version compare/rollback, and the "check for updates" flow) now
// lives in its own file — see ./screens/RuleAdminView.jsx and
// ./lib/ruleCatalog.js.

function buildFields(overrides = {}) {
  return REQUIRED_FIELDS.map((name) => {
    if (overrides[name]) {
      return { name, status: overrides[name].status, explanation: overrides[name].explanation, value: overrides[name].value ?? "N/A" };
    }
    return { name, status: "compliant", explanation: "Present and correctly formatted.", value: "N/A" };
  });
}

const SEED_DEFS = [
  { id: "s1", brand: "Lay's India", category: "Packaged Snacks", region: "Bengaluru", date: "2026-02-10", inspector: "R. Bhat" },
  { id: "s2", brand: "Amul (GCMMF)", category: "Dairy", region: "Bengaluru", date: "2026-02-22", inspector: "S. Iyer" },
  { id: "s3", brand: "Kurkure (PepsiCo)", category: "Packaged Snacks", region: "Chennai", date: "2026-03-05", inspector: "A. Kumar",
    overrides: { "Maximum Retail Price (incl. of all taxes)": { status: "non_compliant", explanation: "MRP printed without the required 'inclusive of all taxes' wording.", value: "Rs. 20" } } },
  { id: "s4", brand: "Nivea India", category: "Cosmetics & Personal Care", region: "Bengaluru", date: "2026-03-18", inspector: "M. Reddy",
    overrides: { "Manufacturer / Packer / Importer Name & Address": { status: "non_compliant", explanation: "Address given without pincode; incomplete under the rules.", value: "Nivea India Pvt. Ltd., Peenya Industrial Area" } } },
  { id: "s5", brand: "Mother Dairy", category: "Dairy", region: "Chennai", date: "2026-03-27", inspector: "R. Bhat" },
  { id: "s6", brand: "Haldiram's", category: "Packaged Snacks", region: "Hyderabad", date: "2026-04-08", inspector: "S. Iyer",
    overrides: { "Net Quantity": { status: "missing", explanation: "Net quantity declaration not found anywhere on the visible label.", value: null } } },
  { id: "s7", brand: "BigBasket", category: "E-commerce Grocery", region: "Bengaluru", date: "2026-04-19", inspector: "A. Kumar",
    overrides: { "Net Quantity": { status: "non_compliant", explanation: "Net quantity present but printed well below the required font-size threshold.", value: "180 g" } } },
  { id: "s8", brand: "Dove (Unilever)", category: "Cosmetics & Personal Care", region: "Chennai", date: "2026-05-02", inspector: "M. Reddy",
    overrides: { "Maximum Retail Price (incl. of all taxes)": { status: "non_compliant", explanation: "MRP shown as a range, not a single fixed price as required.", value: "Rs. 99–129" } } },
  { id: "s9", brand: "Amul (GCMMF)", category: "Dairy", region: "Hyderabad", date: "2026-05-14", inspector: "R. Bhat",
    overrides: { "Month & Year of Manufacture / Packing": { status: "missing", explanation: "Packing date not found on the label or the seal.", value: null } } },
  { id: "s10", brand: "Blinkit", category: "E-commerce Grocery", region: "Chennai", date: "2026-05-25", inspector: "S. Iyer" },
  { id: "s11", brand: "Lay's India", category: "Packaged Snacks", region: "Mumbai", date: "2026-06-03", inspector: "A. Kumar",
    overrides: { "Consumer Care Details": { status: "missing", explanation: "No phone number, email, or address for consumer complaints found.", value: null } } },
  { id: "s12", brand: "Nivea India", category: "Cosmetics & Personal Care", region: "Hyderabad", date: "2026-06-15", inspector: "M. Reddy" },
  { id: "s13", brand: "Mother Dairy", category: "Dairy", region: "Mumbai", date: "2026-06-28", inspector: "R. Bhat" },
  { id: "s14", brand: "Kurkure (PepsiCo)", category: "Packaged Snacks", region: "Bengaluru", date: "2026-07-09", inspector: "S. Iyer" },
  { id: "s15", brand: "Dove (Unilever)", category: "Cosmetics & Personal Care", region: "Mumbai", date: "2026-07-21", inspector: "A. Kumar",
    overrides: { "Consumer Care Details": { status: "non_compliant", explanation: "Only a general company website listed; no dedicated consumer-care contact.", value: "www.unileverdove.example" } } },
  { id: "s17", brand: "Blinkit", category: "E-commerce Grocery", region: "Hyderabad", date: "2026-08-12", inspector: "S. Iyer",
    overrides: { "Maximum Retail Price (incl. of all taxes)": { status: "non_compliant", explanation: "MRP block obscured by a promotional sticker covering the tax-inclusive wording.", value: "Rs. 65" } } },
];

const AVAILABLE_INSPECTORS = ["R. Bhat", "S. Iyer", "A. Kumar", "M. Reddy", "K. Nair", "P. Singh"];

const PENALTY_BANDS = [
  { id: "band_a", label: "Band A: Advisory warning", range: "No fine", desc: "First-time, minor formatting lapse (e.g. font size shortfall) with no consumer harm shown." },
  { id: "band_b", label: "Band B: Standard fine", range: "Rs. 5,000 – Rs. 10,000", desc: "Single missing or incorrect mandatory declaration; no prior violations on record for this brand." },
  { id: "band_c", label: "Band C: Enhanced fine", range: "Rs. 10,000 – Rs. 25,000", desc: "Multiple declarations missing, or a repeat violation by the same brand within 12 months." },
  { id: "band_d", label: "Band D: Referral for prosecution", range: "Statutory max + possible imprisonment", desc: "Deliberate misleading claim, MRP overcharging, or repeated non-compliance after a prior hold notice." },
];

const COMPARABLE_PENALTY_CASES = [
  { brand: "Kurkure (PepsiCo)", issue: "MRP without tax-inclusive wording", band: "Band B: Standard fine", amount: "Rs. 7,500" },
  { brand: "Dove (Unilever)", issue: "MRP shown as a range", band: "Band B: Standard fine", amount: "Rs. 8,000" },
  { brand: "Haldiram's", issue: "Net quantity missing entirely", band: "Band C: Enhanced fine", amount: "Rs. 15,000" },
];

const RETAKE_DEFS = [
  { id: "s16", brand: "BigBasket", category: "E-commerce Grocery", region: "Mumbai", date: "2026-08-01", inspector: "M. Reddy",
    retakeReason: "Photo taken at a steep angle with heavy glare across the MRP block." },
];

const FAKE_HASHES = [
  "8f2a1c9d4e6b0f317a5c9d2e1b4f6a80c3d5e7f91a2b4c6d8e0f1a3b5c7d9e0f",
  "3b7d1e9c5a2f4d6b8e0c1a3f5d7b9e2c4a6f8d0b2e4c6a8f0d2b4e6c8a0f2d4b",
  "d4f6a8c0e2b4d6f8a0c2e4b6d8f0a2c4e6b8d0f2a4c6e8b0d2f4a6c8e0b2d4f6",
  "1a3c5e7b9d0f2a4c6e8b0d2f4a6c8e0b2d4f6a8c0e2b4d6f8a0c2e4b6d8f0a2",
];

function seedScans() {
  const compliant = SEED_DEFS.map((d, i) => {
    const fields = buildFields(d.overrides);
    const status = fields.some((f) => f.status !== "compliant") ? "non_compliant" : "compliant";
    return {
      ...d, fields, status, retakeReason: null,
      hash: FAKE_HASHES[i % FAKE_HASHES.length],
      gps: GPS_BY_REGION[d.region],
      timestamp: d.date + "T10:00:00.000Z",
      imageDataUrl: null,
    };
  });
  const retakes = RETAKE_DEFS.map((d, i) => ({
    ...d, fields: [], status: "retake_needed",
    hash: FAKE_HASHES[i % FAKE_HASHES.length],
    gps: GPS_BY_REGION[d.region],
    timestamp: d.date + "T10:00:00.000Z",
    imageDataUrl: null,
  }));
  return [...compliant, ...retakes].sort((a, b) => (a.date < b.date ? 1 : -1));
}

/* ---------------------------------------------------------------- */
/* helpers                                                            */
/* ---------------------------------------------------------------- */

// Deterministic, brand-seeded fake batch/lot ledger — same brand always shows
// the same "history" within a session, without needing a real backend ledger.
function getBatchLedger(brand) {
  const seed = hashSeed(brand || "unknown");
  const rows = [];
  for (let i = 0; i < 3; i++) {
    const s = seed + i * 7919;
    const month = 1 + (s % 12);
    // Unsigned shift: `seed` (from hashSeed's `>>> 0`) can exceed 2^31, and a
    // plain `>>` coerces to a signed 32-bit int first, occasionally flipping
    // negative and producing an invalid "day" (hence an invalid date string).
    const day = 1 + ((s >>> 3) % 28);
    rows.push({
      batch: "B-" + (1000 + (s % 9000)),
      date: `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      units: 500 + (s % 4500),
      status: s % 11 === 0 ? "Recalled" : s % 5 === 0 ? "Under review" : "Distributed",
    });
  }
  return rows;
}

// Simulated risk score (0-99): a status-driven baseline plus a deterministic
// per-case variance so the same scan always shows the same score in a session.
function computeRiskScore(scan) {
  const base = scan.status === "compliant" ? 12 : scan.status === "retake_needed" ? 38 : 58;
  const variance = hashSeed(scan.id) % 30;
  return Math.min(97, base + variance);
}

function riskLevel(score) {
  if (score < 35) return "low";
  if (score < 65) return "medium";
  return "high";
}

// Hardcoded fleet of certified scales tracked for calibration — one per
// region, deliberately dated to straddle "overdue" and "due soon" relative
// to today so the widget always has something to flag in the demo.
const CALIBRATION_DEVICES = [
  { id: "SCALE-BLR-01", region: "Bengaluru", lastCalibrated: "2025-09-10", dueDate: "2026-09-10" },
  { id: "SCALE-CHN-01", region: "Chennai", lastCalibrated: "2026-03-01", dueDate: "2027-03-01" },
  { id: "SCALE-HYD-01", region: "Hyderabad", lastCalibrated: "2025-08-20", dueDate: "2026-08-20" },
  { id: "SCALE-MUM-01", region: "Mumbai", lastCalibrated: "2026-08-25", dueDate: "2026-09-25" },
];

function calibrationStatus(dueDate) {
  const diffDays = Math.round((new Date(dueDate + "T00:00:00") - new Date()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "overdue";
  if (diffDays <= 30) return "due_soon";
  return "ok";
}

// Hardcoded SKUs the (simulated) e-commerce monitor watches — reuses brands
// and categories already seeded elsewhere so a "flagged" listing slots
// straight into the existing brand scorecard / category benchmarks.
const TRACKED_SKUS = [
  { sku: "CRB-CHIPS-52G", brand: "Lay's India", category: "Packaged Snacks", platform: "Amazon.in" },
  { sku: "MFD-MILK-1L", brand: "Amul (GCMMF)", category: "Dairy", platform: "Blinkit" },
  { sku: "PGC-CREAM-50ML", brand: "Nivea India", category: "Cosmetics & Personal Care", platform: "Nykaa" },
  { sku: "QME-ATTA-1KG", brand: "BigBasket", category: "E-commerce Grocery", platform: "Amazon.in" },
];

const ECOMMERCE_DRIFT_TEMPLATES = [
  { field: "Maximum Retail Price (incl. of all taxes)", explanation: "Listing price differs from the last compliant snapshot, indicating possible MRP drift.", value: "See listing snapshot" },
  { field: "Net Quantity", explanation: "Declared net quantity on the listing image is smaller than the last compliant snapshot, indicating possible shrinkflation.", value: "See listing snapshot" },
  { field: "Consumer Care Details", explanation: "Consumer care contact was present in the last compliant snapshot but is missing from the current listing.", value: null },
];

// Simulates one "scheduled job run" of the e-commerce monitor picking a
// tracked SKU, comparing it to a fictitious last-compliant snapshot, and
// auto-creating a flagged case — reusing the exact scan shape every other
// view already knows how to render.
function generateEcommerceCase(sku) {
  const seed = hashSeed(sku.sku + Date.now() + Math.random());
  const template = ECOMMERCE_DRIFT_TEMPLATES[seed % ECOMMERCE_DRIFT_TEMPLATES.length];
  const overrides = { [template.field]: { status: "non_compliant", explanation: template.explanation, value: template.value } };
  const fields = buildFields(overrides);
  return {
    id: "ecm-" + Date.now() + "-" + (seed % 1000),
    brand: sku.brand,
    category: sku.category,
    region: REGIONS[seed % REGIONS.length],
    date: new Date().toISOString().slice(0, 10),
    inspector: "E-commerce Monitor (auto)",
    status: computeOverallStatus(fields),
    fields,
    retakeReason: null,
    hash: FAKE_HASHES[seed % FAKE_HASHES.length],
    gps: "Not applicable (online listing)",
    timestamp: new Date().toISOString(),
    imageDataUrl: null,
    source: "ecommerce_monitor",
    sku: sku.sku,
    platform: sku.platform,
  };
}

/* ---------------------------------------------------------------- */
/* small UI pieces                                                    */
/* ---------------------------------------------------------------- */


function RiskScoreBadge({ score, size = "normal" }) {
  const level = riskLevel(score);
  const label = { low: "Low risk", medium: "Medium risk", high: "High risk" }[level];
  return (
    <div className={"lm-risk-badge lm-risk-" + level + (size === "small" ? " lm-risk-small" : "")}>
      <GaugeCircle size={size === "small" ? 12 : 14} />
      <span className="lm-risk-score">{score}</span>
      <span className="lm-risk-label">{label}</span>
    </div>
  );
}

function SourceBadge({ scan, size = "normal" }) {
  if (scan.source !== "ecommerce_monitor") return null;
  return (
    <span className={"lm-source-badge" + (size === "small" ? " lm-source-badge-small" : "")} title={"Auto-flagged from " + (scan.platform || "an online listing")}>
      <ShoppingCart size={size === "small" ? 11 : 12} /> E-commerce Monitor
    </span>
  );
}

function BatchLedger({ brand }) {
  const rows = getBatchLedger(brand);
  return (
    <div className="lm-ledger">
      <div className="lm-ruleadmin-col-label"><Link2 size={13} /> Linked manufacturer/brand batch ledger</div>
      <div className="lm-table-wrap">
        <table className="lm-table">
          <thead><tr><th>Batch / Lot</th><th>Packed</th><th>Units distributed</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.batch}>
                <td>{r.batch}</td>
                <td>{formatDate(r.date)}</td>
                <td>{r.units.toLocaleString("en-IN")}</td>
                <td>{r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


/* ---------------------------------------------------------------- */
/* supervisor modals: escalate, assign, penalty band                  */
/* ---------------------------------------------------------------- */

function EscalateModal({ scan, onConfirm, onClose }) {
  useBodyScrollLock();
  useDismissOnBack(true, onClose);
  const [reason, setReason] = useState("");
  return (
    <div className="lm-modal-scrim" onClick={onClose}>
      <div className="lm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="lm-modal-head">
          <h3 className="lm-h3" style={{ margin: 0 }}>Escalate case</h3>
          <button className="lm-icon-btn" onClick={onClose}><X size={17} /></button>
        </div>
        <p className="lm-retake-reason" style={{ margin: "0 0 12px" }}>
          Escalate <strong>{scan.brand}</strong> ({formatDate(scan.date)}) to the jurisdictional Legal Metrology officer for formal action.
        </p>
        <div className="lm-form-row" style={{ alignItems: "flex-start" }}>
          <label style={{ paddingTop: 7 }}>Reason</label>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Repeat offender, warrants prosecution referral" />
        </div>
        <div className="lm-btn-row" style={{ justifyContent: "flex-start", marginTop: 8 }}>
          <button className="lm-btn lm-btn-primary" onClick={() => onConfirm(reason.trim() || "No reason given.")}>
            <Flag size={14} /> Confirm escalation
          </button>
          <button className="lm-btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function AssignModal({ scan, onConfirm, onClose }) {
  useBodyScrollLock();
  useDismissOnBack(true, onClose);
  const [picked, setPicked] = useState(scan.assignedTo || scan.inspector);
  return (
    <div className="lm-modal-scrim" onClick={onClose}>
      <div className="lm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="lm-modal-head">
          <h3 className="lm-h3" style={{ margin: 0 }}>Assign / reassign inspection</h3>
          <button className="lm-icon-btn" onClick={onClose}><X size={17} /></button>
        </div>
        <p className="lm-retake-reason" style={{ margin: "0 0 12px" }}>
          Currently on record: <strong>{scan.assignedTo || scan.inspector}</strong>
        </p>
        <div className="lm-assign-list">
          {AVAILABLE_INSPECTORS.map((name) => (
            <label key={name} className={"lm-assign-item" + (picked === name ? " lm-assign-item-active" : "")}>
              <input type="radio" name="assign-inspector" checked={picked === name} onChange={() => setPicked(name)} />
              {name}
            </label>
          ))}
        </div>
        <div className="lm-btn-row" style={{ justifyContent: "flex-start", marginTop: 12 }}>
          <button className="lm-btn lm-btn-primary" onClick={() => onConfirm(picked)}><UserCheck size={14} /> Confirm assignment</button>
          <button className="lm-btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function PenaltyModal({ scan, onConfirm, onClose }) {
  useBodyScrollLock();
  useDismissOnBack(true, onClose);
  const [picked, setPicked] = useState(scan.penaltyBand || PENALTY_BANDS[1].label);
  return (
    <div className="lm-modal-scrim" onClick={onClose}>
      <div className="lm-modal lm-modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="lm-modal-head">
          <h3 className="lm-h3" style={{ margin: 0 }}>Set penalty band</h3>
          <button className="lm-icon-btn" onClick={onClose}><X size={17} /></button>
        </div>
        <div className="lm-assign-list">
          {PENALTY_BANDS.map((b) => (
            <label key={b.id} className={"lm-assign-item" + (picked === b.label ? " lm-assign-item-active" : "")} style={{ alignItems: "flex-start" }}>
              <input type="radio" name="penalty-band" checked={picked === b.label} onChange={() => setPicked(b.label)} style={{ marginTop: 3 }} />
              <div>
                <div className="lm-field-name">{b.label} <span className="lm-field-value" style={{ margin: 0 }}>{b.range}</span></div>
                <div className="lm-field-explain">{b.desc}</div>
              </div>
            </label>
          ))}
        </div>

        <h3 className="lm-h3" style={{ marginTop: 20 }}>Comparable past cases</h3>
        <div className="lm-table-wrap">
          <table className="lm-table">
            <thead><tr><th>Brand</th><th>Issue</th><th>Band</th><th>Amount</th></tr></thead>
            <tbody>
              {COMPARABLE_PENALTY_CASES.map((c) => (
                <tr key={c.brand}><td>{c.brand}</td><td>{c.issue}</td><td>{c.band}</td><td>{c.amount}</td></tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="lm-btn-row" style={{ justifyContent: "flex-start", marginTop: 12 }}>
          <button className="lm-btn lm-btn-primary" onClick={() => onConfirm(picked)}><Gavel size={14} /> Confirm penalty band</button>
          <button className="lm-btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}


// Builds a jurisdiction-level summary PDF for a supervisor — the Dashboard
// equivalent of downloadReport() above, aggregating stats instead of
// reporting on a single case. Reuses the same header/heading/table visual
// language so both PDFs read as one document family.
function downloadDashboardReport(stats) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 18;
  const contentW = pageW - marginX * 2;
  let y = 0;

  function ensureSpace(needed) {
    if (y + needed > pageH - 22) { doc.addPage(); y = 18; }
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
  function table(cols, rows) {
    ensureSpace(9);
    let x = marginX;
    doc.setFillColor(239, 237, 230);
    doc.rect(marginX, y, contentW, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...PDF_COLORS.inkSoft);
    cols.forEach((c) => { doc.text(c.title.toUpperCase(), x + 1.5, y + 4.8); x += c.w; });
    y += 9;
    rows.forEach((row) => {
      ensureSpace(7);
      x = marginX;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(...PDF_COLORS.ink);
      row.forEach((cell, i) => { doc.text(String(cell), x + 1.5, y + 4.8); x += cols[i].w; });
      y += 7;
      doc.setDrawColor(...PDF_COLORS.border);
      doc.setLineWidth(0.2);
      doc.line(marginX, y, pageW - marginX, y);
    });
    y += 6;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...PDF_COLORS.inkSoft);
  doc.text("LEGAL METROLOGY · FIELD COMPLIANCE ENFORCEMENT", pageW / 2, 16, { align: "center" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(...PDF_COLORS.navyDeep);
  doc.text("JURISDICTION SUMMARY REPORT", pageW / 2, 25, { align: "center" });
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(...PDF_COLORS.inkSoft);
  doc.text("Supervisor dashboard export: " + formatDateTime(new Date()), pageW / 2, 31, { align: "center" });
  y = 37;
  rule(PDF_COLORS.brass, 0.8);
  y += 8;

  // ---- formal memo block ---------------------------------------------
  // Same reference/to/subject convention as the per-case report (see
  // caseReport.js), modeled on real Legal Metrology office correspondence
  // rather than an invented layout.
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...PDF_COLORS.inkSoft);
  doc.text("Ref. No.: LM/JURIS-SUMMARY/" + new Date().toISOString().slice(0, 10).replace(/-/g, ""), marginX, y);
  doc.text("Date: " + formatDate(new Date().toISOString().slice(0, 10)), pageW - marginX, y, { align: "right" });
  y += 7;
  paragraph("To: The Controller of Legal Metrology.", { bold: true, spaceAfter: 2 });
  paragraph("From: " + (stats.preparedBy || "Supervisor on duty") + ", Supervisor.", { bold: true, spaceAfter: 2 });
  paragraph("Subject: Jurisdiction-wide field-compliance summary report.", { spaceAfter: 4 });
  paragraph("Sir/Madam,", { spaceAfter: 3 });

  // ---- narrative summary -----------------------------------------------------
  const worstCategory = stats.byCategory.length
    ? stats.byCategory.reduce((worst, c) => {
        const rate = c.total ? c.nonCompliant / c.total : 0;
        const worstRate = worst.total ? worst.nonCompliant / worst.total : 0;
        return rate > worstRate ? c : worst;
      }, stats.byCategory[0])
    : null;
  const flaggedInspectors = stats.inspectorStats.filter((r) => r.biasFlag);
  paragraph(
    "This report summarizes field-compliance activity across the jurisdiction as of " + formatDate(new Date().toISOString().slice(0, 10)) +
      ". A total of " + stats.totalScans + " inspections have been recorded across " + stats.categoryCount +
      " commodity categories, with an overall non-compliance rate of " + stats.nonCompliantRate +
      "% and a retake rate of " + stats.retakeRate + "%, indicating the proportion of inspections where the submitted photograph could not be verified." +
      (worstCategory ? " The category with the highest non-compliance rate is " + worstCategory.category + "." : "") +
      (flaggedInspectors.length > 0
        ? " " + flaggedInspectors.length + (flaggedInspectors.length === 1 ? " inspector has" : " inspectors have") +
          " been flagged for a non-compliance rate significantly above the jurisdiction average and " +
          (flaggedInspectors.length === 1 ? "is" : "are") + " recommended for a targeting-bias review."
        : " No inspector has been flagged for a targeting-bias review at this time."),
    { spaceAfter: 4 }
  );

  heading("Headline Metrics");
  table(
    [{ title: "Metric", w: contentW * 0.6 }, { title: "Value", w: contentW * 0.4 }],
    [
      ["Total scans", stats.totalScans],
      ["Non-compliance rate", stats.nonCompliantRate + "%"],
      ["Retake rate", stats.retakeRate + "%"],
      ["Categories tracked", stats.categoryCount],
    ]
  );

  heading("Category Compliance Benchmark");
  table(
    [{ title: "Category", w: contentW * 0.5 }, { title: "Scans", w: contentW * 0.2 }, { title: "Non-compliance rate", w: contentW * 0.3 }],
    stats.byCategory.map((c) => [c.category, c.total, (c.total ? Math.round((c.nonCompliant / c.total) * 100) : 0) + "%"])
  );
  if (worstCategory) {
    paragraph(
      "Of the categories tracked, " + worstCategory.category + " shows the highest non-compliance rate and should be prioritized for follow-up sampling in the coming inspection cycle.",
      { size: 8.5, color: PDF_COLORS.inkSoft, spaceAfter: 4 }
    );
  }

  heading("Brand Scorecard (Top Non-Compliant)");
  table(
    [{ title: "Brand", w: contentW * 0.4 }, { title: "Scans", w: contentW * 0.2 }, { title: "Non-compliant", w: contentW * 0.2 }, { title: "Rate", w: contentW * 0.2 }],
    stats.brands.map((b) => [b.brand, b.total, b.nonCompliant, Math.round((b.nonCompliant / b.total) * 100) + "%"])
  );
  if (stats.brands.length > 0) {
    const worstBrand = stats.brands[0];
    paragraph(
      worstBrand.brand + " has recorded the highest number of non-compliant declarations among the brands tracked this period and warrants continued monitoring.",
      { size: 8.5, color: PDF_COLORS.inkSoft, spaceAfter: 4 }
    );
  }

  heading("Inspector Caseload & Targeting-Bias Review");
  table(
    [{ title: "Inspector", w: contentW * 0.35 }, { title: "Cases", w: contentW * 0.2 }, { title: "Flagged rate", w: contentW * 0.2 }, { title: "Bias flag", w: contentW * 0.25 }],
    stats.inspectorStats.map((r) => [r.inspector, r.total, r.rate + "%", r.biasFlag ? "REVIEW" : "N/A"])
  );
  paragraph(
    flaggedInspectors.length > 0
      ? "The following inspector(s) recorded a flagged rate materially above the jurisdiction average and should be reviewed to confirm inspections are being sampled fairly rather than concentrated on particular brands or premises: " +
        flaggedInspectors.map((r) => r.inspector).join(", ") + "."
      : "No inspector's flagged rate currently exceeds the jurisdiction average by a margin that would warrant a targeting-bias review.",
    { size: 8.5, color: PDF_COLORS.inkSoft, spaceAfter: 4 }
  );

  heading("Equipment Calibration Status");
  table(
    [{ title: "Device", w: contentW * 0.3 }, { title: "Region", w: contentW * 0.2 }, { title: "Due date", w: contentW * 0.25 }, { title: "Status", w: contentW * 0.25 }],
    stats.calibrationDevices.map((d) => [d.id, d.region, formatDate(d.dueDate), calibrationStatus(d.dueDate).replace("_", " ").toUpperCase()])
  );
  const overdueDevices = stats.calibrationDevices.filter((d) => calibrationStatus(d.dueDate) === "overdue");
  const dueSoonDevices = stats.calibrationDevices.filter((d) => calibrationStatus(d.dueDate) === "due_soon");
  paragraph(
    overdueDevices.length > 0
      ? overdueDevices.length + " device(s) are overdue for calibration and should not be relied upon for a certified weighment until re-verified." +
        (dueSoonDevices.length > 0 ? " A further " + dueSoonDevices.length + " device(s) fall due within 30 days." : "")
      : (dueSoonDevices.length > 0
          ? dueSoonDevices.length + " device(s) fall due for calibration within 30 days and should be scheduled for re-verification."
          : "All listed equipment is within its current calibration period."),
    { size: 8.5, color: PDF_COLORS.inkSoft, spaceAfter: 4 }
  );

  // ---- recommended action -----------------------------------------------------
  heading("Recommended Action");
  paragraph(
    "It is recommended that follow-up inspections be scheduled for the category and brand identified above as showing the highest non-compliance, that any flagged inspector's caseload be reviewed for sampling fairness, and that overdue calibration equipment be re-verified before further use. This summary is submitted for information and necessary action.",
    { spaceAfter: 4 }
  );
  ensureSpace(24);
  const sigW = contentW / 2 - 5;
  doc.setDrawColor(...PDF_COLORS.inkSoft);
  doc.setLineWidth(0.3);
  doc.line(marginX, y + 16, marginX + sigW, y + 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...PDF_COLORS.inkSoft);
  doc.text("Signature: Reviewing Supervisor", marginX, y + 20);
  doc.text("Date: _______________________", marginX, y + 25);
  y += 30;

  const disclaimer = "This jurisdiction summary is produced by an AI-assisted screening tool as part of a Legal Metrology field-compliance pilot, aggregating field-compliance data across the jurisdiction. It is intended to support, not replace, supervisory judgment.";
  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(...PDF_COLORS.border);
    doc.setLineWidth(0.2);
    doc.line(marginX, pageH - 18, pageW - marginX, pageH - 18);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(6.8);
    doc.setTextColor(...PDF_COLORS.inkSoft);
    doc.text(doc.splitTextToSize(disclaimer, contentW), marginX, pageH - 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(`Page ${p} of ${totalPages}`, pageW - marginX, pageH - 6, { align: "right" });
  }

  try {
    doc.save(`jurisdiction-summary-${new Date().toISOString().slice(0, 10)}.pdf`);
  } catch (e) {
    window.alert("Couldn't generate the PDF report in this preview: " + ((e && e.message) || e));
  }
}


/* ---------------------------------------------------------------- */
/* history / repository                                               */
/* ---------------------------------------------------------------- */

function HistoryView({ scans, onSelect }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = scans.filter((s) => {
    const matchesQuery = (s.brand + " " + s.category + " " + s.region).toLowerCase().includes(query.toLowerCase());
    const matchesStatus = statusFilter === "all" || s.status === statusFilter;
    return matchesQuery && matchesStatus;
  });

  return (
    <div className="lm-panel">
      <div className="lm-eyebrow">Repository</div>
      <h2 className="lm-h2">Scan history</h2>
      <TickDivider />
      <div className="lm-history-controls">
        <div className="lm-search">
          <Search size={15} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search brand, category, or region" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="compliant">Compliant</option>
          <option value="non_compliant">Non-compliant</option>
          <option value="retake_needed">Retake needed</option>
        </select>
      </div>
      <div className="lm-table-wrap">
        <table className="lm-table">
          <thead>
            <tr><th>Status</th><th>Brand</th><th>Category</th><th>Region</th><th>Date</th><th>Inspector</th><th>Risk</th><th></th></tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.id} className="lm-row-click" onClick={() => onSelect(s)}>
                <td><StatusIcon status={s.status} /></td>
                <td>
                  {s.brand}
                  {s.source === "ecommerce_monitor" && <div style={{ marginTop: 4 }}><SourceBadge scan={s} size="small" /></div>}
                </td>
                <td>{s.category}</td>
                <td>{s.region}</td>
                <td>{formatDate(s.date)}</td>
                <td>{s.inspector}</td>
                <td><RiskScoreBadge score={computeRiskScore(s)} size="small" /></td>
                <td><ChevronRight size={15} color="var(--ink-soft)" /></td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="lm-empty">No scans match this search.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* dashboard                                                          */
/* ---------------------------------------------------------------- */

function DashboardView({ scans, onSelect, onRunMonitor, supervisorName = "Supervisor on duty" }) {
  const ecommerceFlaggedCount = scans.filter((s) => s.source === "ecommerce_monitor").length;
  const [monitorRunning, setMonitorRunning] = useState(false);
  const [lastRunLabel, setLastRunLabel] = useState(null);

  function handleRunNow() {
    setMonitorRunning(true);
    setTimeout(() => {
      const count = 1 + Math.round(Math.random());
      const shuffled = [...TRACKED_SKUS].sort(() => Math.random() - 0.5).slice(0, count);
      const newCases = shuffled.map(generateEcommerceCase);
      onRunMonitor(newCases);
      setLastRunLabel(`${formatDateTime(new Date())}: ${newCases.length} case${newCases.length === 1 ? "" : "s"} flagged`);
      setMonitorRunning(false);
    }, 900);
  }

  const monthly = useMemo(() => {
    const map = {};
    scans.forEach((s) => {
      const m = monthLabel(s.date);
      if (!map[m]) map[m] = { month: m, compliant: 0, non_compliant: 0, retake_needed: 0, order: s.date.slice(0, 7) };
      map[m][s.status] += 1;
    });
    return Object.values(map).sort((a, b) => (a.order < b.order ? -1 : 1));
  }, [scans]);

  const byCategory = useMemo(() => {
    const map = {};
    CATEGORIES.forEach((c) => (map[c] = { category: c, total: 0, nonCompliant: 0 }));
    scans.forEach((s) => {
      if (s.status === "retake_needed") return;
      map[s.category].total += 1;
      if (s.status === "non_compliant") map[s.category].nonCompliant += 1;
    });
    return Object.values(map);
  }, [scans]);

  const heatmap = useMemo(() => {
    const cell = {};
    CATEGORIES.forEach((c) => {
      cell[c] = {};
      REGIONS.forEach((r) => (cell[c][r] = { total: 0, nonCompliant: 0 }));
    });
    scans.forEach((s) => {
      if (s.status === "retake_needed") return;
      cell[s.category][s.region].total += 1;
      if (s.status === "non_compliant") cell[s.category][s.region].nonCompliant += 1;
    });
    return cell;
  }, [scans]);

  const brands = useMemo(() => {
    const map = {};
    scans.forEach((s) => {
      if (s.status === "retake_needed") return;
      if (!map[s.brand]) map[s.brand] = { brand: s.brand, total: 0, nonCompliant: 0 };
      map[s.brand].total += 1;
      if (s.status === "non_compliant") map[s.brand].nonCompliant += 1;
    });
    return Object.values(map).sort((a, b) => b.nonCompliant / b.total - a.nonCompliant / a.total).slice(0, 6);
  }, [scans]);

  const inspectorStats = useMemo(() => {
    const map = {};
    scans.forEach((s) => {
      if (!map[s.inspector]) map[s.inspector] = { inspector: s.inspector, total: 0, nonCompliant: 0 };
      map[s.inspector].total += 1;
      if (s.status === "non_compliant") map[s.inspector].nonCompliant += 1;
    });
    const rows = Object.values(map).map((r) => ({ ...r, rate: r.total ? Math.round((r.nonCompliant / r.total) * 100) : 0 }));
    const avgRate = rows.length ? rows.reduce((sum, r) => sum + r.rate, 0) / rows.length : 0;
    // Flag an inspector whose flagged-violation rate runs well above the
    // team average — a rough "targeting bias" signal, not a statistically
    // rigorous test.
    return rows
      .map((r) => ({ ...r, biasFlag: r.total >= 3 && r.rate > avgRate + 20 }))
      .sort((a, b) => b.total - a.total);
  }, [scans]);

  const scored = scans.filter((s) => s.status !== "retake_needed");
  const totalScans = scans.length;
  const nonCompliantCount = scored.filter((s) => s.status === "non_compliant").length;
  const retakeCount = scans.filter((s) => s.status === "retake_needed").length;
  const nonCompliantRate = scored.length ? Math.round((nonCompliantCount / scored.length) * 100) : 0;
  const retakeRate = totalScans ? Math.round((retakeCount / totalScans) * 100) : 0;

  function heatColor(pct) {
    if (pct === null) return "var(--panel-alt)";
    if (pct === 0) return "var(--green-soft)";
    if (pct < 30) return "#F3DCC8";
    if (pct < 60) return "#EFC09B";
    return "var(--red-soft)";
  }

  // Refs for the jump-nav below: each button scrolls its section into view
  // rather than using URL hash anchors, so the browser's back button (wired
  // up elsewhere to dismiss modals) is never affected by dashboard navigation.
  const overviewRef = useRef(null);
  const trendsRef = useRef(null);
  const accountabilityRef = useRef(null);
  const operationsRef = useRef(null);
  const scrollToSection = (ref) => ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="lm-panel lm-panel-wide">
      <div className="lm-eyebrow">Supervisor</div>
      <h2 className="lm-h2">Enforcement dashboard</h2>
      <TickDivider />

      <nav className="lm-dash-jumpnav">
        <button type="button" className="lm-dash-jump-btn" onClick={() => scrollToSection(overviewRef)}><LayoutDashboard size={13} /> Overview</button>
        <button type="button" className="lm-dash-jump-btn" onClick={() => scrollToSection(trendsRef)}><GaugeCircle size={13} /> Trends &amp; risk</button>
        <button type="button" className="lm-dash-jump-btn" onClick={() => scrollToSection(accountabilityRef)}><UserCheck size={13} /> Accountability</button>
        <button type="button" className="lm-dash-jump-btn" onClick={() => scrollToSection(operationsRef)}><Radar size={13} /> Operations</button>
      </nav>

      <section ref={overviewRef} className="lm-dash-section">
        <div className="lm-dash-section-head"><LayoutDashboard size={13} /><h3>Overview</h3></div>
        <div className="lm-kpi-grid">
          <div className="lm-kpi"><div className="lm-kpi-label">Total scans</div><div className="lm-kpi-value">{totalScans}</div></div>
          <div className={"lm-kpi" + (nonCompliantRate >= 30 ? " lm-kpi-flag" : "")}><div className="lm-kpi-label">Non-compliance rate</div><div className="lm-kpi-value">{nonCompliantRate}%</div></div>
          <div className={"lm-kpi" + (retakeRate >= 20 ? " lm-kpi-flag" : "")}><div className="lm-kpi-label">Retake rate</div><div className="lm-kpi-value">{retakeRate}%</div></div>
          <div className="lm-kpi"><div className="lm-kpi-label">Categories tracked</div><div className="lm-kpi-value">{CATEGORIES.length}</div></div>
          <div className="lm-kpi"><div className="lm-kpi-label">E-commerce flagged</div><div className="lm-kpi-value">{ecommerceFlaggedCount}</div></div>
        </div>
      </section>

      <section ref={trendsRef} className="lm-dash-section">
        <div className="lm-dash-section-head"><GaugeCircle size={13} /><h3>Trends &amp; risk</h3></div>

        <h3 className="lm-h3">Violations over time</h3>
        <div className="lm-chart">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: "var(--ink-soft)" }} />
              <YAxis tick={{ fontSize: 12, fill: "var(--ink-soft)" }} allowDecimals={false} />
              <Tooltip contentStyle={{ fontFamily: "var(--font-body)", fontSize: 12, borderRadius: 4 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="compliant" stackId="a" name="Compliant" fill="var(--green)" />
              <Bar dataKey="non_compliant" stackId="a" name="Non-compliant" fill="var(--red)" />
              <Bar dataKey="retake_needed" stackId="a" name="Retake needed" fill="var(--brass)" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <h3 className="lm-h3">Category compliance benchmark <span className="lm-h3-note">(non-compliance rate by product category)</span></h3>
        <div className="lm-table-wrap">
          <table className="lm-table">
            <thead><tr><th>Category</th><th>Scans</th><th>Non-compliance rate</th></tr></thead>
            <tbody>
              {byCategory.map((c) => (
                <tr key={c.category}>
                  <td>{c.category}</td>
                  <td>{c.total}</td>
                  <td>{c.total ? Math.round((c.nonCompliant / c.total) * 100) : 0}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 className="lm-h3">Risk heatmap <span className="lm-h3-note">(category × region, non-compliance rate)</span></h3>
        <div className="lm-heatmap">
          <div className="lm-heatmap-row lm-heatmap-header">
            <div></div>
            {REGIONS.map((r) => <div key={r} className="lm-heatmap-col-label">{r}</div>)}
          </div>
          {CATEGORIES.map((c) => (
            <div className="lm-heatmap-row" key={c}>
              <div className="lm-heatmap-row-label">{c}</div>
              {REGIONS.map((r) => {
                const cell = heatmap[c][r];
                const pct = cell.total ? Math.round((cell.nonCompliant / cell.total) * 100) : null;
                return (
                  <div key={r} className="lm-heatmap-cell" style={{ background: heatColor(pct) }} title={cell.total ? `${pct}% non-compliant (${cell.total} scans)` : "No scans"}>
                    {pct === null ? "N/A" : pct + "%"}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </section>

      <section ref={accountabilityRef} className="lm-dash-section">
        <div className="lm-dash-section-head"><UserCheck size={13} /><h3>Accountability</h3></div>

        <h3 className="lm-h3">Brand scorecard <span className="lm-h3-note">(top brands by non-compliance rate)</span></h3>
        <div className="lm-table-wrap">
          <table className="lm-table">
            <thead><tr><th>Brand</th><th>Scans</th><th>Non-compliant</th><th>Rate</th></tr></thead>
            <tbody>
              {brands.map((b) => (
                <tr key={b.brand}>
                  <td>{b.brand}</td>
                  <td>{b.total}</td>
                  <td>{b.nonCompliant}</td>
                  <td>{Math.round((b.nonCompliant / b.total) * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 className="lm-h3">Inspector caseload <span className="lm-h3-note">(targeting-bias review)</span></h3>
        <div className="lm-table-wrap">
          <table className="lm-table">
            <thead><tr><th>Inspector</th><th>Cases</th><th>Flagged rate</th><th></th></tr></thead>
            <tbody>
              {inspectorStats.map((r) => (
                <tr key={r.inspector}>
                  <td>{r.inspector}</td>
                  <td>{r.total}</td>
                  <td>{r.rate}%</td>
                  <td>
                    {r.biasFlag && (
                      <span className="lm-bias-flag"><AlertTriangle size={12} /> Review: well above team average</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section ref={operationsRef} className="lm-dash-section">
        <div className="lm-dash-section-head"><Radar size={13} /><h3>Operations</h3></div>

        <h3 className="lm-h3">Equipment calibration status <span className="lm-h3-note">(scale calibration due dates by region)</span></h3>
        <div className="lm-table-wrap">
          <table className="lm-table">
            <thead><tr><th>Device</th><th>Region</th><th>Last calibrated</th><th>Due date</th><th>Status</th></tr></thead>
            <tbody>
              {CALIBRATION_DEVICES.map((d) => {
                const status = calibrationStatus(d.dueDate);
                return (
                  <tr key={d.id}>
                    <td>{d.id}</td>
                    <td>{d.region}</td>
                    <td>{formatDate(d.lastCalibrated)}</td>
                    <td>{formatDate(d.dueDate)}</td>
                    <td><span className={"lm-calib-badge lm-calib-" + status}>{status.replace("_", " ")}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <h3 className="lm-h3">E-commerce monitor <span className="lm-h3-note">(scheduled listing scan)</span></h3>
        <div className="lm-ecom-panel">
          <div className="lm-btn-row" style={{ justifyContent: "flex-start" }}>
            <button className="lm-btn lm-btn-primary" onClick={handleRunNow} disabled={monitorRunning}>
              {monitorRunning ? <Loader2 className="lm-spin" size={15} /> : <PlayCircle size={15} />}
              {monitorRunning ? "Scanning listings…" : "Run now"}
            </button>
            <span className="lm-ecom-status">
              {lastRunLabel ? <>Last run: {lastRunLabel}</> : "Not run yet this session. Scans tracked SKUs for MRP/quantity drift against the last compliant snapshot."}
            </span>
          </div>
          <div className="lm-ecom-skus">
            <div className="lm-ruleadmin-col-label"><Radar size={13} /> Tracked SKUs</div>
            <div className="lm-ecom-sku-list">
              {TRACKED_SKUS.map((s) => (
                <div key={s.sku} className="lm-ecom-sku-row">
                  <span className="lm-ecom-sku-code">{s.sku}</span>
                  <span className="lm-ecom-sku-brand">{s.brand}</span>
                  <span className="lm-ecom-sku-platform">{s.platform}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <button
        className="lm-btn lm-btn-primary"
        style={{ marginTop: 4 }}
        onClick={() => downloadDashboardReport({
          totalScans, nonCompliantRate, retakeRate, categoryCount: CATEGORIES.length,
          byCategory, brands, inspectorStats, calibrationDevices: CALIBRATION_DEVICES,
          preparedBy: supervisorName,
        })}
      >
        <Download size={15} /> Export jurisdiction report
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* rules modal + case detail                                          */
/* ---------------------------------------------------------------- */

function RulesModal({ onClose, ruleVersions }) {
  useBodyScrollLock();
  useDismissOnBack(true, onClose);
  const published = ruleVersions.filter((r) => r.status === "published");
  return (
    <div className="lm-modal-scrim" onClick={onClose}>
      <div className="lm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="lm-modal-head">
          <h3 className="lm-h3" style={{ margin: 0 }}>Rule amendments</h3>
          <button className="lm-icon-btn" onClick={onClose}><X size={17} /></button>
        </div>
        <div className="lm-changelog">
          {published.map((r, i) => (
            <div key={r.version} className="lm-changelog-item">
              <div className="lm-changelog-top">
                <span className="lm-changelog-version">{r.version}</span>
                {i === 0 && <span className="lm-changelog-new">NEW</span>}
                <span className="lm-changelog-date">{formatDate(r.date)}</span>
                <span className="lm-changelog-approved"><CheckCircle2 size={12} /> Human-verified</span>
              </div>
              <div className="lm-changelog-desc">{r.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CaseDetail({ scan, onClose, role, onEscalate, onAssign, onSetPenalty, onUpdateScan }) {
  useBodyScrollLock();
  useDismissOnBack(true, onClose);
  const [escalateOpen, setEscalateOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [penaltyOpen, setPenaltyOpen] = useState(false);
  const [threeDOpen, setThreeDOpen] = useState(false);

  return (
    <>
    <div className="lm-modal-scrim" onClick={onClose}>
      <div className="lm-modal lm-modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="lm-modal-head">
          <h3 className="lm-h3" style={{ margin: 0 }}>{scan.brand}</h3>
          <button className="lm-icon-btn" onClick={onClose}><X size={17} /></button>
        </div>
        <div className="lm-case-meta">
          <span>{scan.category}</span><span>·</span><span>{scan.region}</span><span>·</span>
          <span>{formatDate(scan.date)}</span><span>·</span><span>{scan.assignedTo || scan.inspector}</span>
          {scan.source === "ecommerce_monitor" && <><span>·</span><SourceBadge scan={scan} /></>}
        </div>
        <div className="lm-btn-row" style={{ justifyContent: "flex-start", margin: "0 0 12px" }}>
          <Stamp status={scan.status} />
          <RiskScoreBadge score={computeRiskScore(scan)} />
        </div>
        {scan.source === "ecommerce_monitor" ? (
          <div className="lm-no-image"><ShoppingCart size={18} /> Auto-flagged from an online listing ({scan.platform}); no physical sample photo.</div>
        ) : scan.imageDataUrl ? (
          <img src={scan.imageDataUrl} alt={scan.brand + " label"} className="lm-preview" style={{ marginTop: 12 }} />
        ) : (
          <div className="lm-no-image"><FileText size={18} /> Historical record: no image on file</div>
        )}
        {scan.status === "retake_needed" ? (
          <p className="lm-retake-reason">{scan.retakeReason}</p>
        ) : (
          <>
            <div className="lm-fields">
              {scan.fields.map((f) => (
                <FieldRow key={f.name} field={f} correction={scan.fieldCorrections?.[f.name]} />
              ))}
            </div>
            {scan.fieldCorrections && Object.keys(scan.fieldCorrections).length > 0 && (
              <div className="lm-corrections-audit">
                <div className="lm-ruleadmin-col-label"><PenLine size={13} /> Field correction audit trail</div>
                {Object.values(scan.fieldCorrections).map((c) => (
                  <div key={c.fieldName} className="lm-correction-row">
                    <img src={c.photoDataUrl} alt={"Evidence for " + c.fieldName} className="lm-correction-thumb" />
                    <div>
                      <div className="lm-field-name">{c.fieldName}</div>
                      <div className="lm-field-explain">“{c.originalValue ?? "not set"}” → “{c.correctedValue}”</div>
                      <div className="lm-field-explain">By {c.correctedBy} · {formatDateTime(new Date(c.correctedAt))}</div>
                      {c.verification?.plausible === false && (
                        <div className="lm-field-correction" style={{ color: "var(--red)", background: "var(--red-soft)" }}>
                          <AlertTriangle size={12} /> AI could not confirm the evidence photo supports this correction. Flagged for supervisor review. {c.verification.note}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        <IntegrityBadge scan={scan} />
        <RuleVersionBadge version={scan.ruleVersionUsed} style={{ marginBottom: 12 }} />

        {scan.status !== "retake_needed" && scan.source !== "ecommerce_monitor" && (
          <ChainOfCustody sampleId={scan.sampleId || ("SMP-" + scan.hash.slice(0, 8).toUpperCase())} />
        )}
        {scan.status !== "retake_needed" && <BatchLedger brand={scan.brand} />}

        {(scan.violationConfirmed || scan.violationDisputed || scan.escalated || scan.assignedTo || scan.penaltyBand) && (
          <div className="lm-case-status-badges">
            {scan.violationConfirmed && (
              <div className="lm-decision-badge lm-decision-confirmed">
                <CheckCircle2 size={13} /> Violation confirmed by inspector
                {scan.holdNoticeId && <span> · Hold notice {scan.holdNoticeId} issued</span>}
              </div>
            )}
            {scan.violationDisputed && <div className="lm-decision-badge lm-decision-disputed"><Ban size={13} /> Disputed by inspector: “{scan.disputeNote}”</div>}
            {scan.escalated && <div className="lm-decision-badge lm-decision-disputed"><Flag size={13} /> Escalated: “{scan.escalationReason}”</div>}
            {scan.assignedTo && <div className="lm-decision-badge lm-decision-confirmed"><UserCheck size={13} /> Reassigned to {scan.assignedTo}</div>}
            {scan.penaltyBand && <div className="lm-decision-badge lm-decision-confirmed"><Gavel size={13} /> Penalty: {scan.penaltyBand}</div>}
          </div>
        )}

        <div className="lm-btn-row" style={{ justifyContent: "flex-start", marginTop: 14 }}>
          <button className="lm-btn" onClick={() => downloadReport(scan)}><Download size={14} /> Download report (PDF)</button>
          <button className="lm-btn" onClick={() => downloadReportDocx(scan)}><FileText size={14} /> Download report (Word)</button>
          {scan.status !== "retake_needed" && scan.source !== "ecommerce_monitor" && (
            <button
              type="button"
              className="lm-btn"
              onClick={() => setThreeDOpen(true)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                borderRadius: 999,
                border: "1px solid var(--mq-border)",
                background: "var(--mq-panel)",
                color: "var(--mq-ink)",
                padding: "10px 16px",
              }}
            >
              <Box size={14} style={{ color: "var(--mq-brass)" }} /> Capture six sides · 3D
            </button>
          )}
          {role === "supervisor" && (
            <>
              <button className="lm-btn" onClick={() => setEscalateOpen(true)}><Flag size={14} /> Escalate</button>
              <button className="lm-btn" onClick={() => setAssignOpen(true)}><UserCheck size={14} /> Assign / reassign</button>
              <button className="lm-btn" onClick={() => setPenaltyOpen(true)}><Gavel size={14} /> Set penalty band</button>
            </>
          )}
        </div>
      </div>
    </div>

      {escalateOpen && (
        <EscalateModal scan={scan} onClose={() => setEscalateOpen(false)} onConfirm={(reason) => { onEscalate(scan.id, reason); setEscalateOpen(false); }} />
      )}
      {assignOpen && (
        <AssignModal scan={scan} onClose={() => setAssignOpen(false)} onConfirm={(name) => { onAssign(scan.id, name); setAssignOpen(false); }} />
      )}
      {penaltyOpen && (
        <PenaltyModal scan={scan} onClose={() => setPenaltyOpen(false)} onConfirm={(band) => { onSetPenalty(scan.id, band); setPenaltyOpen(false); }} />
      )}
      {threeDOpen && (
        <ThreeDCaptureModal
          open
          brand={scan.brand}
          onClose={() => setThreeDOpen(false)}
          onModelReady={(model) => {
            onUpdateScan?.(scan.id, { packModel: model });
          }}
        />
      )}
    </>
  );
}

/* ---------------------------------------------------------------- */
/* app shell                                                          */
/* ---------------------------------------------------------------- */

function AppInner() {
  const { mode, setMode } = useTheme();
  const [role, setRole] = useState(null);
  // `role` is set only after sign-in, so every downstream screen can assume
  // a real signed-in session whenever `role` is non-null.
  const [session, setSession] = useState(null); // { name, employeeId, role } once signed in
  const [authReady, setAuthReady] = useState(!firebaseReady);
  const [syncError, setSyncError] = useState("");
  const [view, setView] = useState("home");
  const [homeCapture, setHomeCapture] = useState(null);
  const [scanPullOpen, setScanPullOpen] = useState(false);
  const [scans, setScans] = useState(() => seedScans());
  const [detailScanId, setDetailScanId] = useState(null);
  const [ruleVersions, setRuleVersions] = useState(RULE_CHANGELOG);
  const detailScan = scans.find((s) => s.id === detailScanId) || null;
  const cloudSeeded = useRef(false);

  async function clearSession() {
    setRole(null);
    setSession(null);
    setView("home");
    setSyncError("");
    try {
      await firebaseSignOut();
    } catch {
      /* local session already cleared */
    }
  }

  useDismissOnBack(!!role, () => { clearSession(); });
  useDismissOnBack(scanPullOpen, () => setScanPullOpen(false));
  useDismissOnBack(view === "feed", () => setView("home"));

  // Restore Firebase Auth session after splash / refresh.
  useEffect(() => {
    if (!firebaseReady) {
      setAuthReady(true);
      return undefined;
    }
    return watchAuth(async (user) => {
      try {
        if (!user) {
          setSession(null);
          setRole(null);
          return;
        }
        const profile = await loadUserProfile(user.uid);
        if (profile?.role) {
          setSession(profile);
          setRole(profile.role);
          setView("home");
        }
      } finally {
        setAuthReady(true);
      }
    });
  }, []);

  // Live Firestore sync for cases + rulebook + user settings once signed in.
  useEffect(() => {
    if (!firebaseReady || !session?.uid) return undefined;
    let alive = true;

    (async () => {
      if (!cloudSeeded.current) {
        try {
          const result = await seedCloudIfEmpty({
            scans: seedScans(),
            rules: RULE_CHANGELOG,
          });
          cloudSeeded.current = true;
          if (result.seeded) setSyncError("");
        } catch (err) {
          if (alive) setSyncError(err?.message || "Could not seed Firestore.");
        }
      }
    })();

    const unsubScans = subscribeScans(
      (rows) => {
        if (!alive || !rows) return;
        if (rows.length) setScans(rows);
      },
      (err) => alive && setSyncError(err?.message || "Scan sync failed.")
    );
    const unsubRules = subscribeRuleVersions(
      (rows) => {
        if (!alive || !rows) return;
        if (rows.length) setRuleVersions(rows);
      },
      (err) => alive && setSyncError(err?.message || "Rule sync failed.")
    );
    const unsubSettings = subscribeUserSettings(
      session.uid,
      (settings) => {
        if (!alive || !settings) return;
        if (settings.theme === "light" || settings.theme === "dark") {
          setMode(settings.theme);
        }
        try {
          if (typeof settings.apiBase === "string") {
            if (settings.apiBase) {
              localStorage.setItem("metriq.apiBase", settings.apiBase);
              localStorage.setItem("metriq.3dApiBase", settings.apiBase);
            }
          }
        } catch {
          /* ignore */
        }
      },
      (err) => alive && setSyncError(err?.message || "Settings sync failed.")
    );

    return () => {
      alive = false;
      unsubScans();
      unsubRules();
      unsubSettings();
    };
  }, [session?.uid, setMode]);

  // Push theme changes to Firestore so devices stay aligned.
  useEffect(() => {
    if (!firebaseReady || !session?.uid) return undefined;
    const handle = window.setTimeout(() => {
      upsertUserSettings(session.uid, {
        theme: mode,
        apiBase: (() => {
          try {
            return localStorage.getItem("metriq.apiBase") || DEFAULT_3D_API_BASE;
          } catch {
            return DEFAULT_3D_API_BASE;
          }
        })(),
      }).catch(() => {});
    }, 400);
    return () => window.clearTimeout(handle);
  }, [mode, session?.uid]);

  // Feature 2a security fix: the server is the source of truth for rule
  // text (see server/index.js's ruleStore) — this hydrates it with the
  // seeded changelog on load, so /api/analyze can resolve "v2.4" etc. from
  // the very first scan, not just versions published during this session.
  useEffect(() => {
    fetch(apiUrl("/api/rules"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ versions: ruleVersions.map((v) => ({ version: v.version, ruleText: v.ruleText })) }),
    }).catch(() => { /* best-effort — analysis falls back to the base prompt if this didn't land */ });
  }, [ruleVersions]);

  function handleSaveScan(scan) {
    const withOwner = {
      ...scan,
      ownerUid: session?.uid || scan.ownerUid || null,
      inspector: scan.inspector || session?.name || "Inspector on duty",
    };
    setScans((prev) => [withOwner, ...prev]);
    upsertScan(withOwner, { uid: session?.uid }).catch((err) => setSyncError(err?.message || "Failed to sync scan."));
  }

  function handleRunMonitor(newCases) {
    const stamped = newCases.map((c) => ({
      ...c,
      ownerUid: session?.uid || null,
    }));
    setScans((prev) => [...stamped, ...prev]);
    upsertScans(stamped, { uid: session?.uid }).catch((err) => setSyncError(err?.message || "Failed to sync monitor cases."));
  }

  function handlePublishRule(newVersion) {
    setRuleVersions((prev) => [newVersion, ...prev]);
    upsertRuleVersion(newVersion).catch((err) => setSyncError(err?.message || "Failed to sync rule."));
    fetch(apiUrl("/api/rules"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ versions: [{ version: newVersion.version, ruleText: newVersion.ruleText }] }),
    }).catch(() => { /* best-effort — see above */ });
  }

  function updateScan(id, patch) {
    setScans((prev) => {
      const next = prev.map((s) => (s.id === id ? { ...s, ...patch } : s));
      const updated = next.find((s) => s.id === id);
      if (updated) {
        upsertScan(updated, { uid: session?.uid }).catch((err) => setSyncError(err?.message || "Failed to sync case update."));
      }
      return next;
    });
  }

  function handleEscalate(id, reason) {
    updateScan(id, { escalated: true, escalationReason: reason });
  }

  function handleAssign(id, name) {
    updateScan(id, { assignedTo: name });
  }

  function handleSetPenalty(id, band) {
    updateScan(id, { penaltyBand: band });
  }

  function handleTabChange(id) {
    if (id === "scan") {
      // Pull-to-scan lives on Home only — jump home first, then open the sheet.
      setView("home");
      setScanPullOpen(true);
      return;
    }
    setScanPullOpen(false);
    setView(id);
  }

  return (
    <AppFrame>
    <div className="lm-root flex h-full min-h-0 flex-col overflow-hidden">
      <GlobalStyle />

      {!authReady ? (
        <div className="flex min-h-0 flex-1 items-center justify-center text-[13px] text-ink-soft">
          Connecting…
        </div>
      ) : !role ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Login
            onLogin={async (sess, password) => {
              if (firebaseReady) {
                const profile = await signInWithSession(sess, password);
                setSession(profile);
                setRole(profile.role);
              } else {
                setSession(sess);
                setRole(sess.role);
              }
              setView("home");
              setSyncError("");
            }}
          />
        </div>
      ) : (
        <PullToScan
          enabled={view === "home"}
          open={scanPullOpen}
          onOpenChange={setScanPullOpen}
          onCapture={(img) => {
            setHomeCapture(img);
            setScanPullOpen(false);
            setView("scan");
          }}
        >
          <main className={"app-main" + (view === "feed" ? " app-main--feed" : "")}>
            {syncError && (
              <div className="mx-5 mt-2 rounded-xl border border-[#F5C2C0] bg-[#FEF3F2] px-3 py-2 text-[12px] text-[#B42318]">
                Sync: {syncError}
              </div>
            )}
            {view === "home" && (
              <HomeView
                role={role}
                session={session}
                scans={scans}
                ruleVersions={ruleVersions}
                onOpenCases={() => setView("history")}
                onOpenFeed={() => setView("feed")}
                onOpenRules={() => setView("feed")}
                onSelectScan={(s) => setDetailScanId(s.id)}
                onOpenTrends={() => setView("dashboard")}
                onOpenRuleEditor={() => setView("ruleadmin")}
              />
            )}
            {view === "feed" && (
              <RulesFeedView
                ruleVersions={ruleVersions}
                onBack={() => setView("home")}
              />
            )}
            {view === "scan" && (
              <ScanView
                onSave={handleSaveScan}
                onUpdateScan={updateScan}
                ruleVersions={ruleVersions}
                inspectorName={session?.name || "Inspector on duty"}
                ownerUid={session?.uid || null}
                initialImage={homeCapture}
                onConsumedInitialImage={() => setHomeCapture(null)}
                onRescan={() => {
                  setHomeCapture(null);
                  setView("home");
                  setScanPullOpen(true);
                }}
              />
            )}
            {view === "history" && <CasesView scans={scans} onSelect={(s) => setDetailScanId(s.id)} />}
            {view === "dashboard" && role === "supervisor" && (
              <div className="px-4 pt-4">
                <DashboardView scans={scans} onSelect={(s) => setDetailScanId(s.id)} onRunMonitor={handleRunMonitor} supervisorName={session?.name || "Supervisor on duty"} />
              </div>
            )}
            {view === "ruleadmin" && role === "ruleadmin" && (
              <div className="px-4 pt-4">
                <RuleAdminView ruleVersions={ruleVersions} onPublish={handlePublishRule} adminName={session?.name || "Rule Admin"} scans={scans} />
              </div>
            )}
            {view === "profile" && (
              <ProfileView
                role={role}
                session={session}
                ruleVersions={ruleVersions}
                onSwitchRole={() => { clearSession(); }}
                onOpenRules={() => setView("feed")}
                onBack={() => setView("home")}
              />
            )}
          </main>
          <BottomNav role={role} view={scanPullOpen ? "scan" : view} onChange={handleTabChange} />
        </PullToScan>
      )}

      {detailScan && (
        <CaseDetail
          scan={detailScan}
          role={role}
          onClose={() => setDetailScanId(null)}
          onEscalate={handleEscalate}
          onAssign={handleAssign}
          onSetPenalty={handleSetPenalty}
          onUpdateScan={updateScan}
        />
      )}
    </div>
    </AppFrame>
  );
}

/* ---------------------------------------------------------------- */
/* error boundary                                                     */
/* ---------------------------------------------------------------- */

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      const message = (this.state.error && this.state.error.message) || String(this.state.error);
      return (
        <div className="lm-root">
          <GlobalStyle />
          <div className="lm-role-screen">
            <div className="lm-role-eyebrow">Legal Metrology · Field Compliance</div>
            <h1 className="lm-role-title">Something went wrong</h1>
            <p className="lm-role-sub">{message}</p>
            <button className="lm-btn lm-btn-primary" onClick={() => this.setState({ error: null })}>Try again</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [booting, setBooting] = useState(() => {
    try {
      const force = new URLSearchParams(window.location.search).has("splash");
      if (force) {
        localStorage.removeItem("metriq.splash.seen");
        return true;
      }
      return localStorage.getItem("metriq.splash.seen") !== "1";
    } catch {
      return true;
    }
  });

  const endSplash = useCallback(() => {
    try {
      localStorage.setItem("metriq.splash.seen", "1");
    } catch {
      /* private mode / blocked storage */
    }
    setBooting(false);
  }, []);

  return (
    <ErrorBoundary>
      {booting ? (
        <SplashScreen onDone={endSplash} />
      ) : (
        <AppInner />
      )}
    </ErrorBoundary>
  );
}

/* ---------------------------------------------------------------- */
/* styles                                                             */
/* ---------------------------------------------------------------- */

function GlobalStyle() {
  const { colors: C } = useTheme();
  return (
    <style>{`
      /* Fonts load from index.html (Manrope + IBM Plex Mono). */

      .lm-root {
        --bg: ${C.bg};
        --panel: ${C.panel};
        --panel-alt: ${C.panelAlt};
        --ink: ${C.ink};
        --ink-soft: ${C.inkSoft};
        --navy: ${C.navy};
        --navy-deep: ${C.navyDeep};
        --brass: ${C.brass};
        --brass-soft: ${C.brassSoft};
        --brass-strong: ${C.brassStrong};
        --green: ${C.green};
        --green-soft: ${C.greenSoft};
        --red: ${C.red};
        --red-soft: ${C.redSoft};
        --border: ${C.border};
        --paper: ${C.paper};
        --font-display: ${FONTS.display};
        --font-body: ${FONTS.body};
        --font-mono: ${FONTS.mono};
        background: var(--bg);
        color: var(--ink);
        font-family: var(--font-body);
        min-height: 100%;
        border-radius: 12px;
        /* Bug fix: this was overflow: hidden. .lm-root never actually
           grows an internal scrollbar (only min-height is set, so its box
           always matches its content's height) -- the real scrolling
           happens on the document/viewport. But any non-visible overflow
           on an ancestor still registers as that element's scroll
           container for CSS position: sticky purposes, even when it
           never scrolls independently. That silently broke the dashboard's
           sticky jump-nav (position: sticky; top: 0): it measured as
           sticky in computed styles but its on-screen position tracked
           the page scroll 1:1 instead of pinning to the viewport top,
           confirmed live (its getBoundingClientRect().top moved by exactly
           the scroll delta). Switching to overflow: visible removes that
           dead scroll-container ancestor so sticky descendants stick to
           the real viewport as intended; verified this doesn't change any
           visible clipping since nothing here relies on lm-root cropping
           content (fixed-position modals already escape it regardless,
           and wide content already scrolls via its own overflow-x wrappers). */
        overflow: visible;
      }
      .lm-root * { box-sizing: border-box; }
      .lm-root button { font-family: var(--font-body); cursor: pointer; }
      .lm-root input, .lm-root select { font-family: var(--font-body); }
      .lm-root *:focus-visible { outline: 2px solid var(--navy); outline-offset: 2px; }

      .lm-role-screen { padding: 56px 40px; text-align: center; max-width: 640px; margin: 0 auto; }
      .lm-role-eyebrow { font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--brass); margin-bottom: 10px; }
      .lm-role-title { font-family: var(--font-display); font-weight: 700; font-size: 30px; color: var(--ink); margin: 0 0 10px; }
      .lm-role-sub { color: var(--ink-soft); font-size: 14px; margin: 0 0 24px; }
      .lm-tick { width: 100%; height: 12px; display: flex; align-items: center; margin: 4px 0 28px; }

      .lm-shell { display: flex; flex-direction: column; min-height: 560px; }
      .lm-header { background: rgba(10,10,18,0.92); color: var(--ink); display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 14px 22px; border-bottom: 1px solid rgba(255,255,255,0.06); backdrop-filter: blur(16px); }
      .lm-header-left { display: flex; align-items: center; gap: 10px; }
      .lm-header-eyebrow { font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink-soft); }
      .lm-header-title { font-family: var(--font-display); font-size: 16px; font-weight: 700; }
      .lm-header-right { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }

      .lm-link-btn { background: none; border: none; color: var(--ink-soft); font-size: 12.5px; display: flex; align-items: center; gap: 6px; }
      .lm-link-btn:hover { color: var(--ink); }

      .lm-session-chip { display: flex; align-items: center; gap: 8px; padding: 4px 10px 4px 4px; border: 1px solid rgba(255,255,255,0.1); border-radius: 999px; background: rgba(255,255,255,0.04); }
      .lm-session-avatar { display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 50%; background: var(--navy); color: #fff; font-family: var(--font-display); font-weight: 700; font-size: 12px; flex-shrink: 0; }
      .lm-session-text { display: flex; flex-direction: column; line-height: 1.25; }
      .lm-session-name { font-size: 12px; font-weight: 600; color: var(--ink); }
      .lm-session-id { font-family: var(--font-mono); font-size: 10px; color: var(--ink-soft); }

      .lm-nav { display: flex; gap: 6px; background: var(--bg); padding: 10px 18px; border-bottom: 1px solid rgba(255,255,255,0.06); }
      .lm-nav-item { background: none; border: none; padding: 8px 16px; font-size: 13px; color: var(--ink-soft); display: flex; align-items: center; gap: 6px; border-radius: 999px; }
      .lm-nav-item:hover { background: var(--panel-alt); color: var(--ink); }
      .lm-nav-active { background: var(--navy); color: #fff; font-weight: 600; box-shadow: 0 8px 20px -10px rgba(91,108,255,0.8); }

      .lm-main { padding: 24px; flex: 1; }
      .lm-panel { max-width: 760px; margin: 0 auto; }
      .lm-panel-wide { max-width: 1080px; }
      .lm-eyebrow { font-family: var(--font-mono); font-size: 10.5px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--brass); margin-bottom: 4px; }
      .lm-h2 { font-family: var(--font-display); font-size: 22px; font-weight: 700; color: var(--ink); margin: 0 0 8px; }
      .lm-h3 { font-family: var(--font-display); font-size: 16px; font-weight: 700; color: var(--ink); margin: 28px 0 10px; }
      .lm-h3-note { font-family: var(--font-body); font-weight: 400; font-size: 12px; color: var(--ink-soft); }

      /* Supervisor dashboard: grouped sections + jump-nav, so a long page of
         KPIs/charts/tables reads as a few labeled clusters instead of one
         undifferentiated scroll. Purely presentational — every KPI, chart,
         table and action inside is unchanged. */
      .lm-dash-jumpnav { position: sticky; top: 0; z-index: 5; display: flex; gap: 6px; flex-wrap: wrap; background: var(--panel); border: 1px solid var(--border); border-radius: 999px; padding: 8px; margin-bottom: 22px; }
      .lm-dash-jump-btn { background: none; border: none; font-size: 12.5px; font-weight: 600; color: var(--ink-soft); padding: 7px 12px; border-radius: 999px; display: flex; align-items: center; gap: 6px; cursor: pointer; }
      .lm-dash-jump-btn:hover { background: var(--panel-alt); color: var(--ink); }
      .lm-dash-section { background: var(--panel-alt); border: 1px solid var(--border); border-radius: 22px; padding: 20px 22px 24px; margin-bottom: 20px; scroll-margin-top: 66px; }
      .lm-dash-section-head { display: flex; align-items: center; gap: 8px; color: var(--brass); margin-bottom: 4px; }
      .lm-dash-section-head h3 { font-family: var(--font-mono); font-size: 11.5px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--brass); margin: 0; }
      .lm-dash-section .lm-h3:first-of-type { margin-top: 6px; }
      .lm-dash-section .lm-chart, .lm-dash-section .lm-table-wrap, .lm-dash-section .lm-heatmap, .lm-dash-section .lm-ecom-panel { background: var(--panel); }
      .lm-kpi-flag { border-top-color: var(--red) !important; }

      .lm-scan-idle { display: flex; flex-direction: column; gap: 20px; }
      .lm-upload-box { background: var(--panel); border: 1.5px dashed var(--border); border-radius: 22px; padding: 28px; display: flex; flex-direction: column; align-items: center; gap: 10px; }
      .lm-upload-text { font-size: 13px; color: var(--ink-soft); margin: 0; }
      .lm-btn-row { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
      .lm-samples { background: var(--panel-alt); border-radius: 20px; padding: 16px 18px; }
      .lm-samples-label { font-size: 12px; color: var(--ink-soft); margin-bottom: 10px; }

      .lm-btn { display: inline-flex; align-items: center; gap: 6px; background: var(--panel-alt); border: 1px solid var(--border); color: var(--ink); font-size: 12.5px; padding: 8px 16px; border-radius: 999px; }
      .lm-btn:hover { border-color: var(--navy); }
      .lm-btn-primary { background: var(--navy); color: #fff; border-color: var(--navy); box-shadow: 0 10px 24px -12px rgba(91,108,255,0.8); }
      .lm-btn-primary:hover { background: var(--brass-strong); }
      .lm-btn:disabled, .lm-btn-primary:disabled { opacity: 0.45; cursor: not-allowed; }
      .lm-btn:disabled:hover { border-color: var(--border); }
      .lm-btn-primary:disabled:hover { background: var(--navy); }
      .lm-icon-btn { background: none; border: none; color: var(--ink-soft); padding: 4px; }

      .lm-preview { width: 100%; max-width: 320px; border: 1px solid var(--border); border-radius: 4px; display: block; margin: 0 auto 14px; }
      .lm-analyzing { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 20px 0; }
      .lm-analyzing-status { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--ink-soft); }
      .lm-spin { animation: lmspin 900ms linear infinite; }
      @keyframes lmspin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

      .lm-error { display: flex; align-items: center; gap: 10px; background: var(--red-soft); border-radius: 16px; padding: 14px 16px; font-size: 13px; }

      .lm-retake { display: flex; flex-direction: column; align-items: center; gap: 12px; text-align: center; padding: 8px 0; }
      .lm-retake-reason { font-size: 13.5px; color: var(--ink-soft); max-width: 420px; margin: 0; }

      @keyframes stampIn { 0% { opacity: 0; transform: scale(1.7) rotate(-9deg); } 60% { opacity: 1; transform: scale(0.95) rotate(-4deg); } 100% { opacity: 1; transform: scale(1) rotate(-4deg); } }
      .lm-stamp { display: inline-block; align-self: center; font-family: var(--font-body); font-weight: 700; font-size: 15px; letter-spacing: 0.09em; padding: 8px 18px; border: 3px double currentColor; border-radius: 12px; transform: rotate(-4deg); animation: stampIn 260ms ease-out; margin: 4px 0 16px; }
      @media (prefers-reduced-motion: reduce) { .lm-stamp { animation: none; } }

      .lm-fields { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
      .lm-field-row { background: var(--panel); border: 1px solid var(--border); border-radius: 16px; padding: 10px 12px; }
      .lm-field-top { display: flex; align-items: center; gap: 8px; }
      .lm-field-name { font-size: 13px; font-weight: 500; flex: 1; }
      .lm-field-badge { font-family: var(--font-mono); font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; padding: 2px 7px; border-radius: 3px; }
      .lm-badge-compliant { background: var(--green-soft); color: var(--green); }
      .lm-badge-non_compliant { background: var(--red-soft); color: var(--red); }
      .lm-badge-missing { background: var(--red-soft); color: var(--red); }
      .lm-field-value { font-family: var(--font-mono); font-size: 11.5px; color: var(--ink-soft); margin: 6px 0 2px; }
      .lm-field-explain { font-size: 12px; color: var(--ink-soft); }
      .lm-field-citation { font-family: var(--font-mono); font-size: 10.5px; color: var(--brass); margin-top: 4px; }
      .lm-field-correct-btn { display: inline-flex; align-items: center; gap: 5px; margin-top: 8px; background: none; border: 1px dashed var(--border); border-radius: 3px; padding: 3px 8px; font-size: 11px; color: var(--ink-soft); cursor: pointer; }
      .lm-field-correct-btn:hover { border-color: var(--brass); color: var(--brass); }
      .lm-field-correction { display: flex; align-items: center; gap: 5px; margin-top: 8px; font-size: 11.5px; color: var(--ink); background: var(--brass-soft); border-radius: 10px; padding: 4px 8px; }
      .lm-corrections-audit { background: var(--panel-alt); border-radius: 4px; padding: 10px 12px; margin-bottom: 16px; }
      .lm-correction-row { display: flex; gap: 10px; align-items: flex-start; padding: 8px 0; border-top: 1px solid var(--border); }
      .lm-correction-row:first-of-type { border-top: none; }
      .lm-correction-thumb { width: 56px; height: 56px; object-fit: cover; border-radius: 3px; flex-shrink: 0; }

      .lm-integrity { background: var(--panel-alt); border-radius: 4px; padding: 10px 12px; display: flex; flex-direction: column; gap: 4px; margin-bottom: 16px; }
      .lm-integrity-label { display: flex; align-items: center; gap: 5px; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--brass); margin-bottom: 2px; }
      .lm-integrity-row { display: flex; align-items: center; gap: 7px; font-family: var(--font-mono); font-size: 11px; color: var(--ink-soft); }

      .lm-save-form { display: flex; flex-direction: column; gap: 10px; background: var(--panel); border: 1px solid var(--border); border-radius: 18px; padding: 16px; }
      .lm-form-row { display: flex; align-items: center; gap: 10px; }
      .lm-form-row label { font-size: 12px; color: var(--ink-soft); width: 70px; flex-shrink: 0; }
      .lm-form-row input, .lm-form-row select { flex: 1; border: 1px solid var(--border); border-radius: 12px; padding: 7px 9px; font-size: 13px; background: var(--navy-deep); color: var(--ink); }
      .lm-saved-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
      .lm-saved-msg { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--green); }

      .lm-history-controls { display: flex; gap: 10px; margin-bottom: 16px; }
      .lm-search { flex: 1; display: flex; align-items: center; gap: 8px; border: 1px solid var(--border); border-radius: 999px; padding: 7px 14px; background: var(--panel); }
      .lm-search input { border: none; outline: none; flex: 1; font-size: 13px; background: transparent; color: var(--ink); }
      .lm-history-controls select { border: 1px solid var(--border); border-radius: 999px; padding: 7px 10px; font-size: 13px; background: var(--panel); color: var(--ink); }

      .lm-table-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: 4px; }
      .lm-table { width: 100%; border-collapse: collapse; font-size: 13px; }
      .lm-table th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-soft); background: var(--panel-alt); padding: 9px 12px; }
      .lm-table td { padding: 9px 12px; border-top: 1px solid var(--border); }
      .lm-row-click { cursor: pointer; }
      .lm-row-click:hover { background: var(--panel-alt); }
      .lm-empty { text-align: center; color: var(--ink-soft); padding: 24px; }

      .lm-kpi-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-bottom: 8px; }
      .lm-kpi { background: var(--panel); border: 1px solid var(--border); border-radius: 18px; padding: 14px 16px; }
      .lm-kpi-label { font-size: 11px; color: var(--ink-soft); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
      .lm-kpi-value { font-family: var(--font-display); font-size: 24px; font-weight: 700; color: var(--ink); }

      .lm-chart { background: var(--panel); border: 1px solid var(--border); border-radius: 4px; padding: 12px; }

      .lm-heatmap { display: flex; flex-direction: column; gap: 4px; }
      .lm-heatmap-row { display: grid; grid-template-columns: 180px repeat(4, 1fr); gap: 4px; }
      .lm-heatmap-header { font-size: 11px; color: var(--ink-soft); }
      .lm-heatmap-col-label { text-align: center; padding: 4px 0; }
      .lm-heatmap-row-label { font-size: 12.5px; display: flex; align-items: center; padding-right: 8px; }
      .lm-heatmap-cell { display: flex; align-items: center; justify-content: center; font-family: var(--font-mono); font-size: 12px; border-radius: 10px; padding: 12px 4px; color: var(--ink); }

      .lm-modal-scrim { position: fixed; inset: 0; background: rgba(0,0,0,0.72); display: flex; align-items: center; justify-content: center; padding: 20px; z-index: 10; }
      .lm-modal { background: var(--panel); border-radius: 24px; padding: 20px 22px; width: 100%; max-width: 420px; max-height: 80vh; overflow-y: auto; border: 1px solid rgba(255,255,255,0.08); }
      .lm-modal-wide { max-width: 520px; }
      .lm-modal-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
      .lm-case-meta { display: flex; gap: 6px; font-size: 12px; color: var(--ink-soft); margin-bottom: 10px; flex-wrap: wrap; }
      .lm-no-image { display: flex; align-items: center; gap: 8px; background: var(--panel-alt); border-radius: 4px; padding: 14px; font-size: 12.5px; color: var(--ink-soft); margin: 12px 0; }

      .lm-changelog { display: flex; flex-direction: column; gap: 14px; }
      .lm-changelog-item { border-left: 2px solid var(--brass); padding-left: 12px; }
      .lm-changelog-top { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
      .lm-changelog-version { font-family: var(--font-mono); font-size: 12px; font-weight: 600; color: var(--navy); }
      .lm-changelog-date { font-size: 11px; color: var(--ink-soft); }
      .lm-changelog-approved { display: flex; align-items: center; gap: 3px; font-size: 10.5px; color: var(--green); margin-left: auto; }
      .lm-changelog-desc { font-size: 12.5px; color: var(--ink-soft); }
      .lm-changelog-new { font-family: var(--font-mono); font-size: 9.5px; font-weight: 700; letter-spacing: 0.05em; color: var(--ink); background: var(--brass-soft); padding: 1px 6px; border-radius: 999px; }

      .lm-ruleadmin-active { background: var(--panel); border: 1px solid var(--border); border-radius: 18px; padding: 14px 16px; margin-bottom: 16px; }
      .lm-ruleadmin-active-top { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
      .lm-ruleadmin-active-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-soft); }
      .lm-ruleadmin-active-desc { font-size: 13px; color: var(--ink); }

      .lm-ruleadmin-draft { display: flex; flex-direction: column; gap: 14px; background: var(--panel); border: 1px solid var(--border); border-radius: 4px; padding: 16px; margin-top: 4px; }
      .lm-ruleadmin-editor-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
      .lm-ruleadmin-editor-col { display: flex; flex-direction: column; gap: 6px; }
      .lm-ruleadmin-col-label { display: flex; align-items: center; gap: 5px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-soft); }
      .lm-ruleadmin-textarea { font-family: var(--font-mono); font-size: 12px; border: 1px solid var(--border); border-radius: 12px; padding: 10px; resize: vertical; background: var(--navy-deep); color: var(--ink); line-height: 150%; }

      .lm-diff { font-family: var(--font-mono); font-size: 11.5px; background: var(--panel-alt); border-radius: 3px; padding: 10px; min-height: 140px; overflow-y: auto; }
      .lm-diff-empty { color: var(--ink-soft); }
      .lm-diff-line { padding: 2px 4px; border-radius: 2px; margin-bottom: 2px; white-space: pre-wrap; }
      .lm-diff-removed { background: var(--red-soft); color: var(--red); text-decoration: line-through; }
      .lm-diff-added { background: var(--green-soft); color: var(--green); }

      .lm-ruleadmin-review { display: flex; flex-direction: column; gap: 10px; background: var(--brass-soft); border-radius: 16px; padding: 14px; }
      .lm-ruleadmin-review-label { display: flex; align-items: center; gap: 7px; font-size: 12.5px; font-weight: 600; color: var(--ink); }
      .lm-ruleadmin-comment { font-size: 12px; font-style: italic; color: var(--ink-soft); margin-top: 4px; }

      @media (max-width: 640px) {
        .lm-ruleadmin-editor-row { grid-template-columns: 1fr; }
      }

      .lm-chip-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
      .lm-chip { background: var(--panel-alt); border: 1px solid var(--border); color: var(--ink-soft); font-size: 12.5px; padding: 7px 14px; border-radius: 20px; }
      .lm-chip:hover { border-color: var(--navy); }
      .lm-chip-active { background: var(--navy); color: #fff; border-color: var(--navy); }

      .lm-decision-badge { display: flex; align-items: center; gap: 7px; font-size: 12.5px; padding: 9px 12px; border-radius: 4px; margin-bottom: 14px; }
      .lm-decision-confirmed { background: var(--green-soft); color: var(--green); }
      .lm-decision-disputed { background: var(--brass-soft); color: var(--ink); }

      .lm-notice-preview { background: var(--panel-alt); border: 1px solid var(--border); border-radius: 4px; padding: 14px 16px; margin-bottom: 14px; }
      .lm-notice-title { font-family: var(--font-display); font-weight: 700; font-size: 14px; letter-spacing: 0.08em; color: var(--ink); margin-bottom: 8px; }
      .lm-notice-line { font-size: 12.5px; color: var(--ink); margin-bottom: 3px; }

      .lm-sig-canvas { width: 100%; max-width: 280px; height: 100px; border: 1.5px dashed var(--border); border-radius: 12px; background: var(--navy-deep); display: block; cursor: crosshair; touch-action: none; }

      .lm-assign-list { display: flex; flex-direction: column; gap: 8px; }
      .lm-assign-item { display: flex; align-items: center; gap: 10px; background: var(--panel); border: 1px solid var(--border); border-radius: 4px; padding: 10px 12px; font-size: 13px; cursor: pointer; }
      .lm-assign-item:hover { border-color: var(--navy); }
      .lm-assign-item-active { border-color: var(--navy); background: var(--panel-alt); }

      .lm-case-status-badges { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; }
      .lm-case-status-badges .lm-decision-badge { margin-bottom: 0; }

      .lm-scale-section { background: var(--panel); border: 1px solid var(--border); border-radius: 4px; padding: 14px 16px; margin-bottom: 16px; display: flex; flex-direction: column; gap: 10px; }
      .lm-scale-row { display: flex; align-items: center; gap: 8px; }
      .lm-scale-row input { width: 100px; border: 1px solid var(--border); border-radius: 12px; padding: 7px 9px; font-size: 13px; background: var(--navy-deep); color: var(--ink); }
      .lm-scale-unit { font-family: var(--font-mono); font-size: 12px; color: var(--ink-soft); }

      .lm-exempt-badge { display: inline-flex; align-items: center; gap: 5px; font-family: var(--font-mono); font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.05em; padding: 4px 10px; border-radius: 20px; margin: 0 0 14px; }
      .lm-exempt-yes { background: var(--brass-soft); color: var(--ink); }
      .lm-exempt-no { background: var(--panel-alt); color: var(--ink-soft); }

      .lm-risk-badge { display: inline-flex; align-items: center; gap: 6px; padding: 5px 11px; border-radius: 20px; font-size: 12px; }
      .lm-risk-score { font-family: var(--font-mono); font-weight: 700; }
      .lm-risk-label { font-size: 11px; }
      .lm-risk-low { background: var(--green-soft); color: var(--green); }
      .lm-risk-medium { background: #F3DCC8; color: #8a5a1f; }
      .lm-risk-high { background: var(--red-soft); color: var(--red); }
      .lm-risk-small { padding: 2px 8px; font-size: 10.5px; }
      .lm-risk-small .lm-risk-label { display: none; }

      .lm-qr-canvas { border: 1px solid var(--border); border-radius: 3px; flex-shrink: 0; }
      .lm-custody { display: flex; gap: 14px; align-items: flex-start; background: var(--panel); border: 1px solid var(--border); border-radius: 4px; padding: 14px 16px; margin-bottom: 16px; }
      .lm-custody-id { font-family: var(--font-mono); font-size: 13px; color: var(--navy); margin: 4px 0; }

      .lm-ledger { margin-bottom: 16px; }
      .lm-ledger .lm-table-wrap { margin-top: 8px; }

      .lm-bias-flag { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; color: var(--red); font-weight: 600; }

      .lm-calib-badge { font-family: var(--font-mono); font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.04em; padding: 3px 9px; border-radius: 20px; }
      .lm-calib-ok { background: var(--green-soft); color: var(--green); }
      .lm-calib-due_soon { background: #F3DCC8; color: #8a5a1f; }
      .lm-calib-overdue { background: var(--red-soft); color: var(--red); }

      .lm-source-badge { display: inline-flex; align-items: center; gap: 4px; font-family: var(--font-mono); font-size: 10px; text-transform: uppercase; letter-spacing: 0.03em; padding: 3px 8px; border-radius: 20px; background: var(--brass-soft); color: var(--ink); white-space: nowrap; }
      .lm-source-badge-small { font-size: 9.5px; padding: 2px 6px; }

      .lm-ecom-panel { background: var(--panel); border: 1px solid var(--border); border-radius: 4px; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
      .lm-ecom-status { font-size: 12.5px; color: var(--ink-soft); }
      .lm-ecom-skus { margin-top: 4px; }
      .lm-ecom-sku-list { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
      .lm-ecom-sku-row { display: flex; align-items: center; gap: 10px; font-size: 12.5px; background: var(--panel-alt); border-radius: 3px; padding: 8px 10px; }
      .lm-ecom-sku-code { font-family: var(--font-mono); font-size: 11px; color: var(--navy); flex-shrink: 0; }
      .lm-ecom-sku-brand { flex: 1; }
      .lm-ecom-sku-platform { font-size: 11px; color: var(--ink-soft); }


      @media (max-width: 640px) {
        /* 5 tiles in a 2-col grid leaves the last one alone on its own row —
           span it across both columns instead of stranding it on the left. */
        .lm-kpi-grid { grid-template-columns: 1fr 1fr; }
        .lm-kpi:last-child { grid-column: 1 / -1; }
        .lm-heatmap-row { grid-template-columns: 110px repeat(4, 1fr); }
        .lm-history-controls { flex-direction: column; }
      }
    `}</style>
  );
}
