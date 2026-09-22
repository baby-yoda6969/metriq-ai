import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, CheckCircle2, Clock, Fingerprint as FingerprintIcon, Hash, MapPin,
  PenLine, QrCode, ScrollText, ShieldCheck, XCircle,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Badge } from "../../components/ui/Badge.jsx";
import { sampleQr } from "../../lib/sampleQr.js";
import { RULE_CITATIONS } from "../../data/citations.js";

// The rotated double-border "stamp" look on a fresh verdict: a deliberate
// physical-document flourish (not a generic status pill, see Badge for
// that), so it keeps its own bespoke styling rather than becoming a Badge
// variant.
const STAMP_CONFIG = {
  compliant: { label: "COMPLIANT", className: "text-green border-green" },
  non_compliant: { label: "NON-COMPLIANT", className: "text-red border-red" },
  retake_needed: { label: "RETAKE REQUIRED", className: "text-brass border-brass" },
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
        "inline-block -rotate-[4deg] rounded-xl border-[3px] border-double px-4 py-2 font-display text-lg font-bold tracking-wide [mix-blend-mode:multiply] " +
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
    <div className="rounded-xl border border-border bg-panel p-4">
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
    <div className={"rounded-xl border border-border bg-panel-alt p-3 " + (className ?? "")}>
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

// The caller supplies the persisted report URL.
export function SampleQR({ sampleId, value = sampleId, size = 144 }) {
  const { extent, path } = useMemo(() => sampleQr(value), [value]);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${extent} ${extent}`}
      role="img" aria-label={`Scan sample ID ${sampleId}`}
      className="shrink-0" style={{ background: "#fff", aspectRatio: "1 / 1" }}
      shapeRendering="crispEdges">
      <rect width={extent} height={extent} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}

export function ChainOfCustody({ sampleId, report }) {
  const [link, setLink] = useState(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const snapshot = JSON.stringify(report);
  useEffect(() => {
    let active = true;
    setLink(null);
    setError("");
    if (!snapshot) return;
    fetch("/api/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: snapshot })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not create report link.");
        if (active) setLink(new URL(data.path, window.location.origin).href);
      }).catch(error => { if (active) setError(error.message); });
    return () => { active = false; };
  }, [snapshot, retry]);
  return (
    <div className="flex gap-3 rounded-xl border border-border bg-panel p-3">
      {link ? <a href={link} target="_blank" rel="noreferrer" aria-label="Open shared inspection report"><SampleQR sampleId={sampleId} value={link} /></a>
        : <div className="shrink-0 text-xs text-ink-soft" style={{ width: 144 }} role="status">{error ? "Report link unavailable" : "Creating report link…"}</div>}
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
          <QrCode size={13} /> Physical sample tag
        </div>
        <div className="mt-1 font-mono text-[13px] font-semibold text-ink">{sampleId}</div>
        <div className="mt-1 text-[12.5px] leading-relaxed text-ink-soft">Scan to open this inspection report. Anyone with the link can view this saved snapshot.</div>
        {link && <a className="mt-2 inline-block text-sm underline text-ink" href={link} target="_blank" rel="noreferrer">Open report ↗</a>}
        {error && <div className="mt-2 text-sm text-red" role="alert">{error} <button type="button" className="underline" onClick={() => setRetry(n => n + 1)}>Retry</button></div>}
      </div>
    </div>
  );
}
