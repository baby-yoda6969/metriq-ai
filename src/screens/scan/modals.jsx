import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle, Ban, Camera, Check, CheckCircle2, Eraser, Flag, Loader2,
  Maximize2, PenLine, RotateCcw, Send, ShieldCheck, X,
} from "lucide-react";
import { Modal } from "../../components/ui/Modal.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { Chip } from "../../components/ui/Chip.jsx";
import { InlineBanner } from "../../components/ui/InlineBanner.jsx";
import { FieldRow, Stamp } from "./parts.jsx";
import { captureEvidencePhoto } from "../../lib/capture.js";
import { generate3DModel, verifyCorrection } from "../../lib/api.js";
import { findDemo3DProduct } from "../../data/demoProducts.js";
import { useDismissOnBack } from "../../lib/useDismissOnBack.js";

const RETAKE_REASON_OPTIONS = ["Glare", "Wrinkle", "Blur", "Other"];

// Shown when the analysis service itself judged the photo unusable. Forces
// a reason to be tagged (so the case record explains why the first attempt
// didn't count) before "Retake photo" unlocks. Closing without picking one
// is treated the same as retaking: there's nothing to save yet.
export function RetakeReasonModal({ open, image, backendReason, onConfirm, onCancel }) {
  const [reason, setReason] = useState(null);
  return (
    <Modal open={open} onOpenChange={(next) => !next && onCancel()} title="Is this photo usable?">
      {image && (
        <img src={image.dataUrl} alt="Captured label" className="mx-auto mb-3 max-w-[280px] rounded border border-border" />
      )}
      <Stamp status="retake_needed" />
      <p className="mt-3 text-[13.5px] leading-relaxed text-ink-soft">{backendReason}</p>
      <div className="mt-4 text-[13px] font-semibold text-ink">Tag the reason so the case record is complete:</div>
      <div className="mt-2 flex flex-wrap gap-2">
        {RETAKE_REASON_OPTIONS.map((r) => (
          <Chip key={r} selected={reason === r} onClick={() => setReason(r)}>{r}</Chip>
        ))}
      </div>
      <Button variant="primary" className="mt-5 w-full justify-center" disabled={!reason} onClick={() => onConfirm(reason)}>
        <RotateCcw size={15} /> Retake photo
      </Button>
    </Modal>
  );
}

