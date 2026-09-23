import { useEffect, useRef } from "react";
import {
  AlertTriangle, CheckCircle2, Clock, Fingerprint as FingerprintIcon, Hash, MapPin,
  PenLine, QrCode, ScrollText, ShieldCheck, XCircle,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Badge } from "../../components/ui/Badge.jsx";
import { hashSeed } from "../../lib/hash.js";
import { RULE_CITATIONS } from "../../data/citations.js";

// The rotated double-border "stamp" look on a fresh verdict: a deliberate
// physical-document flourish (not a generic status pill, see Badge for
// that), so it keeps its own bespoke styling rather than becoming a Badge
// variant.
const STAMP_CONFIG = {
  compliant: { label: "COMPLIANT", className: "text-green border-green" },
  non_compliant: { label: "NON-COMPLIANT", className: "text-red border-red" },
  retake_needed: { label: "RETAKE REQUIRED", className: "text-brass border-brass" },
  pack: { label: "3D PACK", className: "text-brass border-brass" },
};

export function Stamp({ status }) {
  const reduceMotion = useReducedMotion();
  const cfg = STAMP_CONFIG[status];
  return (
    <motion.div
      initial={reduceMotion ? undefined : { opacity: 0, scale: 1.7 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
      className={
        "inline-block -rotate-[4deg] rounded-xl border-[3px] border-double px-4 py-2 font-display text-lg font-bold tracking-wide " +
        cfg.className
      }
    >
      {cfg.label}
    </motion.div>
  );
}

export function StatusIcon({ status, size = 16 }) {
  if (status === "compliant") return <CheckCircle2 size={size} className="text-green" />;
  if (status === "retake_needed") return <AlertTriangle size={size} className="text-brass" />;
  return <XCircle size={size} className="text-red" />;
}

const FIELD_BADGE_TONE = {
  compliant: "compliant",
  non_compliant: "non-compliant",
  missing: "non-compliant",
};

export function FieldRow({ field, correction, onRequestCorrection }) {
  const citation = RULE_CITATIONS[field.name];
  return (
    <div className="rounded-2xl border border-white/8 bg-panel p-4">
      <div className="flex items-center gap-2">
        <StatusIcon status={field.status === "compliant" ? "compliant" : "non_compliant"} />
        <span className="flex-1 text-sm font-semibold text-ink">{field.name}</span>
        <Badge tone={FIELD_BADGE_TONE[field.status] ?? "neutral"}>{field.status.replace("_", " ")}</Badge>
      </div>
      {field.value && <div className="mt-2 font-mono text-[12.5px] text-ink-soft">Read: {field.value}</div>}
      <div className="mt-1 text-[13px] leading-relaxed text-ink-soft">{field.explanation}</div>
      {citation && (
        <div className="mt-1.5 font-mono text-[11px] text-brass">{citation.rule}, {citation.act}</div>
      )}
      {correction ? (
        <div className="mt-2.5 flex items-center gap-1.5 rounded-xl bg-brass-soft px-2.5 py-1.5 text-[12.5px] text-ink">
          <PenLine size={12} /> Corrected by {correction.correctedBy} to “{correction.correctedValue}” (was “{correction.originalValue ?? "not set"}”)
        </div>
      ) : onRequestCorrection ? (
        <button
          type="button"
          onClick={() => onRequestCorrection(field)}
          className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-dashed border-border px-2.5 py-1 text-[12px] text-ink-soft transition-colors hover:border-brass hover:text-brass"
        >
          <PenLine size={12} /> This looks wrong
        </button>
      ) : null}
    </div>
  );
}

// Shown both on the live result screen and in CaseDetail: factored out so a
// future copy or style change (e.g. a tooltip, or a "not yet checked"
// state) only needs to happen in one place instead of two independently
// maintained copies.
export function RuleVersionBadge({ version, className }) {
  if (!version) return null;
  return (
    <Badge tone="caution" className={className}>
      <ScrollText size={12} /> Checked against rule {version}
    </Badge>
  );
}

// One shared box for both of ScanView's integrity readouts: `IntegrityBadge`
// (after analysis, with a hash) and `CaptureMetaBadge` (during analysis,
// before a hash exists). They used to be two near-duplicate components;
// this keeps one visual and one set of rows, varied by props.
function IntegrityBox({ label, rows, className }) {
  return (
    <div className={"rounded border border-border bg-panel-alt p-3 " + (className ?? "")}>
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
        <ShieldCheck size={12} /> {label}
      </div>
      <div className="mt-2 flex flex-col gap-1 font-mono text-[12px] text-ink">
        {rows}
      </div>
    </div>
  );
}

export function IntegrityBadge({ scan }) {
  return (
    <IntegrityBox
      label="Digital integrity record"
      rows={
        <>
          <div className="flex items-center gap-1.5"><Hash size={13} /><span title={scan.hash}>{scan.hash.slice(0, 16)}…</span></div>
          <div className="flex items-center gap-1.5"><Clock size={13} /><span>{new Date(scan.timestamp).toLocaleString("en-IN")}</span></div>
          <div className="flex items-center gap-1.5"><MapPin size={13} /><span>{scan.gps}</span></div>
          {scan.nonce && <div className="flex items-center gap-1.5"><FingerprintIcon size={13} /><span>On-screen nonce: {scan.nonce}</span></div>}
        </>
      }
    />
  );
}

// Shown the moment an inspection starts, before a hash exists (the image is
// still being analyzed): GPS, timestamp, and an on-screen nonce. Once
// analysis completes, this same data folds into IntegrityBadge above
// rather than showing twice.
export function CaptureMetaBadge({ meta }) {
  if (!meta) return null;
  return (
    <IntegrityBox
      label="Inspection started"
      className="mb-3.5"
      rows={
        <>
          <div className="flex items-center gap-1.5"><MapPin size={13} /><span>{meta.gps}</span></div>
          <div className="flex items-center gap-1.5"><Clock size={13} /><span>{new Date(meta.timestamp).toLocaleString("en-IN")}</span></div>
          <div className="flex items-center gap-1.5"><FingerprintIcon size={13} /><span>On-screen nonce: {meta.nonce}</span></div>
        </>
      }
    />
  );
}

// A visually plausible but purely decorative QR pattern, deterministically
// seeded so the same sample always renders the same "code": a demo
// stand-in, not a real scannable QR.
export function PseudoQR({ seed, size = 96 }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const cells = 14;
    const cellSize = size / cells;
    let h = hashSeed(seed || "sample") || 1;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#181B22";
    for (let y = 0; y < cells; y++) {
      for (let x = 0; x < cells; x++) {
        h = (Math.imul(h, 1103515245) + 12345) >>> 0;
        if (h % 2 === 0) ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
      }
    }
    function finder(px, py) {
      ctx.fillStyle = "#181B22";
      ctx.fillRect(px, py, cellSize * 3, cellSize * 3);
      ctx.fillStyle = "#fff";
      ctx.fillRect(px + cellSize * 0.5, py + cellSize * 0.5, cellSize * 2, cellSize * 2);
      ctx.fillStyle = "#181B22";
      ctx.fillRect(px + cellSize, py + cellSize, cellSize, cellSize);
    }
    finder(0, 0);
    finder(size - cellSize * 3, 0);
    finder(0, size - cellSize * 3);
  }, [seed, size]);
  return <canvas ref={canvasRef} width={size} height={size} className="rounded border border-border" />;
}

export function ChainOfCustody({ sampleId }) {
  return (
    <div className="flex gap-3 rounded border border-border bg-panel p-3">
      <PseudoQR seed={sampleId} />
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
          <QrCode size={13} /> Physical sample tag
        </div>
        <div className="mt-1 font-mono text-[13px] font-semibold text-ink">{sampleId}</div>
        <div className="mt-1 text-[12.5px] leading-relaxed text-ink-soft">Chain-of-custody tag for the physical sample sent to a government lab.</div>
      </div>
    </div>
  );
}
