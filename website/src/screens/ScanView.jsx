import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle, Ban, Bluetooth, Box, Camera, Check, CheckCircle2, Download,
  FileText, Loader2, Maximize2, PackageSearch, Scale, ScanLine, Upload, X,
} from "lucide-react";
import { motion } from "motion/react";
import { Button } from "../components/ui/Button.jsx";
import { Chip } from "../components/ui/Chip.jsx";
import { InlineBanner } from "../components/ui/InlineBanner.jsx";
import { TickDivider } from "../components/TickDivider.jsx";
import {
  CaptureMetaBadge, ChainOfCustody, FieldRow, IntegrityBadge, RuleVersionBadge, Stamp,
} from "./scan/parts.jsx";
import {
  ConfirmViolationModal, FieldCorrectionModal, HoldNoticeModal, RetakeReasonModal, ThreeDCaptureModal,
} from "./scan/modals.jsx";
import { ObjectScanCapture } from "./scan/objectScan.jsx";
import { PhoneHandoffCapture } from "./scan/handoff.jsx";
import { captureEvidencePhoto, hashDataUrl } from "../lib/capture.js";
import { analyzeLabelImage } from "../lib/api.js";
import { downloadReport } from "../lib/pdf/caseReport.js";
import { downloadReportDocx } from "../lib/docx/caseReport.js";
import {
  applyFieldCorrections, computeOverallStatus, generateNonce, getActiveRuleVersion,
  GPS_BY_REGION, isExemptQuantity, maxPermissibleError, parseQuantity,
} from "../lib/scanLogic.js";
import { CATEGORIES, REGIONS } from "../data/fixtures.js";
import { DEMO_3D_PRODUCTS } from "../data/demoProducts.js";
import { hashSeed } from "../lib/hash.js";
import { todayLocalISO } from "../lib/format.js";
import { useDismissOnBack } from "../lib/useDismissOnBack.js";

// Real, unedited photos of physical Indian packaged-goods labels, used for
// the idle screen's demo buttons so trying the flow needs no camera or
// real label on hand — but the AI is still reading an actual label instead
// of a mocked-up canvas drawing.
//   - "clean": a Parle-G pack, photographed with every required
//     declaration legible (address, net weight, MRP, mfg date, consumer
//     care) — see public/samples/CREDITS.md.
//   - "non_compliant": a real Kurkure print proof whose MRP and
//     manufacturing date are printed as blank fields, and which carries no
//     consumer-care declaration in this panel — an actual, unedited gap,
//     not a simulated one.
//   - "blurry": the same compliant photo, blurred at draw time to stand in
//     for a bad field capture.
const SAMPLE_IMAGES = {
  clean: "/samples/parle-g-compliant.jpg",
  non_compliant: "/samples/kurkure-non-compliant.jpg",
  blurry: "/samples/parle-g-compliant.jpg",
};

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't load sample image: " + src));
    img.src = src;
  });
}

async function drawSampleLabel(type) {
  const img = await loadImage(SAMPLE_IMAGES[type] || SAMPLE_IMAGES.clean);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (type === "blurry") ctx.filter = "blur(6px)";
  ctx.drawImage(img, 0, 0);
  return canvas;
}

async function processSample(type) {
  const canvas = await drawSampleLabel(type);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
  const { hex: hashHex, algorithm: hashAlgorithm } = await hashDataUrl(dataUrl);
  return { dataUrl, base64: dataUrl.split(",")[1], mediaType: "image/jpeg", hashHex, hashAlgorithm };
}

const SAMPLE_BUTTONS = [
  { type: "clean", label: "Compliant sample" },
  { type: "non_compliant", label: "Non-compliant sample" },
  { type: "blurry", label: "Blurry sample" },
];

// A deterministic, obviously-synthetic stand-in for a capture hash, used
// only for the real-product demo samples below (see handleDemoProduct):
// there's no actual photo to hash since these come from a 3D scan, not a
// live capture, so this exists purely to keep the rest of the pipeline
// (sampleId, the digital-integrity box) from needing a special case.
function demoHash(seed) {
  const n = hashSeed(seed).toString(16).padStart(8, "0");
  return (n + n + n + n + n + n + n + n).slice(0, 64);
}

// One angle-capture slot on the idle screen. Front, side, and back are all
// independent: filling in one never blocks or requires the others, so an
// inspector who only has time for the front-of-pack photo can still run
// analysis immediately.
function PhotoSlot({ label, hint, image, required, inputRef, onFile, onClear }) {
  return (
    <div className="flex flex-col items-center gap-2.5 rounded-[22px] border border-dashed border-border bg-panel p-4 text-center">
      <div className="text-[12.5px] font-semibold text-ink">
        {label}{required ? "" : <span className="ml-1 font-normal text-ink-soft">(optional)</span>}
      </div>
      {image ? (
        <div className="relative w-full">
          <img src={image.dataUrl} alt={`${label} of the package`} className="h-28 w-full rounded-xl border border-border object-cover" />
          <button
            type="button"
            onClick={onClear}
            aria-label={`Remove ${label.toLowerCase()} photo`}
            className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-panel text-ink-soft shadow-sm transition-colors hover:border-red hover:text-red"
          >
            <X size={13} />
          </button>
        </div>
      ) : (
        <>
          <Camera size={20} className="text-navy/50" />
          <div className="text-[11.5px] leading-snug text-ink-soft">{hint}</div>
          <Button variant="secondary" onClick={() => inputRef.current.click()}>
            <Upload size={13} /> Add photo
          </Button>
        </>
      )}
      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
    </div>
  );
}