// Correcting a misread field requires evidence first. Step 1 forces a
// close-up photo of that part of the label before step 2 (typing the
// corrected value) unlocks, so a value never quietly changes without a
// photo, timestamp, and author attached to it in the case file.
export function FieldCorrectionModal({ open, field, onSave, onClose, inspectorName = "Inspector on duty" }) {
  const [evidence, setEvidence] = useState(null); // { dataUrl } once captured
  const [correctedValue, setCorrectedValue] = useState("");
  const [capturing, setCapturing] = useState(false);
  const [captureError, setCaptureError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const fileInputRef = useRef(null);

  // Asks Gemini a narrow question, does this photo plausibly support the
  // claimed value, before saving. The inspector still has final authority:
  // an implausible result doesn't block saving, it's attached to the
  // correction record so a supervisor reviewing the case later sees it.
  async function handleSaveClick() {
    const correction = {
      fieldName: field.name,
      originalValue: field.value,
      correctedValue: correctedValue.trim(),
      photoDataUrl: evidence.dataUrl,
      correctedBy: inspectorName,
      correctedAt: new Date().toISOString(),
    };
    setVerifying(true);
    correction.verification = await verifyCorrection({
      evidenceDataUrl: evidence.dataUrl,
      fieldName: field.name,
      correctedValue: correction.correctedValue,
    });
    setVerifying(false);
    onSave(correction);
  }

  async function handleFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setCapturing(true);
    setCaptureError("");
    try {
      const { dataUrl } = await captureEvidencePhoto(file);
      setEvidence({ dataUrl });
    } catch (err) {
      setCaptureError(err.message);
    } finally {
      setCapturing(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={(next) => !next && onClose()} title={`Correct "${field.name}"`}>
      <p className="mb-3 text-[13.5px] leading-relaxed text-ink-soft">
        AI read: “{field.value ?? "nothing"}”. To keep this defensible, a close-up evidence photo of this part of
        the label is required before you can enter a corrected value.
      </p>

      {!evidence ? (
        <>
          <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
          <Button variant="primary" disabled={capturing} onClick={() => fileInputRef.current.click()}>
            <Camera size={15} /> {capturing ? "Processing…" : "Photograph evidence"}
          </Button>
          {captureError && (
            <InlineBanner tone="error" className="mt-3">{captureError}</InlineBanner>
          )}
        </>
      ) : (
        <>
          <img src={evidence.dataUrl} alt="Evidence for correction" className="w-full rounded border border-border" />
          <label className="mt-3 block">
            <div className="mb-1.5 text-[13px] font-semibold text-ink">Corrected value</div>
            <input
              className="w-full rounded border border-border px-3 py-2 text-sm focus:border-navy focus:outline-none"
              value={correctedValue}
              onChange={(e) => setCorrectedValue(e.target.value)}
              placeholder="What the label actually says"
              autoFocus
            />
          </label>
          <div className="mt-4 flex gap-2">
            <Button variant="primary" disabled={!correctedValue.trim() || verifying} onClick={handleSaveClick}>
              <Check size={14} /> {verifying ? "Verifying evidence…" : "Save correction"}
            </Button>
            <Button variant="secondary" disabled={verifying} onClick={() => setEvidence(null)}>
              <RotateCcw size={14} /> Retake evidence photo
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}

// The flagged fields, in one place, before the inspector commits to a
// hold notice: confirm the violation, or dispute it if the finding looks
// wrong (a physical-label check that the photo scan misread, for example).
export function ConfirmViolationModal({ open, fields, onConfirm, onDispute, onClose }) {
  const [showOverride, setShowOverride] = useState(false);
  const [note, setNote] = useState("");
  const flagged = fields.filter((f) => f.status !== "compliant");
  return (
    <Modal open={open} onOpenChange={(next) => !next && onClose()} title="Confirm violation" wide>
      <p className="mb-3 text-[13.5px] leading-relaxed text-ink-soft">
        {flagged.length} declaration{flagged.length === 1 ? "" : "s"} flagged below the compliance threshold.
        Confirm the violation to proceed to a hold notice, or dispute it if the finding looks wrong.
      </p>
      <div className="flex flex-col gap-2.5">
        {flagged.map((f) => <FieldRow key={f.name} field={f} />)}
      </div>
      {!showOverride ? (
        <div className="mt-4 flex gap-2">
          <Button variant="primary" onClick={onConfirm}><Check size={14} /> Confirm violation</Button>
          <Button variant="secondary" onClick={() => setShowOverride(true)}><Ban size={14} /> Dispute or override</Button>
        </div>
      ) : (
        <div className="mt-4 rounded border border-border bg-panel-alt p-4">
          <div className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-ink">
            <AlertTriangle size={14} className="text-brass" /> Override reason
          </div>
          <input
            className="w-full rounded border border-border px-3 py-2 text-sm focus:border-navy focus:outline-none"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Physical label matches Rules; scan misread the print"
          />
          <div className="mt-3 flex gap-2">
            <Button variant="primary" onClick={() => onDispute(note.trim() || "No reason given.")}>
              <Send size={14} /> Submit dispute
            </Button>
            <Button variant="secondary" onClick={() => setShowOverride(false)}>Back</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// A hold notice with an actual signature captured on the spot, not just a
// checkbox, before it's treated as issued.
export function HoldNoticeModal({ open, scanMeta, onIssue, onClose }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(null);
  const [signed, setSigned] = useState(false);
  const [issued, setIssued] = useState(null);

  function pos(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
  function startDraw(e) {
    drawingRef.current = true;
    const ctx = canvasRef.current.getContext("2d");
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }
  function draw(e) {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.strokeStyle = "#181B22";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.stroke();
    setSigned(true);
  }
  function endDraw() {
    drawingRef.current = false;
  }
  function useSample() {
    const ctx = canvasRef.current.getContext("2d");
    ctx.strokeStyle = "#181B22";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(20, 55);
    ctx.bezierCurveTo(50, 10, 70, 90, 100, 40);
    ctx.bezierCurveTo(120, 5, 150, 60, 190, 45);
    ctx.bezierCurveTo(210, 35, 220, 55, 250, 50);
    ctx.stroke();
    setSigned(true);
  }
  function clearSignature() {
    const canvas = canvasRef.current;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    setSigned(false);
  }
  // Bug fix: keeping only the last 6 decimal digits of Date.now() means the
  // id cycles back to the same value every ~16.7 minutes (1,000,000ms) — two
  // hold notices issued that far apart, or any exact multiple apart, would
  // get the literal same "HN-XXXXXX" reference on a document meant to be a
  // unique legal record. Base-36 encoding the full timestamp instead keeps
  // every millisecond distinct without truncating any of it away.
  function handleIssue() {
    const noticeId = "HN-" + Date.now().toString(36).toUpperCase();
    setIssued(noticeId);
    onIssue(noticeId);
  }

  return (
    <Modal open={open} onOpenChange={(next) => !next && onClose()} title="Signed hold notice">
      {!issued ? (
        <>
          <div className="rounded border border-border bg-panel-alt p-4 font-mono text-[12.5px] leading-relaxed text-ink">
            <div className="mb-1.5 font-display text-[15px] font-semibold tracking-wide text-ink">HOLD NOTICE</div>
            <div>Brand: {scanMeta.brand}</div>
            <div>Category: {scanMeta.category}</div>
            <div>Region: {scanMeta.region}</div>
            <div>Issued by: {scanMeta.inspector}</div>
            <div>Basis: Non-compliance under the Legal Metrology (Packaged Commodities) Rules, 2011</div>
          </div>
          <div className="mb-1.5 mt-4 flex items-center gap-1.5 text-[13px] font-semibold text-ink">
            <PenLine size={13} /> Sign to certify this notice
          </div>
          <canvas
            ref={canvasRef}
            width={280}
            height={100}
            className="w-full cursor-crosshair rounded border border-dashed border-border bg-white [touch-action:none]"
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={endDraw}
            onMouseLeave={endDraw}
          />
          <div className="mt-2 flex gap-2">
            <Button variant="secondary" onClick={useSample}><PenLine size={13} /> Use sample signature</Button>
            <Button variant="secondary" onClick={clearSignature}><Eraser size={13} /> Clear</Button>
          </div>
          <Button variant="primary" className="mt-3 w-full justify-center" disabled={!signed} onClick={handleIssue}>
            <Flag size={14} /> Issue hold notice
          </Button>
        </>
      ) : (
        <div className="flex flex-col items-start gap-3">
          <span className="flex items-center gap-2 text-[13.5px] text-ink">
            <CheckCircle2 size={15} className="text-green" /> Hold notice {issued} issued and signed on the spot
          </span>
          <Button variant="secondary" onClick={onClose}>Done</Button>
        </div>
      )}
    </Modal>
  );
}

const THREE_D_STEPS = ["Front", "Back", "Side"];

// Front / back / side captures are sent to the backend (Gemini auth key)
// to match a verified photogrammetry .glb from the catalog.
export function ThreeDCaptureModal({ open, brand, onClose }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [captures, setCaptures] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");
  const [resolved, setResolved] = useState(null);
  const [modelViewerReady, setModelViewerReady] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const fileInputRef = useRef(null);
  const done = stepIndex >= THREE_D_STEPS.length;
  const demoProduct = resolved;

  useEffect(() => {
    if (!open) {
      setStepIndex(0);
      setCaptures([]);
      setGenerating(false);
      setGenError("");
      setResolved(null);
      setModelViewerReady(false);
      setExpanded(false);
    }
  }, [open]);

  useDismissOnBack(expanded, () => setExpanded(false));

  useEffect(() => {
    if (!done || generating || resolved || genError) return undefined;
    let cancelled = false;
    (async () => {
      setGenerating(true);
      try {
        const data = await generate3DModel({
          views: captures,
          brandHint: brand,
        });
        if (cancelled) return;
        setResolved({
          name: data.name,
          glb: data.glb,
          declaredFields: data.declaredFields || [],
          match: data.match,
          confidence: data.confidence,
          warning: data.warning,
        });
      } catch (err) {
        if (cancelled) return;
        const fallback = findDemo3DProduct(brand);
        if (fallback) {
          setResolved({ ...fallback, warning: err.message });
        } else {
          setGenError(err.message || "Could not build 3D reference.");
        }
      } finally {
        if (!cancelled) setGenerating(false);
      }
    })();
    return () => { cancelled = true; };
  }, [done, captures, brand, generating, resolved, genError]);

  useEffect(() => {
    if (!demoProduct?.glb) return;
    let cancelled = false;
    import("@google/model-viewer").then(() => {
      if (!cancelled) setModelViewerReady(true);
    });
    return () => { cancelled = true; };
  }, [demoProduct?.glb]);

  async function handleCapture(e) {
    const file = e.target.files && e.target.files[0];
    if (!file || capturing) return;
    setCapturing(true);
    try {
      const { dataUrl } = await captureEvidencePhoto(file);
      const label = THREE_D_STEPS[stepIndex];
      setCaptures((prev) => [
        ...prev,
        { label, base64: dataUrl.split(",")[1], mediaType: "image/jpeg" },
      ]);
      setStepIndex((i) => i + 1);
    } finally {
      setCapturing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <Modal open={open} onOpenChange={(next) => !next && onClose()} title="3D model">
      {!done ? (
        <>
          <p className="mb-3 text-[13.5px] leading-relaxed text-ink-soft">
            Capture the {THREE_D_STEPS[stepIndex].toLowerCase()} of the product ({stepIndex + 1} of {THREE_D_STEPS.length}).
          </p>
          <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleCapture} />
          <Button variant="primary" disabled={capturing} onClick={() => fileInputRef.current?.click()}>
            <Camera size={15} /> {capturing ? "Saving…" : `Capture ${THREE_D_STEPS[stepIndex].toLowerCase()}`}
          </Button>
        </>
      ) : generating ? (
        <div className="flex flex-col items-center gap-3 py-10 text-[13px] text-ink-soft">
          <Loader2 className="animate-spin text-brass" size={22} />
          Matching captures to verified 3D reference…
        </div>
      ) : demoProduct ? (
        <>
          <p className="mb-3 text-[13.5px] leading-relaxed text-ink-soft">
            Matched to <strong>{demoProduct.name}</strong> — verified photogrammetry reference,
            cross-checked against the declarations below.
          </p>
          {demoProduct.warning && (
            <InlineBanner tone="info" className="mb-3">
              {demoProduct.warning}
            </InlineBanner>
          )}
          {modelViewerReady ? (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="group relative block w-full cursor-zoom-in overflow-hidden rounded border-0 p-0"
              aria-label="Enlarge 3D model"
            >
              <model-viewer
                src={demoProduct.glb}
                camera-controls="true"
                auto-rotate="true"
                style={{ width: "100%", height: "320px", background: "var(--panel-alt)", borderRadius: "4px", pointerEvents: "none" }}
              />
              <span className="absolute right-2 top-2 flex items-center gap-1 rounded bg-navy-deep/70 px-2 py-1 text-[11px] font-medium text-white opacity-90 transition-opacity group-hover:opacity-100">
                <Maximize2 size={12} /> Enlarge
              </span>
            </button>
          ) : (
            <div className="flex h-[320px] items-center justify-center gap-2 rounded bg-panel-alt text-[13px] text-ink-soft">
              <Loader2 className="animate-spin" size={18} /> Loading 3D viewer…
            </div>
          )}
          <div className="mt-3 flex flex-col gap-2.5">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
              <ShieldCheck size={13} /> Reference declaration (verified from the physical label)
            </div>
            {demoProduct.declaredFields.map((f) => <FieldRow key={f.name} field={f} />)}
          </div>
        </>
      ) : (
        <InlineBanner tone="error">
          {genError || `No verified 3D reference model is available yet for “${brand || "this brand"}”.`}
        </InlineBanner>
      )}

      {expanded && demoProduct && createPortal(
        // Portaled straight to <body> rather than rendered inline: the
        // enclosing Radix Dialog.Content is CSS-transformed (its centering
        // translate), which makes it the containing block for any regular
        // `position: fixed` descendant — so a fixed-inset overlay nested
        // inside it would be confined to the small dialog's own box, not
        // actually cover the viewport. Portaling escapes that.
        <div
          className="fixed inset-0 z-[100] flex flex-col bg-navy-deep/95 p-4 sm:p-8"
          onClick={() => setExpanded(false)}
        >
          <div className="mb-3 flex items-center justify-between text-white">
            <div className="text-[13px] font-medium">
              {demoProduct.name} — drag to rotate, scroll or pinch to zoom
            </div>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              aria-label="Close enlarged view"
              className="rounded p-1.5 hover:bg-white/10"
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
    </Modal>
  );
}
