import { useEffect, useRef, useState } from "react";
import { ChevronDown, ImagePlus, Loader2, ScanLine } from "lucide-react";
import { ScanBeam } from "./ScanMock.jsx";
import { captureEvidencePhoto, hashDataUrl } from "../lib/capture.js";
import { processSample, SAMPLE_BUTTONS } from "../lib/sampleLabels.js";

const CLOSED_PEEK = 22;
const OPEN_SHEET = 88;
const SNAP = 0.26;

function frameFromVideo(video) {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 720;
  canvas.height = video.videoHeight || 960;
  canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  return { dataUrl, base64: dataUrl.split(",")[1], mediaType: "image/jpeg" };
}

function BehindScanner({ active, revealed, onCapture }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileRef = useRef(null);
  const [camera, setCamera] = useState("idle");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!active) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      setCamera("idle");
      return undefined;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamera("unsupported");
      return undefined;
    }
    let cancelled = false;
    setCamera("requesting");
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCamera("ready");
      })
      .catch(() => {
        if (!cancelled) setCamera("denied");
      });
    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [active]);

  async function shoot() {
    const video = videoRef.current;
    if (!video || camera !== "ready" || busy) return;
    setBusy(true);
    try {
      const frame = frameFromVideo(video);
      const hashHex = await hashDataUrl(frame.dataUrl);
      onCapture({ ...frame, hashHex });
    } finally {
      setBusy(false);
    }
  }

  async function onFile(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      onCapture(await captureEvidencePhoto(file));
    } finally {
      setBusy(false);
    }
  }

  async function onSample(type) {
    if (busy) return;
    setBusy(true);
    try {
      onCapture(await processSample(type));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="absolute inset-0 bg-black">
      <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-[#D0E0F8]/18 to-transparent" />
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 h-full w-full object-cover"
        style={{ visibility: camera === "ready" ? "visible" : "hidden" }}
      />
      {camera !== "ready" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
          {(camera === "requesting" || camera === "idle") ? (
            <>
              <Loader2 size={28} className="animate-spin text-[#D0E0F8]/70" />
              <div className="text-[13px] text-white/55">Preparing scanner…</div>
            </>
          ) : (
            <>
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/5 text-[#D0E0F8]">
                <ScanLine size={20} />
              </div>
              <div className="text-[13px] text-white/55">
                {camera === "denied" && "Allow camera to scan a label"}
                {camera === "unsupported" && "Camera isn't available on this device"}
              </div>
            </>
          )}
        </div>
      )}
      {camera === "ready" && revealed && <ScanBeam />}

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,transparent_34%,rgba(0,0,0,0.62)_100%)]" />

      {revealed && (
        <>
          <div className="absolute left-1/2 top-[15%] w-[72%] max-w-[280px] -translate-x-1/2">
            <div className="relative aspect-square">
              <span className="scan-hero-corner tl !border-[#D0E0F8]" />
              <span className="scan-hero-corner tr !border-[#D0E0F8]" />
              <span className="scan-hero-corner bl !border-[#D0E0F8]" />
              <span className="scan-hero-corner br !border-[#D0E0F8]" />
            </div>
          </div>

          <div className="absolute inset-x-0 top-9 text-center">
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#D0E0F8]/90">
              metriq ai scan
            </div>
            <div className="mt-1.5 font-display text-[24px] font-semibold tracking-tight text-white">
              Align the label
            </div>
            <p className="mx-auto mt-1 max-w-[240px] text-[12px] leading-relaxed text-white/55">
              Center the declarations panel, then capture.
            </p>
          </div>

          <div className="absolute inset-x-0 bottom-[100px] flex flex-col items-center gap-3.5">
            <button
              type="button"
              onClick={shoot}
              disabled={busy || camera !== "ready"}
              className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-[3px] border-white/90 bg-white text-black shadow-[0_12px_36px_-8px_rgba(208,224,248,0.55)] transition-transform active:scale-95 disabled:opacity-40"
              aria-label="Capture label"
            >
              {busy ? <Loader2 className="animate-spin" size={24} /> : <ScanLine size={24} strokeWidth={2.2} />}
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1.5 text-[12px] font-semibold text-white/85 backdrop-blur-sm disabled:opacity-40"
            >
              <ImagePlus size={14} /> Photo library
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
            <div className="flex flex-wrap items-center justify-center gap-1.5 px-4">
              {SAMPLE_BUTTONS.map((s) => (
                <button
                  key={s.type}
                  type="button"
                  disabled={busy}
                  onClick={() => onSample(s.type)}
                  className="rounded-full border border-white/15 bg-black/35 px-2.5 py-1 text-[10.5px] font-semibold text-white/70 backdrop-blur-sm disabled:opacity-40"
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function PullToScan({ open, onOpenChange, onCapture, onDirectScan, children, enabled = true }) {
  const rootRef = useRef(null);
  const pullRef = useRef(0);
  const dragRef = useRef({ active: false, startY: 0, startPull: 0, fromContent: false });
  const [pull, setPull] = useState(0);
  const [dragging, setDragging] = useState(false);

  function setPullBoth(next) {
    pullRef.current = next;
    setPull(next);
  }

  useEffect(() => {
    if (dragging) return;
    setPullBoth(open ? 1 : 0);
  }, [open, dragging]);

  // Leaving Home cancels an in-progress pull so Cases / Profile don't keep a half-open sheet.
  useEffect(() => {
    if (enabled) return;
    if (open) return;
    dragRef.current.active = false;
    setDragging(false);
    setPullBoth(0);
  }, [enabled, open]);

  function maxTravel() {
    const h = rootRef.current?.clientHeight || 720;
    return Math.max(240, h - OPEN_SHEET - CLOSED_PEEK);
  }

  function translate(p) {
    return p * maxTravel();
  }

  function snap(next) {
    const opened = next >= SNAP;
    if (opened && onDirectScan) {
      setPullBoth(0);
      onOpenChange(false);
      onDirectScan();
      return;
    }
    setPullBoth(opened ? 1 : 0);
    onOpenChange(opened);
  }

  function beginDrag(clientY, fromContent) {
    dragRef.current = { active: true, startY: clientY, startPull: pullRef.current, fromContent };
    setDragging(true);
  }

  function moveDrag(clientY) {
    if (!dragRef.current.active) return;
    const dy = clientY - dragRef.current.startY;
    const raw = dragRef.current.startPull + dy / maxTravel();
    setPullBoth(Math.max(0, Math.min(1.08, raw)));
  }

  function endDrag(clientY) {
    if (!dragRef.current.active) return;
    const dy = clientY - dragRef.current.startY;
    dragRef.current.active = false;
    setDragging(false);
    if (Math.abs(dy) < 10 && dragRef.current.startPull < 0.05 && !dragRef.current.fromContent) {
      if (onDirectScan) {
        setPullBoth(0);
        onOpenChange(false);
        onDirectScan();
        return;
      }
      setPullBoth(1);
      onOpenChange(true);
      return;
    }
    snap(pullRef.current);
  }

  function onHandlePointerDown(e) {
    if (!enabled && pullRef.current < 0.05 && !open) return;
    if (e.button != null && e.button !== 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    beginDrag(e.clientY, false);
  }

  function onHandlePointerMove(e) {
    if (!dragRef.current.active) return;
    moveDrag(e.clientY);
  }

  function onHandlePointerUp(e) {
    endDrag(e.clientY);
  }

  useEffect(() => {
    if (!enabled) return undefined;
    const root = rootRef.current;
    if (!root) return undefined;
    const main = root.querySelector(".app-main");
    if (!main) return undefined;

    function atTop() {
      return main.scrollTop <= 0;
    }

    function onTouchStart(e) {
      if (e.touches.length !== 1) return;
      if (pullRef.current < 0.04 && !atTop()) return;
      if (pullRef.current < 0.04 && e.target.closest("button, a, input, textarea, select")) return;
      beginDrag(e.touches[0].clientY, true);
    }

    function onTouchMove(e) {
      if (!dragRef.current.active || !dragRef.current.fromContent) return;
      const y = e.touches[0].clientY;
      const dy = y - dragRef.current.startY;
      if (pullRef.current <= 0 && dy <= 0) {
        dragRef.current.active = false;
        setDragging(false);
        return;
      }
      if (dy > 6 || pullRef.current > 0.02) {
        e.preventDefault();
        moveDrag(y);
      }
    }

    function onTouchEnd(e) {
      if (!dragRef.current.active || !dragRef.current.fromContent) return;
      const y = (e.changedTouches[0] && e.changedTouches[0].clientY) || dragRef.current.startY;
      endDrag(y);
    }

    main.addEventListener("touchstart", onTouchStart, { passive: true });
    main.addEventListener("touchmove", onTouchMove, { passive: false });
    main.addEventListener("touchend", onTouchEnd);
    main.addEventListener("touchcancel", onTouchEnd);
    return () => {
      main.removeEventListener("touchstart", onTouchStart);
      main.removeEventListener("touchmove", onTouchMove);
      main.removeEventListener("touchend", onTouchEnd);
      main.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [enabled, onOpenChange]);

  const opened = pull > 0.85;
  const hint = onDirectScan
    ? (pull > SNAP ? "Release to scan six sides" : "Pull down to scan six sides")
    : (opened ? "Swipe up to close" : pull > SNAP ? "Release to scan" : "Pull down to scan");
  const showPeek = enabled || open || pull > 0.02;
  const peek = showPeek ? CLOSED_PEEK : 0;

  return (
    <div ref={rootRef} className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <BehindScanner
        active={!onDirectScan && (pull > 0.08 || open)}
        revealed={pull > 0.55}
        onCapture={onCapture}
      />

      <div
        className="absolute inset-x-0 bottom-0 flex flex-col bg-bg will-change-transform"
        style={{
          top: peek,
          transform: `translateY(${translate(Math.min(pull, 1))}px)`,
          borderRadius: showPeek ? "28px 28px 0 0" : "0",
          boxShadow: showPeek ? "0 -18px 40px rgba(0,0,0,0.45)" : "none",
          transition: dragging ? "none" : "transform 380ms cubic-bezier(0.16, 1, 0.3, 1), top 280ms ease",
        }}
      >
        {showPeek && (
          <div
            className="pull-handle flex shrink-0 cursor-grab touch-none select-none flex-col items-center pb-1 pt-2 active:cursor-grabbing"
            onPointerDown={onHandlePointerDown}
            onPointerMove={onHandlePointerMove}
            onPointerUp={onHandlePointerUp}
            onPointerCancel={onHandlePointerUp}
          >
            <div className="h-1 w-10 rounded-full bg-ink/18" />
            <div className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold tracking-wide text-brass">
              <ChevronDown size={13} className={opened ? "rotate-180 transition-transform" : "transition-transform"} />
              {hint}
            </div>
          </div>
        )}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      </div>
    </div>
  );
}