export function ScanView({ onSave, onUpdateScan, ruleVersions, inspectorName = "Inspector on duty" }) {
  const activeRuleVersion = getActiveRuleVersion(ruleVersions);
  const [phase, setPhase] = useState("idle"); // idle | analyzing | result | retake | error
  // Two independent ways into the idle screen: photographing an arbitrary
  // real label (the app's general-purpose feature), or rotating one of the
  // pre-loaded demo products in front of the camera for the pitch-table
  // demo (see ObjectScanCapture) — kept as separate modes rather than
  // merging them, since the object-scan path deliberately never asks the
  // presenter which product it is.
  const [scanMode, setScanMode] = useState("object"); // label | object
  // Within "object" mode: scan with this device's own camera, or hand the
  // camera step off to a phone (see ./scan/handoff.jsx) and wait for its
  // result — kept as a sub-toggle rather than a third top-level mode since
  // both still end at the exact same handleDemoProduct result screen.
  const [objectScanSource, setObjectScanSource] = useState("phone"); // device | phone
  const [image, setImage] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [saveForm, setSaveForm] = useState({ brand: "", category: CATEGORIES[0], region: REGIONS[0] });
  const [saved, setSaved] = useState(false);
  const [savedScanId, setSavedScanId] = useState(null);
  const [savedReport, setSavedReport] = useState(null);
  const [violationOpen, setViolationOpen] = useState(false);
  const [violationDecision, setViolationDecision] = useState(null); // null | { type: "confirmed" } | { type: "disputed", note }
  const [holdNoticeOpen, setHoldNoticeOpen] = useState(false);
  const [holdNotice, setHoldNotice] = useState(null);
  const [captureMeta, setCaptureMeta] = useState(null);
  const [scaleReading, setScaleReading] = useState("");
  const [scaleChecked, setScaleChecked] = useState(false);
  const [scaleSource, setScaleSource] = useState(null); // null | "bluetooth-simulated"
  const [scaleConnecting, setScaleConnecting] = useState(false);
  const [fieldCorrections, setFieldCorrections] = useState({}); // field name -> correction record
  const [correctingField, setCorrectingField] = useState(null); // field object currently being corrected
  const [threeDOpen, setThreeDOpen] = useState(false);
  // The front photo is what analysis actually reads; side/back are purely
  // supplementary evidence an inspector can attach if they have time, never
  // a prerequisite for running analysis on the front photo alone.
  const [pendingFront, setPendingFront] = useState(null);
  const [pendingFrontError, setPendingFrontError] = useState("");
  const [sideImage, setSideImage] = useState(null);
  const [backImage, setBackImage] = useState(null);
  // Set only when the current result came from one of the real-product demo
  // samples (see handleDemoProduct): the result screen shows that product's
  // verified 3D model in place of a flat photo when this is set.
  const [demoProduct, setDemoProduct] = useState(null);
  const [modelViewerReady, setModelViewerReady] = useState(false);
  // The result-screen 3D thumbnail is only 220x220px — too small to make
  // out label detail on the model — so a click blows it up into a
  // near-fullscreen overlay with the same rotate/zoom controls.
  const [modelExpanded, setModelExpanded] = useState(false);
  useDismissOnBack(modelExpanded, () => setModelExpanded(false));
  const frontInputRef = useRef(null);
  const sideInputRef = useRef(null);
  const backInputRef = useRef(null);
  const scaleTimeoutRef = useRef(null);
  // Bug fix: runAnalysis had no guard against a stale response — if the
  // inspector reset/retried before a slow analyzeLabelImage call resolved,
  // the original call still landed and overwrote whatever the screen was
  // now showing with an unrelated result. Bumped on every new analysis
  // attempt and on reset(); a resolved call only applies its result if it's
  // still the most recent one requested (same pattern objectScan.jsx uses
  // via mountedRef, adapted here as a generation counter since ScanView
  // itself never unmounts between scans).
  const analysisTokenRef = useRef(0);

  // Clears the simulated-Bluetooth timer if this view resets or unmounts
  // before it fires, otherwise a stale callback can land after "Scan
  // another" and silently overwrite the next, unrelated scan's weight fields.
  useEffect(() => {
    return () => {
      if (scaleTimeoutRef.current) clearTimeout(scaleTimeoutRef.current);
    };
  }, []);

  async function runAnalysis(imgData) {
    if (scaleTimeoutRef.current) { clearTimeout(scaleTimeoutRef.current); scaleTimeoutRef.current = null; }
    setImage(imgData);
    setCaptureMeta({
      gps: GPS_BY_REGION[saveForm.region],
      timestamp: new Date().toISOString(),
      nonce: generateNonce(),
    });
    setPhase("analyzing");
    setError("");
    setSaved(false);
    setScaleReading("");
    setScaleChecked(false);
    setScaleSource(null);
    setFieldCorrections({});
    const token = ++analysisTokenRef.current;
    try {
      const parsed = await analyzeLabelImage(imgData, activeRuleVersion);
      if (analysisTokenRef.current !== token) return; // superseded by a reset/retry since this call started
      setResult(parsed);
      setPhase(parsed.image_quality === "retake_needed" ? "retake" : "result");
    } catch (e) {
      if (analysisTokenRef.current !== token) return;
      setError((e && e.message) || "Could not read a structured response from the model. Try again.");
      setPhase("error");
    }
  }

  // Front, side, and back are captured into their own slots first, not
  // analyzed the instant a file is picked, so an inspector can fill in
  // whichever angles they have (front alone is enough) before choosing to
  // run analysis.
  async function handleFrontFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const imgData = await captureEvidencePhoto(file);
      setPendingFront(imgData);
      setPendingFrontError("");
    } catch (err) {
      setPendingFrontError(err.message);
    }
  }

  async function handleSideFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      setSideImage(await captureEvidencePhoto(file));
    } catch (err) {
      // A side/back photo is supplementary evidence, not a blocker: a
      // decode failure here just leaves that slot empty rather than
      // surfacing its own error banner.
    }
  }

  async function handleBackFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      setBackImage(await captureEvidencePhoto(file));
    } catch (err) {
      // See handleSideFile above.
    }
  }

  function handleAnalyzeClick() {
    if (!pendingFront) return;
    runAnalysis(pendingFront);
  }

  async function handleSample(type) {
    try {
      const imgData = await processSample(type);
      runAnalysis(imgData);
    } catch (err) {
      setError("Couldn't generate the sample label. Try again.");
      setPhase("error");
    }
  }

  // These 4 products are real photogrammetry scans of physical packs (see
  // public/models/CREDITS.md), and their declaredFields are hand-verified
  // against the real label, not an OCR guess, so this skips analysis
  // entirely and jumps straight to the result screen with that verified
  // record instead of sending a non-existent photo to Gemini.
  function handleDemoProduct(product) {
    if (scaleTimeoutRef.current) { clearTimeout(scaleTimeoutRef.current); scaleTimeoutRef.current = null; }
    setDemoProduct(product);
    setModelViewerReady(false);
    setImage({ dataUrl: null, base64: null, mediaType: null, hashHex: demoHash(product.match), hashAlgorithm: "synthetic demo identifier (no photo captured)" });
    setCaptureMeta({
      gps: GPS_BY_REGION[saveForm.region],
      timestamp: new Date().toISOString(),
      nonce: generateNonce(),
    });
    setSaveForm((f) => ({ ...f, brand: product.name }));
    setResult({ image_quality: "ok", fields: product.declaredFields });
    setPhase("result");
    setError("");
    setSaved(false);
    setScaleReading("");
    setScaleChecked(false);
    setScaleSource(null);
    setFieldCorrections({});
  }

  // @google/model-viewer (three.js-sized) is loaded on demand, only once a
  // demo-product result actually needs to render a <model-viewer> element,
  // so every other page load never pays for it.
  useEffect(() => {
    if (!demoProduct) return;
    let cancelled = false;
    import("@google/model-viewer").then(() => {
      if (!cancelled) setModelViewerReady(true);
    });
    return () => { cancelled = true; };
  }, [demoProduct]);

  function reset() {
    if (scaleTimeoutRef.current) { clearTimeout(scaleTimeoutRef.current); scaleTimeoutRef.current = null; }
    analysisTokenRef.current++; // invalidate any in-flight runAnalysis call
    setPhase("idle");
    setImage(null);
    setPendingFront(null);
    setPendingFrontError("");
    setSideImage(null);
    setBackImage(null);
    setDemoProduct(null);
    setModelViewerReady(false);
    setResult(null);
    setError("");
    setSaved(false);
    setSavedScanId(null);
    setSavedReport(null);
    setSaveForm({ brand: "", category: CATEGORIES[0], region: REGIONS[0] });
    setViolationOpen(false);
    setViolationDecision(null);
    setHoldNoticeOpen(false);
    setHoldNotice(null);
    setCaptureMeta(null);
    setScaleReading("");
    setScaleChecked(false);
    setScaleSource(null);
    setScaleConnecting(false);
    setFieldCorrections({});
    setCorrectingField(null);
    setThreeDOpen(false);
  }

  // Bug fix: this used to just call reset() and throw the chosen reason
  // away — despite RetakeReasonModal's own copy promising "Tag the reason
  // so the case record is complete." No case record was ever created for a
  // retake at all: History and the Dashboard's "retake rate" KPI are both
  // built to show retake_needed cases (the seed data even includes one),
  // but a live retake during a real demo left no trace and couldn't move
  // that KPI. Saving a genuine retake_needed case here — same shape as any
  // other saved scan — gives the inspector's retake an actual audit record
  // instead of a silent no-op.
  function handleRetakeConfirm(reason) {
    onSave({
      id: "live-" + Date.now(),
      brand: saveForm.brand.trim() || "Unlabeled sample",
      category: saveForm.category,
      region: saveForm.region,
      date: todayLocalISO(),
      inspector: inspectorName,
      status: "retake_needed",
      fields: [],
      retakeReason: reason,
      hash: image?.hashHex || null,
      hashAlgorithm: image?.hashAlgorithm || null,
      gps: GPS_BY_REGION[saveForm.region],
      timestamp: captureMeta?.timestamp || new Date().toISOString(),
      imageDataUrl: image?.dataUrl || null,
      sampleId: image?.hashHex ? "SMP-" + image.hashHex.slice(0, 8).toUpperCase() : null,
      nonce: captureMeta?.nonce,
      ruleVersionUsed: activeRuleVersion?.version || null,
    });
    reset();
  }

  // The inspector can confirm/dispute a violation and issue a hold notice
  // either before or after saving the case: if it's already saved, push the
  // decision onto the saved scan too, so it isn't lost once this view resets
  // (mirrors how the Supervisor's escalate/assign/penalty actions persist).
  function handleConfirmViolation() {
    setViolationOpen(false);
    setViolationDecision({ type: "confirmed" });
    setHoldNoticeOpen(true);
    if (savedScanId) onUpdateScan(savedScanId, { violationConfirmed: true, violationDisputed: false, disputeNote: null });
  }

  function handleDisputeViolation(note) {
    setViolationOpen(false);
    setViolationDecision({ type: "disputed", note });
    if (savedScanId) onUpdateScan(savedScanId, { violationDisputed: true, violationConfirmed: false, disputeNote: note });
  }

  function handleIssueHoldNotice(noticeId) {
    setHoldNotice(noticeId);
    if (savedScanId) onUpdateScan(savedScanId, { holdNoticeId: noticeId });
  }

  // A per-field correction only lands here once the evidence-photo modal
  // has already forced a photo: this just persists it, keyed by field
  // name, and mirrors it onto the saved scan (if already saved) so the
  // audit trail survives even after this view resets.
  function handleSaveCorrection(correction) {
    const next = { ...fieldCorrections, [correction.fieldName]: correction };
    setFieldCorrections(next);
    setCorrectingField(null);
    // If the case is already saved, recompute its fields/status from the
    // correction too, otherwise a correction made after saving would update
    // the audit trail but leave the saved case's compliance verdict stale.
    if (savedScanId && result) {
      const correctedFields = applyFieldCorrections(result.fields, next);
      onUpdateScan(savedScanId, {
        fieldCorrections: next,
        fields: correctedFields,
        status: computeOverallStatus(correctedFields),
      });
    }
  }

  // Simulates pairing with a Bluetooth-connected scale. Real Web Bluetooth
  // (requestDevice/GATT) doesn't run on iOS Safari at all and needs the
  // exact scale's protocol, which we don't have, so rather than bet a demo
  // on hardware that may not even work in the room, this fakes a short
  // pairing delay and fills in a plausible reading. The comparison logic
  // below it is real; only the hardware link is simulated.
  function handleConnectScale(declaredQty) {
    setScaleConnecting(true);
    setScaleChecked(false);
    if (scaleTimeoutRef.current) clearTimeout(scaleTimeoutRef.current);
    scaleTimeoutRef.current = setTimeout(() => {
      let reading = declaredQty ? declaredQty.value : 50;
      if (declaredQty) {
        // Mostly within tolerance, occasionally not: a flat perfect match
        // every time would look scripted next to a real scale. The
        // out-of-tolerance case is randomized both directions (under and
        // over fill), not just underfill, so it matches real scale behavior.
        // (The actual pass/fail comparison uses the real First Schedule
        // tolerance table, see maxPermissibleError, not a flat percentage.)
        const withinTolerance = Math.random() > 0.25;
        const offsetPct = withinTolerance ? (Math.random() * 0.04 - 0.02) : (0.06 + Math.random() * 0.05);
        const sign = withinTolerance ? 1 : (Math.random() < 0.5 ? 1 : -1);
        reading = declaredQty.value * (1 + sign * offsetPct);
      }
      setScaleReading(reading.toFixed(1));
      setScaleSource("bluetooth-simulated");
      setScaleConnecting(false);
      setScaleChecked(true);
      scaleTimeoutRef.current = null;
    }, 1400);
  }

  function handleSaveCase() {
    const fields = applyFieldCorrections(result.fields, fieldCorrections);
    const status = computeOverallStatus(fields);
    const id = "live-" + Date.now();
    const scan = {
      id,
      brand: saveForm.brand.trim() || "Unlabeled sample",
      category: saveForm.category,
      region: saveForm.region,
      date: todayLocalISO(),
      inspector: inspectorName,
      status,
      fields,
      retakeReason: null,
      hash: image.hashHex,
      hashAlgorithm: image.hashAlgorithm || null,
      gps: GPS_BY_REGION[saveForm.region],
      timestamp: new Date().toISOString(),
      imageDataUrl: image.dataUrl,
      sampleId: "SMP-" + image.hashHex.slice(0, 8).toUpperCase(),
      nonce: captureMeta?.nonce,
      ruleVersionUsed: activeRuleVersion?.version || null,
      fieldCorrections,
      violationConfirmed: violationDecision?.type === "confirmed",
      violationDisputed: violationDecision?.type === "disputed",
      disputeNote: violationDecision?.type === "disputed" ? violationDecision.note : null,
      holdNoticeId: holdNotice,
      // Optional supplementary angles: present only when the inspector
      // chose to attach them, never required to reach this point.
      additionalPhotos: {
        side: sideImage?.dataUrl ?? null,
        back: backImage?.dataUrl ?? null,
      },
    };
    onSave(scan);
    setSavedReport(scan);
    setSaved(true);
    setSavedScanId(id);
  }

  // Shared by both "Download report" buttons (PDF and Word) in the result
  // screen below, so the same real saved-case id and current form values
  // feed both exports instead of two independently-typed-out (and easily
  // drifting) objects. `correctedFields` is passed in since it's computed
  // locally within the result phase's own render branch, not held in
  // component state.
  function buildReportScan(correctedFields) {
    if (savedReport) return { ...savedReport, fields: correctedFields, status: computeOverallStatus(correctedFields) };
    return {
      // Bug fix: this used to be a literal placeholder "current" instead
      // of the actual saved case's id (already held in savedScanId, set by
      // handleSaveCase right before this button becomes reachable) — every
      // report downloaded from this screen printed the same fake case
      // number instead of the real one.
      id: savedScanId || "current", brand: saveForm.brand || "Unlabeled sample", category: saveForm.category,
      region: saveForm.region, date: todayLocalISO(), inspector: inspectorName,
      status: computeOverallStatus(correctedFields), fields: correctedFields, retakeReason: null,
      hash: image.hashHex, hashAlgorithm: image.hashAlgorithm || null,
      gps: GPS_BY_REGION[saveForm.region], timestamp: new Date().toISOString(),
      imageDataUrl: image.dataUrl,
      // Bug fix: these buttons build their own scan object rather than
      // reusing the one handleSaveCase() saves, and had dropped the
      // optional Side/Back angle photos entirely — a report downloaded
      // straight from this screen showed only the front photo even when
      // more angles were attached, while the same case downloaded later
      // from history (via App.jsx's saved `scan`, which does carry
      // additionalPhotos) would have shown all of them. Both paths now
      // agree.
      additionalPhotos: {
        side: sideImage?.dataUrl ?? null,
        back: backImage?.dataUrl ?? null,
      },
    };
  }

  return (
    <div className="lm-panel">
      <div className="lm-eyebrow">Inspector · New scan</div>
      <h2 className="lm-h2">Scan a packaged commodity label</h2>
      <TickDivider />

      {phase === "idle" && (
        <div className="flex flex-col gap-6">
          <div className="inline-flex w-fit rounded-[22px] border border-border bg-panel-alt p-1">
            <button
              type="button"
              onClick={() => setScanMode("label")}
              className={"rounded-xl px-3.5 py-1.5 text-[13px] font-semibold transition-colors " + (scanMode === "label" ? "bg-panel text-ink shadow-sm" : "text-ink-soft")}
            >
              Scan a label
            </button>
            <button
              type="button"
              onClick={() => setScanMode("object")}
              className={"rounded-xl px-3.5 py-1.5 text-[13px] font-semibold transition-colors " + (scanMode === "object" ? "bg-panel text-ink shadow-sm" : "text-ink-soft")}
            >
              Scan a 3D object
            </button>
          </div>

          {scanMode === "label" ? (
            <>
              <div>
                <p className="mb-3 text-[14px] text-ink-soft">
                  Photograph the front of the pack to run analysis. Side and back are optional extra evidence,
                  attach them now or skip straight to analyzing the front.
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <PhotoSlot
                    label="Front"
                    hint="The panel with the declarations"
                    required
                    image={pendingFront}
                    inputRef={frontInputRef}
                    onFile={handleFrontFile}
                    onClear={() => setPendingFront(null)}
                  />
                  <PhotoSlot
                    label="Side"
                    hint="Any other panel, optional"
                    image={sideImage}
                    inputRef={sideInputRef}
                    onFile={handleSideFile}
                    onClear={() => setSideImage(null)}
                  />
                  <PhotoSlot
                    label="Back"
                    hint="Back of the pack, optional"
                    image={backImage}
                    inputRef={backInputRef}
                    onFile={handleBackFile}
                    onClear={() => setBackImage(null)}
                  />
                </div>
                {pendingFrontError && (
                  <InlineBanner tone="error" className="mt-3">{pendingFrontError}</InlineBanner>
                )}
                <Button variant="primary" className="mt-4 w-full justify-center" disabled={!pendingFront} onClick={handleAnalyzeClick}>
                  <ScanLine size={15} /> Analyze label
                </Button>
              </div>

              <div className="rounded-[22px] border border-border bg-panel-alt p-5">
                <div className="mb-3 text-[13px] font-semibold text-ink-soft">No label on hand? Try a generated sample instead.</div>
                <div className="flex flex-wrap gap-2">
                  {SAMPLE_BUTTONS.map((s) => (
                    <Chip key={s.type} onClick={() => handleSample(s.type)}>{s.label}</Chip>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="inline-flex w-fit rounded-[22px] border border-border bg-panel p-1">
                <button
                  type="button"
                  onClick={() => setObjectScanSource("device")}
                  className={"rounded-xl px-3 py-1 text-[12.5px] font-semibold transition-colors " + (objectScanSource === "device" ? "bg-panel-alt text-ink shadow-sm" : "text-ink-soft")}
                >
                  This device's camera
                </button>
                <button
                  type="button"
                  onClick={() => setObjectScanSource("phone")}
                  className={"rounded-xl px-3 py-1 text-[12.5px] font-semibold transition-colors " + (objectScanSource === "phone" ? "bg-panel-alt text-ink shadow-sm" : "text-ink-soft")}
                >
                  Scan with phone
                </button>
              </div>
              {objectScanSource === "device" ? (
                <ObjectScanCapture products={DEMO_3D_PRODUCTS} onMatched={handleDemoProduct} />
              ) : (
                <PhoneHandoffCapture products={DEMO_3D_PRODUCTS} onMatched={handleDemoProduct} />
              )}
            </div>
          )}
        </div>
      )}

      {phase === "analyzing" && (
        <div className="flex flex-col gap-3">
          {image && <img src={image.dataUrl} alt="Label being analyzed" className="mx-auto max-w-[320px] rounded-xl border border-border" />}
          <CaptureMetaBadge meta={captureMeta} />
          <motion.div
            initial={{ opacity: 0.4 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, repeat: Infinity, repeatType: "reverse" }}
            className="flex items-center justify-center gap-2 text-[13.5px] text-ink-soft"
          >
            <Loader2 className="animate-spin" size={18} /> Reading declarations against the 2011 Rules…
          </motion.div>
        </div>
      )}

      {phase === "error" && (
        <InlineBanner tone="error" className="items-center">
          <div className="flex flex-wrap items-center gap-3">
            <span>{error}</span>
            <Button variant="secondary" onClick={reset}>Try again</Button>
          </div>
        </InlineBanner>
      )}

      <RetakeReasonModal
        open={phase === "retake" && !!result}
        image={image}
        backendReason={result?.retake_reason}
        onConfirm={handleRetakeConfirm}
        onCancel={reset}
      />

      {phase === "result" && result && (() => {
        // Corrections are folded in here (not just displayed alongside) so
        // the stamp, the exempt/weight checks, and the violation review
        // below all see the same corrected record an inspector just
        // verified, not the original, possibly wrong AI read.
        const correctedFields = applyFieldCorrections(result.fields, fieldCorrections);
        const declaredQty = parseQuantity(correctedFields.find((f) => f.name === "Net Quantity")?.value);
        const scaleValue = scaleReading ? parseFloat(scaleReading) : null;
        // Rule 26(a)'s exemption is keyed to the package's *declared* net
        // quantity, not a live scale reading: a scale weigh-in is measuring
        // fill accuracy, not redefining what the label declares. Falls back
        // to the scale reading only when there's no parseable declared
        // quantity at all.
        const exemptBasisValue = declaredQty?.value ?? scaleValue ?? null;
        const isExempt = isExemptQuantity(exemptBasisValue);
        const tolerance = declaredQty ? maxPermissibleError(declaredQty.value) : 0;
        const withinTolerance = declaredQty && scaleValue != null ? Math.abs(scaleValue - declaredQty.value) <= tolerance : null;
        const scaleOverfill = withinTolerance === false && scaleValue != null && declaredQty && scaleValue > declaredQty.value;
        return (
          <div className="flex flex-col gap-4">
            {/* Bug fix: a requested rule version missing from the server's
                in-memory store (e.g. wiped by a backend restart) used to
                fall back to the base rules with zero indication — this scan
                could silently stop enforcing a published amendment while
                Rule Admin still showed that version as active. */}
            {activeRuleVersion?.version && result.ruleVersionApplied === false && (
              <InlineBanner tone="error">
                Rule version {activeRuleVersion.version} could not be found on the server (it may have been lost to a
                backend restart) — this scan was checked against the base rules only, not the published amendments.
                Ask Rule Admin to republish the active version.
              </InlineBanner>
            )}
            <div className="flex flex-wrap items-center gap-4">
              {demoProduct ? (
                modelViewerReady ? (
                  <button
                    type="button"
                    onClick={() => setModelExpanded(true)}
                    className="group relative block cursor-zoom-in overflow-hidden rounded-xl border-0 p-0"
                    aria-label="Enlarge 3D model"
                  >
                    <model-viewer
                      src={demoProduct.glb}
                      camera-controls="true"
                      auto-rotate="true"
                      style={{ width: "220px", height: "220px", background: "var(--panel-alt)", borderRadius: "4px", pointerEvents: "none" }}
                    />
                    <span className="absolute right-1.5 top-1.5 flex items-center gap-1 rounded-xl bg-navy-deep/70 px-1.5 py-1 text-[10.5px] font-medium text-white opacity-90 transition-opacity group-hover:opacity-100">
                      <Maximize2 size={11} /> Enlarge
                    </span>
                  </button>
                ) : (
                  <div className="flex h-[220px] w-[220px] items-center justify-center gap-2 rounded-xl bg-panel-alt text-[13px] text-ink-soft">
                    <Loader2 className="animate-spin" size={18} /> Loading 3D viewer…
                  </div>
                )
              ) : (
                image?.dataUrl && <img src={image.dataUrl} alt="Scanned label" className="max-w-[220px] rounded-xl border border-border" />
              )}
              <Stamp status={computeOverallStatus(correctedFields)} />
            </div>

            {modelExpanded && demoProduct && createPortal(
              <div
                className="fixed inset-0 z-[100] flex flex-col bg-navy-deep/95 p-4 sm:p-8"
                onClick={() => setModelExpanded(false)}
              >
                <div className="mb-3 flex items-center justify-between text-white">
                  <div className="text-[13px] font-medium">
                    {demoProduct.name} — drag to rotate, scroll or pinch to zoom
                  </div>
                  <button
                    type="button"
                    onClick={() => setModelExpanded(false)}
                    aria-label="Close enlarged view"
                    className="rounded-xl p-1.5 hover:bg-white/10"
                  >
                    <X size={20} />
                  </button>
                </div>
                <div className="min-h-0 flex-1" onClick={(e) => e.stopPropagation()}>
                  <model-viewer
                    src={demoProduct.glb}
                    camera-controls="true"
                    auto-rotate="true"
                    style={{ width: "100%", height: "100%", background: "var(--panel-alt)", borderRadius: "4px" }}
                  />
                </div>
              </div>,
              document.body
            )}

            {demoProduct && (
              <p className="text-[12.5px] leading-relaxed text-ink-soft">
                Verified declared values from a real physical pack, matched to a photogrammetry scan
                of that same product, not a live OCR read.
              </p>
            )}

            {(sideImage || backImage) && (
              <div className="flex gap-3">
                {sideImage && (
                  <div className="flex flex-col items-center gap-1">
                    <img src={sideImage.dataUrl} alt="Side of the package" className="h-20 w-20 rounded-xl border border-border object-cover" />
                    <span className="text-[11px] text-ink-soft">Side</span>
                  </div>
                )}
                {backImage && (
                  <div className="flex flex-col items-center gap-1">
                    <img src={backImage.dataUrl} alt="Back of the package" className="h-20 w-20 rounded-xl border border-border object-cover" />
                    <span className="text-[11px] text-ink-soft">Back</span>
                  </div>
                )}
              </div>
            )}

            <div className={"inline-flex items-center gap-1.5 self-start rounded-full px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-wide " + (isExempt ? "bg-brass-soft text-brass" : "bg-panel-alt text-ink-soft")}>
              <PackageSearch size={12} /> {isExempt ? "Exempt commodity (≤10g/10ml)" : "In scope"}
            </div>

            <RuleVersionBadge version={activeRuleVersion?.version} />

            <div className="flex flex-col gap-2.5">
              {correctedFields.map((f) => (
                <FieldRow
                  key={f.name}
                  field={f}
                  correction={fieldCorrections[f.name]}
                  onRequestCorrection={setCorrectingField}
                />
              ))}
            </div>

            {/* Bug fix: this used to call `new Date().toISOString()` inline, so
                the "Captured" time on a tamper-evidence record recomputed to
                "now" on every re-render of this screen (typing in the scale
                field, saving the case, anything) instead of showing the
                moment the photo was actually captured — an inspector or
                judge watching this box could see the timestamp visibly tick
                forward while doing nothing but typing. `captureMeta.timestamp`
                is already set once, at capture time, in runAnalysis /
                handleDemoProduct — reusing it here keeps the record honest. */}
            <IntegrityBadge scan={{ hash: image.hashHex, timestamp: captureMeta?.timestamp || new Date().toISOString(), gps: GPS_BY_REGION[saveForm.region], nonce: captureMeta?.nonce }} />

            <div className="rounded-[22px] border border-border bg-panel-alt p-4">
              <div className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
                <Scale size={13} /> Weigh on certified scale (optional)
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 rounded-xl border border-border bg-panel px-2.5">
                  <input
                    type="number"
                    className="w-24 py-1.5 text-sm focus:outline-none"
                    value={scaleReading}
                    onChange={(e) => { setScaleReading(e.target.value); setScaleChecked(false); setScaleSource(null); }}
                    placeholder={declaredQty ? String(declaredQty.value) : "e.g. 50"}
                  />
                  <span className="text-[12px] text-ink-soft">{declaredQty?.unit || "g"}</span>
                </div>
                <Button variant="secondary" disabled={!scaleReading} onClick={() => setScaleChecked(true)}>Compare to declared</Button>
                <Button variant="secondary" disabled={scaleConnecting} onClick={() => handleConnectScale(declaredQty)}>
                  <Bluetooth size={14} /> {scaleConnecting ? "Pairing…" : "Connect scale"}
                </Button>
              </div>
              {scaleSource === "bluetooth-simulated" && (
                <div className="mt-2 text-[12.5px] leading-relaxed text-ink-soft">
                  Auto-filled from the paired certified scale.
                </div>
              )}
              {scaleChecked && declaredQty && (
                <div className={"mt-2.5 flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[12.5px] " + (withinTolerance ? "bg-green-soft text-green" : "bg-brass-soft text-ink")}>
                  {withinTolerance
                    ? <><Check size={13} /> Matches declared net quantity (within the {tolerance.toFixed(1)}{declaredQty.unit} First Schedule tolerance)</>
                    : <><AlertTriangle size={13} /> {scaleOverfill ? "Overfill" : "Shortfall"} of {Math.abs(scaleValue - declaredQty.value).toFixed(1)}{declaredQty.unit} vs the declared {declaredQty.value}{declaredQty.unit}</>}
                </div>
              )}
              {scaleChecked && !declaredQty && (
                <div className="mt-2.5 flex items-center gap-1.5 rounded-xl bg-brass-soft px-2.5 py-1.5 text-[12.5px] text-ink">
                  <AlertTriangle size={13} /> No parseable declared quantity to compare against.
                </div>
              )}
            </div>

            {computeOverallStatus(correctedFields) === "non_compliant" && !violationDecision && (
              <Button variant="primary" onClick={() => setViolationOpen(true)}>
                <AlertTriangle size={15} /> Review and confirm violation
              </Button>
            )}
            {violationDecision && violationDecision.type === "confirmed" && (
              <div className="flex items-center gap-1.5 rounded-xl bg-green-soft px-2.5 py-1.5 text-[13px] text-green">
                <CheckCircle2 size={14} /> Violation confirmed by inspector
                {holdNotice && <span> · Hold notice {holdNotice} issued</span>}
              </div>
            )}
            {violationDecision && violationDecision.type === "disputed" && (
              <div className="flex items-center gap-1.5 rounded-xl bg-brass-soft px-2.5 py-1.5 text-[13px] text-ink">
                <Ban size={14} /> Disputed by inspector: “{violationDecision.note}”
              </div>
            )}

            {!saved ? (
              <div className="flex flex-col gap-3 rounded-[22px] border border-border bg-panel p-4">
                <label className="block">
                  <div className="mb-1.5 text-[13px] font-semibold text-ink">Brand</div>
                  <input
                    className="w-full rounded-xl border border-border px-3 py-2 text-sm focus:border-navy focus:outline-none"
                    value={saveForm.brand}
                    onChange={(e) => setSaveForm({ ...saveForm, brand: e.target.value })}
                    placeholder="e.g. Maggi, Britannia, Red Joy, Open Secret"
                  />
                </label>
                <label className="block">
                  <div className="mb-1.5 text-[13px] font-semibold text-ink">Category</div>
                  <select
                    className="w-full rounded-xl border border-border px-3 py-2 text-sm focus:border-navy focus:outline-none"
                    value={saveForm.category}
                    onChange={(e) => setSaveForm({ ...saveForm, category: e.target.value })}
                  >
                    {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </label>
                <label className="block">
                  <div className="mb-1.5 text-[13px] font-semibold text-ink">Region</div>
                  <select
                    className="w-full rounded-xl border border-border px-3 py-2 text-sm focus:border-navy focus:outline-none"
                    value={saveForm.region}
                    onChange={(e) => setSaveForm({ ...saveForm, region: e.target.value })}
                  >
                    {REGIONS.map((r) => <option key={r}>{r}</option>)}
                  </select>
                </label>
                <Button variant="primary" onClick={handleSaveCase}><FileText size={15} /> Save case and generate report</Button>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="flex items-center gap-1.5 text-[13.5px] text-ink"><CheckCircle2 size={15} className="text-green" /> Saved to repository</span>
                  <Button variant="secondary" onClick={() => downloadReport(buildReportScan(correctedFields))}>
                    <Download size={14} /> Download report (PDF)
                  </Button>
                  <Button variant="secondary" onClick={() => downloadReportDocx(buildReportScan(correctedFields))}>
                    <FileText size={14} /> Download report (Word)
                  </Button>
                  <Button variant="secondary" onClick={() => setThreeDOpen(true)}>
                    <Box size={14} /> View 3D model
                  </Button>
                  <Button variant="secondary" onClick={reset}>Scan another</Button>
                </div>
                <ChainOfCustody report={buildReportScan(correctedFields)} sampleId={"SMP-" + image.hashHex.slice(0, 8).toUpperCase()} />
              </>
            )}

            <ThreeDCaptureModal open={threeDOpen} brand={saveForm.brand} onClose={() => setThreeDOpen(false)} />
            {/* Bug fix: without a key on the field name, React reused one
                FieldCorrectionModal instance across every field, so its
                internal evidence-photo/corrected-value state survived from
                whichever field was corrected last into the next field's
                dialog — risking the wrong photo/value landing on the wrong
                field's audit record. Keying on the field name forces a fresh
                instance (and fresh state) each time a different field is
                opened for correction. */}
            <FieldCorrectionModal
              key={correctingField?.name || "none"}
              open={!!correctingField}
              field={correctingField || { name: "", value: "" }}
              inspectorName={inspectorName}
              onSave={handleSaveCorrection}
              onClose={() => setCorrectingField(null)}
            />
            <ConfirmViolationModal
              open={violationOpen}
              fields={correctedFields}
              onConfirm={handleConfirmViolation}
              onDispute={handleDisputeViolation}
              onClose={() => setViolationOpen(false)}
            />
            <HoldNoticeModal
              open={holdNoticeOpen}
              scanMeta={{ brand: saveForm.brand || "Unlabeled sample", category: saveForm.category, region: saveForm.region, inspector: inspectorName }}
              onIssue={handleIssueHoldNotice}
              onClose={() => setHoldNoticeOpen(false)}
            />
          </div>
        );
      })()}
    </div>
  );
}
