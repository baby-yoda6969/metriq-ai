import { useEffect, useRef, useState } from "react";
import { Camera, Flashlight, RotateCcw } from "lucide-react";
import { Button } from "../../components/ui/Button.jsx";
import { InlineBanner } from "../../components/ui/InlineBanner.jsx";
import { loadImage } from "../../lib/capture.js";
import { sampleImageData, ScanPhotoGate } from "../../lib/scanGate.js";

const FACES = [
  { id: "front", label: "Front", hint: "Keep the pack upright, with all four edges in frame." },
  { id: "back", label: "Back", hint: "Turn the pack around. Keep all four edges in frame." },
  { id: "top", label: "Top", hint: "Point the camera at the top. All four edges in frame." },
  { id: "bottom", label: "Bottom", hint: "Point the camera at the bottom. All four edges in frame." },
  { id: "right", label: "Right side", hint: "Turn the pack to the right side. All four edges in frame." },
  { id: "left", label: "Left side", hint: "Turn the pack to the left side. All four edges in frame." },
];

function grabVideoFrame(video) {
  const srcW = video.videoWidth;
  const srcH = video.videoHeight;
  if (!srcW || !srcH) return null;
  const scale = Math.min(1, 1280 / Math.max(srcW, srcH));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(srcW * scale);
  canvas.height = Math.round(srcH * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return {
    imageData: ctx.getImageData(0, 0, canvas.width, canvas.height),
    dataUrl: canvas.toDataURL("image/jpeg", 0.82),
    width: canvas.width,
    height: canvas.height,
  };
}

async function frameFromFile(file) {
  const img = await loadImage(file);
  const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return {
    imageData: ctx.getImageData(0, 0, canvas.width, canvas.height),
    dataUrl: canvas.toDataURL("image/jpeg", 0.82),
  };
}

export function GuidedPackCapture({ onComplete }) {
  const [cameraState, setCameraState] = useState("requesting");
  const [faceIndex, setFaceIndex] = useState(0);
  const [captures, setCaptures] = useState([]);
  const [frameError, setFrameError] = useState("");
  const [automatic, setAutomatic] = useState(true);
  const [busy, setBusy] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [advice, setAdvice] = useState({ message: "Hold the front steady.", holdProgress: 0, capture: false });
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileRef = useRef(null);
  const gateRef = useRef(null);
  const takeRef = useRef(() => {});
  const automaticRef = useRef(automatic);
  const capturesRef = useRef([]);
  const faceIndexRef = useRef(0);
  const busyRef = useRef(false);
  const finishedRef = useRef(false);
  if (!gateRef.current) gateRef.current = new ScanPhotoGate();
  automaticRef.current = automatic;
  const face = FACES[Math.min(faceIndex, FACES.length - 1)];

  useEffect(() => {
    let cancelled = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState("unsupported");
      return undefined;
    }
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    }).then((stream) => {
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      const track = stream.getVideoTracks()[0];
      let caps = {};
      try { caps = track?.getCapabilities?.() || {}; } catch { caps = {}; }
      setHasTorch(Boolean(caps.torch));
      setCameraState("ready");
    }).catch(() => {
      if (!cancelled) setCameraState("denied");
    });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (cameraState !== "ready") return undefined;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (video && stream && video.srcObject !== stream) video.srcObject = stream;
    return undefined;
  }, [cameraState, faceIndex]);

  useEffect(() => {
    if (cameraState !== "ready") return undefined;
    let raf = 0;
    let lastSample = 0;
    const sampleCanvas = document.createElement("canvas");
    sampleCanvas.width = 160;
    sampleCanvas.height = 120;
    const sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });
    const tick = (now) => {
      const video = videoRef.current;
      if (video?.videoWidth && now - lastSample >= 100 && !busyRef.current && !finishedRef.current) {
        lastSample = now;
        sampleCtx.drawImage(video, 0, 0, 160, 120);
        const metrics = sampleImageData(sampleCtx.getImageData(0, 0, 160, 120));
        const next = gateRef.current.update(
          metrics,
          now,
          automaticRef.current,
          capturesRef.current.length,
        );
        setAdvice((prev) => (
          prev.message === next.message && Math.abs(prev.holdProgress - next.holdProgress) < 0.03
            ? prev
            : next
        ));
        if (next.capture) takeRef.current(true);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [cameraState]);

  function commitFrame(frame) {
    if (!frame || busyRef.current || finishedRef.current) return;
    const index = faceIndexRef.current;
    const current = FACES[index];
    if (!current) return;
    busyRef.current = true;
    setBusy(true);
    let signature = null;
    try {
      signature = sampleImageData(frame.imageData).signature;
    } catch {
      signature = null;
    }
    const shot = {
      face: current.id,
      label: current.label,
      base64: frame.dataUrl.split(",")[1],
      mediaType: "image/jpeg",
      preview: frame.dataUrl,
    };
    const next = [...capturesRef.current, shot];
    capturesRef.current = next;
    setCaptures(next);
    setFrameError("");
    gateRef.current.finish(true, signature);
    if (next.length >= FACES.length) {
      finishedRef.current = true;
      onComplete({
        views: next.map((item) => ({
          face: item.face,
          label: item.label,
          base64: item.base64,
          mediaType: item.mediaType,
        })),
        size: null,
      });
      return;
    }
    faceIndexRef.current = next.length;
    setFaceIndex(next.length);
    gateRef.current.restoreSaved(signature, next.length);
    window.setTimeout(() => {
      busyRef.current = false;
      setBusy(false);
    }, 800);
  }

  function takeFrame(fromAutomatic = false) {
    const gate = gateRef.current;
    const frame = grabVideoFrame(videoRef.current);
    if (!frame) {
      if (fromAutomatic) gate.finish(false);
      setFrameError("Wait until the camera picture appears, then shoot again.");
      return;
    }
    if (!fromAutomatic && !gate.beginManual(capturesRef.current.length)) {
      setFrameError("The shutter is still finishing the last photo.");
      return;
    }
    commitFrame(frame);
  }
  takeRef.current = takeFrame;

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || busyRef.current || finishedRef.current) return;
    const frame = await frameFromFile(file);
    commitFrame(frame);
  }

  function retakeLast() {
    if (busyRef.current || finishedRef.current || capturesRef.current.length === 0) return;
    const next = capturesRef.current.slice(0, -1);
    capturesRef.current = next;
    faceIndexRef.current = next.length;
    setCaptures(next);
    setFaceIndex(next.length);
    const previous = next[next.length - 1];
    gateRef.current.restoreSaved(null, next.length);
    if (previous) gateRef.current.savedCount = next.length;
  }

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks?.()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next }] });
      setTorchOn(next);
    } catch {
      setFrameError("This camera has no torch control.");
      setHasTorch(false);
    }
  }

  return (
    <div>
      <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-brass/90">
        Side {Math.min(faceIndex + 1, FACES.length)} of {FACES.length}
      </p>
      <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
        Shoot the <span className="font-semibold text-paper">{face.label.toLowerCase()}</span>, then turn the pack for the next side.
        {captures.length > 0 ? ` ${captures.length} saved.` : ""}
      </p>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {FACES.map((item, i) => {
          const doneFace = i < captures.length;
          const active = i === faceIndex;
          return (
            <div
              key={item.id}
              className={[
                "rounded-2xl border px-2.5 py-2.5 text-center",
                doneFace ? "border-brass/35 bg-brass-soft text-brass"
                  : active ? "border-brass/60 bg-gradient-to-b from-brass-strong/25 to-brass-soft text-paper"
                    : "border-border bg-panel-alt text-ink-soft",
              ].join(" ")}
            >
              <div className="text-[10px] font-semibold uppercase tracking-[0.1em] opacity-70">
                {doneFace ? "Done" : active ? "Now" : `${i + 1}`}
              </div>
              <div className="mt-0.5 text-[12.5px] font-semibold tracking-tight">{item.label}</div>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-[12.5px] leading-relaxed text-ink-soft">{face.hint}</p>
      {frameError && <InlineBanner tone="error" className="mt-3">{frameError}</InlineBanner>}
      {cameraState !== "ready" && (
        <InlineBanner tone={cameraState === "requesting" ? "info" : "error"} className="mt-3">
          {cameraState === "requesting" && "Requesting the camera…"}
          {cameraState === "denied" && "Camera access is off. Use the photo button once for each side."}
          {cameraState === "unsupported" && "This browser has no camera. Use the photo button once for each side."}
        </InlineBanner>
      )}

      <div className="relative mx-auto mt-4 aspect-[3/4] w-full max-w-[360px] overflow-hidden rounded-[28px] border border-white/10 bg-navy-deep">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-cover"
          style={{ visibility: cameraState === "ready" ? "visible" : "hidden" }}
        />
        {cameraState === "ready" && (
          <div className="pointer-events-none absolute inset-[14%]">
            <span className="scan-hero-corner tl !border-white" />
            <span className="scan-hero-corner tr !border-white" />
            <span className="scan-hero-corner bl !border-white" />
            <span className="scan-hero-corner br !border-white" />
          </div>
        )}
        <div className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white">
          {face.label} · {faceIndex + 1}/{FACES.length}
        </div>
        {hasTorch && (
          <button
            type="button"
            aria-label={torchOn ? "Turn torch off" : "Turn torch on"}
            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white"
            onClick={toggleTorch}
          >
            <Flashlight size={16} className={torchOn ? "text-brass" : ""} />
          </button>
        )}
        <div className="pointer-events-none absolute inset-x-3 bottom-3">
          <div className="h-1 overflow-hidden rounded-full bg-white/25">
            <div className="h-full bg-brass" style={{ width: `${Math.round((advice.holdProgress || 0) * 100)}%` }} />
          </div>
        </div>
      </div>

      {captures.length > 0 && (
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {captures.map((shot) => (
            <img
              key={shot.face}
              src={shot.preview}
              alt={shot.label}
              className="h-16 w-16 shrink-0 rounded-xl border border-border object-cover"
            />
          ))}
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />

      <div className="mt-5 flex flex-col gap-2">
        {cameraState === "ready" && (
          <p className="text-[13px] leading-relaxed text-ink">
            {face.label} · {busy ? "Saved. Turn the pack for the next side." : advice.message}
          </p>
        )}
        {cameraState === "ready" && (
          <Button variant="primary" className="w-full justify-center" disabled={busy} onClick={() => takeFrame(false)}>
            <Camera size={15} /> Capture {face.label.toLowerCase()} ({faceIndex + 1}/6)
          </Button>
        )}
        {cameraState !== "ready" && cameraState !== "requesting" && (
          <Button variant="primary" className="w-full justify-center" disabled={busy} onClick={() => fileRef.current?.click()}>
            <Camera size={15} /> Add {face.label.toLowerCase()} photo ({faceIndex + 1}/6)
          </Button>
        )}
        {cameraState === "ready" && (
          <Button
            variant="ghost"
            className="w-full justify-center"
            onClick={() => {
              const next = !automatic;
              setAutomatic(next);
              if (next) gateRef.current.resume();
              else gateRef.current.pause();
            }}
          >
            {automatic ? "Automatic shutter on" : "Automatic shutter off"}
          </Button>
        )}
        {captures.length > 0 && (
          <Button variant="ghost" className="w-full justify-center" disabled={busy} onClick={retakeLast}>
            <RotateCcw size={14} /> Retake last side
          </Button>
        )}
      </div>
    </div>
  );
}
