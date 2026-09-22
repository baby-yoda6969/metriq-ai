import { useEffect, useRef, useState } from "react";
import { Camera, Flashlight, RotateCcw } from "lucide-react";
import { Button } from "../../components/ui/Button.jsx";
import { InlineBanner } from "../../components/ui/InlineBanner.jsx";
import { loadImage } from "../../lib/capture.js";
import {
  sampleImageData,
  ScanPhotoGate,
} from "../../lib/scanGate.js";
import {
  CARD_LONG_EDGE_MM,
  clearCalibration,
  loadCalibration,
  measureFace,
  pixelScale,
  reconcilePackSize,
  saveCalibration,
  summarizeCalibration,
} from "../../lib/cammeter.js";

const FACES = [
  { id: "front", label: "Front", hint: "Keep the pack upright, with all four edges in frame. Width runs left to right." },
  { id: "back", label: "Back", hint: "Keep the pack upright, with all four edges in frame. Width runs left to right." },
  { id: "top", label: "Top", hint: "All four edges in frame. Width runs left to right. Point the top of the phone toward the back." },
  { id: "bottom", label: "Bottom", hint: "All four edges in frame. Width runs left to right. Depth runs up and down." },
  { id: "right", label: "Right side", hint: "Keep the pack upright, with all four edges in frame. Depth runs left to right." },
  { id: "left", label: "Left side", hint: "Keep the pack upright, with all four edges in frame. Depth runs left to right." },
];

function formatMm(value) {
  if (!(value > 0)) return "—";
  return value >= 100 ? value.toFixed(0) : value.toFixed(1);
}

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
    width: canvas.width,
    height: canvas.height,
  };
}

async function preferFocus(stream, close) {
  const track = stream?.getVideoTracks?.()[0];
  if (!track?.getCapabilities) return;
  let caps = {};
  try { caps = track.getCapabilities(); } catch { return; }
  const advanced = [];
  if (close) {
    if (Array.isArray(caps.focusMode) && caps.focusMode.includes("manual")) advanced.push({ focusMode: "manual" });
    if (caps.focusDistance && Number.isFinite(caps.focusDistance.min)) advanced.push({ focusDistance: caps.focusDistance.min });
  } else if (Array.isArray(caps.focusMode) && caps.focusMode.includes("continuous")) {
    advanced.push({ focusMode: "continuous" });
  }
  if (!advanced.length) return;
  try { await track.applyConstraints({ advanced }); } catch { /* many desktop cameras ignore focus distance */ }
}

export function GuidedPackCapture({ onComplete }) {
  const [stored] = useState(() => loadCalibration());
  const [phase, setPhase] = useState(stored ? "close" : "calibrate");
  const [cameraState, setCameraState] = useState("requesting");
  const [faceIndex, setFaceIndex] = useState(0);
  const [captures, setCaptures] = useState([]);
  const [calibration, setCalibration] = useState(stored);
  const [samples, setSamples] = useState(stored?.samples || []);
  const [referenceMm, setReferenceMm] = useState(stored?.referenceMm || CARD_LONG_EDGE_MM);
  const [calFrame, setCalFrame] = useState(null);
  const [points, setPoints] = useState([{ x: 0.18, y: 0.5 }, { x: 0.82, y: 0.5 }]);
  const [closeFrame, setCloseFrame] = useState(null);
  const closeFrameRef = useRef(null);
  const [farFrame, setFarFrame] = useState(null);
  const [measure, setMeasure] = useState(null);
  const [measureError, setMeasureError] = useState("");
  const [frameError, setFrameError] = useState("");
  const [automatic, setAutomatic] = useState(true);
  const [hasTorch, setHasTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [advice, setAdvice] = useState({ message: "Checking the live view…", holdProgress: 0, capture: false });
  const [dragging, setDragging] = useState(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileRef = useRef(null);
  const loupeRef = useRef(null);
  const gateRef = useRef(null);
  const takeFrameRef = useRef(() => {});
  const phaseRef = useRef(phase);
  const automaticRef = useRef(automatic);
  if (!gateRef.current) gateRef.current = new ScanPhotoGate();
  phaseRef.current = phase;
  automaticRef.current = automatic;
  closeFrameRef.current = closeFrame;
  const face = FACES[faceIndex];
  const live = phase === "calibrate" || phase === "close" || phase === "full";

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
    preferFocus(streamRef.current, phase === "calibrate" || phase === "close");
  }, [phase, cameraState]);

  useEffect(() => {
    if (!live || cameraState !== "ready") return undefined;
    let raf = 0;
    let lastSample = 0;
    const sampleCanvas = document.createElement("canvas");
    sampleCanvas.width = 160;
    sampleCanvas.height = 120;
    const sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });
    const tick = (now) => {
      const video = videoRef.current;
      const loupe = loupeRef.current;
      if (video && loupe && video.videoWidth) {
        const ctx = loupe.getContext("2d");
        const size = 72;
        const sx = video.videoWidth / 2 - size / 2;
        const sy = video.videoHeight / 2 - size / 2;
        ctx.drawImage(video, sx, sy, size, size, 0, 0, loupe.width, loupe.height);
      }
      if (video?.videoWidth && now - lastSample >= 100) {
        lastSample = now;
        sampleCtx.drawImage(video, 0, 0, 160, 120);
        const metrics = sampleImageData(sampleCtx.getImageData(0, 0, 160, 120));
        const phaseNow = phaseRef.current;
        const wantAuto = automaticRef.current && (phaseNow === "close" || phaseNow === "full");
        const next = gateRef.current.update(metrics, now, wantAuto, gateRef.current.savedCount);
        setAdvice((prev) => (
          prev.message === next.message && Math.abs(prev.holdProgress - next.holdProgress) < 0.03
            ? prev
            : next
        ));
        if (next.capture) takeFrameRef.current(true);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [live, cameraState]);

  useEffect(() => {
    if (dragging == null) return undefined;
    function move(e) {
      const img = document.getElementById("cammeter-still");
      if (!img) return;
      const rect = img.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
      setPoints((prev) => prev.map((p, i) => (i === dragging ? { x, y } : p)));
    }
    function up() { setDragging(null); }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [dragging]);

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

  function focusAt(event) {
    const video = videoRef.current;
    const track = streamRef.current?.getVideoTracks?.()[0];
    if (!video || !track?.applyConstraints) return;
    const rect = video.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    const advanced = [];
    let caps = {};
    try { caps = track.getCapabilities?.() || {}; } catch { caps = {}; }
    if (Array.isArray(caps.focusMode) && caps.focusMode.includes("single-shot")) {
      advanced.push({ focusMode: "single-shot" });
    } else if (Array.isArray(caps.focusMode) && caps.focusMode.includes("continuous")) {
      advanced.push({ focusMode: "continuous" });
    }
    if (caps.pointsOfInterest) advanced.push({ pointsOfInterest: [{ x, y }] });
    if (!advanced.length) return;
    track.applyConstraints({ advanced }).catch(() => {});
  }

  function takeFrame(fromAutomatic = false) {
    const gate = gateRef.current;
    const frame = grabVideoFrame(videoRef.current);
    if (!frame) {
      if (fromAutomatic) gate.finish(false);
      setFrameError("The preview has no frame yet. Wait until the camera picture appears, then shoot again.");
      return;
    }
    if (!fromAutomatic && !gate.beginManual(gate.savedCount)) {
      setFrameError("The shutter is still finishing the last photo.");
      return;
    }
    let signature;
    try {
      signature = sampleImageData(frame.imageData).signature;
    } catch (err) {
      gate.finish(false);
      setFrameError(err.message || "Could not read that frame.");
      return;
    }
    setFrameError("");
    gate.finish(true, signature);
    if (phase === "calibrate") {
      setCalFrame(frame);
      setPoints([{ x: 0.18, y: 0.5 }, { x: 0.82, y: 0.5 }]);
      setPhase("mark");
      return;
    }
    if (phase === "close") {
      setCloseFrame(frame);
      setPhase("full");
      return;
    }
    if (phase === "full") {
      setFarFrame(frame);
      runMeasure(closeFrameRef.current || closeFrame, frame);
    }
  }
  takeFrameRef.current = takeFrame;

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const frame = await frameFromFile(file);
    if (phase === "calibrate") {
      setCalFrame(frame);
      setPhase("mark");
    } else if (phase === "close") {
      setCloseFrame(frame);
      setPhase("full");
    } else if (phase === "full") {
      setFarFrame(frame);
      runMeasure(closeFrameRef.current || closeFrame, frame);
    }
  }

  async function runMeasure(close, far) {
    setPhase("measuring");
    setMeasure(null);
    setMeasureError("");
    if (!close?.imageData || !far?.imageData) {
      setMeasureError("Missing the close or full-face shot for this side.");
      setPhase("review");
      return;
    }
    if (!(calibration?.xiCalib > 0)) {
      setMeasureError("Calibrate the camera at minimum focus before measuring a face.");
      setPhase("review");
      return;
    }
    try {
      const result = await measureFace(close.imageData, far.imageData, calibration.xiCalib);
      if (!result.ok) {
        setMeasureError(result.reason || "Could not measure this face.");
      } else {
        setMeasure(result);
      }
    } catch (err) {
      setMeasureError(err.message || "Could not measure this face.");
    }
    setPhase("review");
  }

  function confirmCalibration() {
    if (!calFrame) return;
    const span = Math.hypot(
      (points[1].x - points[0].x) * calFrame.width,
      (points[1].y - points[0].y) * calFrame.height
    );
    if (span < 12) return;
    const xi = pixelScale(Number(referenceMm) || CARD_LONG_EDGE_MM, span);
    const nextSamples = [...samples, xi].slice(-6);
    const summary = summarizeCalibration(nextSamples, Number(referenceMm) || CARD_LONG_EDGE_MM);
    setSamples(nextSamples);
    setCalFrame(null);
    if (summary.accepted) {
      const saved = saveCalibration(summary);
      setCalibration(saved);
      gateRef.current.restoreSaved(null, 0);
      setPhase("close");
    } else {
      setPhase("calibrate");
    }
  }

  function acceptFace(includeSize) {
    const shot = {
      face: face.id,
      label: face.label,
      base64: farFrame.dataUrl.split(",")[1],
      mediaType: "image/jpeg",
      corners: includeSize ? measure?.corners || null : null,
      widthMm: includeSize ? measure?.widthMm : null,
      heightMm: includeSize ? measure?.heightMm : null,
      diameterMm: includeSize ? measure?.diameterMm : null,
      scaleChange: includeSize ? measure?.scaleChange : null,
      matchCount: includeSize ? measure?.matchCount : null,
    };
    const next = [...captures, shot];
    if (next.length >= FACES.length) {
      const size = reconcilePackSize(next);
      size.xiCalib = calibration?.xiCalib ?? null;
      size.referenceMm = calibration?.referenceMm ?? null;
      size.calibrationCv = calibration?.cv ?? null;
      onComplete({
        views: next.map((item) => ({
          face: item.face,
          label: item.label,
          base64: item.base64,
          mediaType: item.mediaType,
          corners: item.corners || undefined,
        })),
        size,
      });
      return;
    }
    gateRef.current.restoreSaved(null, 0);
    setCaptures(next);
    setFaceIndex(next.length);
    setCloseFrame(null);
    setFarFrame(null);
    setMeasure(null);
    setMeasureError("");
    setPhase("close");
  }

  function retakeFace() {
    gateRef.current.restoreSaved(null, 0);
    setCloseFrame(null);
    setFarFrame(null);
    setMeasure(null);
    setMeasureError("");
    setPhase("close");
  }

  const summary = summarizeCalibration(samples, Number(referenceMm) || CARD_LONG_EDGE_MM);
  const markSpan = calFrame
    ? Math.hypot((points[1].x - points[0].x) * calFrame.width, (points[1].y - points[0].y) * calFrame.height)
    : 0;

  return (
    <div>
      <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-brass/90">
        {phase === "calibrate" || phase === "mark" ? "Calibrate size" : "Six sides"}
      </p>
      <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
        {phase === "calibrate" && "Move in until an ID card’s long edge just becomes sharp. That closest sharp distance is the scale for every face."}
        {phase === "mark" && "Drag the two dots onto the ends of the card’s long edge (85.6 mm), then save this sample."}
        {phase === "close" && <>Hold at that same closest sharp distance and shoot the <span className="font-semibold text-paper">{face.label.toLowerCase()}</span>.</>}
        {phase === "full" && <>Pull back until the whole <span className="font-semibold text-paper">{face.label.toLowerCase()}</span> fits, then shoot.</>}
        {phase === "measuring" && "Matching texture between the close shot and the full face to recover the scale change."}
        {phase === "review" && "Check the estimated size, then keep the face or shoot it again."}
      </p>

      {phase !== "calibrate" && phase !== "mark" && (
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
      )}

      {(phase === "close" || phase === "full" || phase === "review") && (
        <p className="mt-3 text-[12.5px] leading-relaxed text-ink-soft">{face.hint}</p>
      )}

      {frameError && live && (
        <InlineBanner tone="error" className="mt-3">{frameError}</InlineBanner>
      )}

      {cameraState !== "ready" && live && (
        <InlineBanner tone={cameraState === "requesting" ? "info" : "error"} className="mt-3">
          {cameraState === "requesting" && "Requesting the camera…"}
          {cameraState === "denied" && "Camera access is off. Use the photo button to shoot this step from the camera app."}
          {cameraState === "unsupported" && "This browser has no camera. Use the photo button for each step."}
        </InlineBanner>
      )}

      {live && (
        <div className="relative mx-auto mt-4 aspect-[3/4] w-full max-w-[360px] overflow-hidden rounded-[28px] border border-white/10 bg-navy-deep">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="h-full w-full object-cover"
            style={{ visibility: cameraState === "ready" ? "visible" : "hidden" }}
            onClick={focusAt}
          />
          {cameraState === "ready" && (phase === "close" || phase === "full") && (
            <div className="pointer-events-none absolute inset-[14%]">
              <span className="scan-hero-corner tl !border-white" />
              <span className="scan-hero-corner tr !border-white" />
              <span className="scan-hero-corner bl !border-white" />
              <span className="scan-hero-corner br !border-white" />
            </div>
          )}
          {cameraState === "ready" && (
            <canvas
              ref={loupeRef}
              width={96}
              height={96}
              className="absolute bottom-3 right-3 h-16 w-16 rounded-full border-2 border-white/80 bg-black object-cover"
            />
          )}
          <div className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white">
            {phase === "full" ? "Full face" : phase === "close" ? "Closest sharp distance" : "Calibration"}
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
          {(phase === "close" || phase === "full") && (
            <div className="pointer-events-none absolute inset-x-3 bottom-3">
              <div className="h-1 overflow-hidden rounded-full bg-white/25">
                <div className="h-full bg-brass" style={{ width: `${Math.round(advice.holdProgress * 100)}%` }} />
              </div>
            </div>
          )}
        </div>
      )}

      {phase === "mark" && calFrame && (
        <div className="relative mt-4">
          <img id="cammeter-still" src={calFrame.dataUrl} alt="Calibration frame" className="w-full rounded-[22px] border border-border" />
          <svg className="pointer-events-none absolute inset-0 h-full w-full">
            <line
              x1={`${points[0].x * 100}%`}
              y1={`${points[0].y * 100}%`}
              x2={`${points[1].x * 100}%`}
              y2={`${points[1].y * 100}%`}
              stroke="white"
              strokeWidth="2"
            />
          </svg>
          {points.map((p, i) => (
            <button
              key={i}
              type="button"
              aria-label={i === 0 ? "Start of reference length" : "End of reference length"}
              className="absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-brass shadow"
              style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
              onPointerDown={(e) => { e.preventDefault(); setDragging(i); }}
            />
          ))}
        </div>
      )}

      {phase === "review" && farFrame && (
        <img src={farFrame.dataUrl} alt={`${face.label} of the pack`} className="mt-4 max-h-56 w-full rounded-[22px] border border-border object-contain" />
      )}

      {phase === "measuring" && (
        <div className="mt-6 flex items-center justify-center gap-2 py-8 text-[13px] text-ink-soft">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-brass/30 border-t-brass" />
          Measuring this face…
        </div>
      )}

      {phase === "mark" && (
        <label className="mt-4 block text-[13px] font-semibold text-ink">
          Known length (mm)
          <input
            type="number"
            min="5"
            step="0.1"
            value={referenceMm}
            onChange={(e) => setReferenceMm(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-border bg-bg px-3 py-2.5 text-sm font-normal text-ink focus:border-brass focus:outline-none"
          />
        </label>
      )}

      {samples.length > 0 && (phase === "calibrate" || phase === "mark") && (
        <p className="mt-3 text-[12.5px] text-ink-soft">
          {samples.length} sample{samples.length === 1 ? "" : "s"}
          {Number.isFinite(summary.cv) ? ` · spread ${(summary.cv * 100).toFixed(1)}%` : ""}
          {summary.accepted ? " · ready" : " · need 3 samples within 5% spread"}
        </p>
      )}

      {phase === "mark" && markSpan >= 12 && (
        <p className="mt-1 text-[12.5px] text-ink-soft">
          Span {Math.round(markSpan)} px · {((Number(referenceMm) || CARD_LONG_EDGE_MM) / markSpan).toFixed(3)} mm/px
        </p>
      )}

      {measure && phase === "review" && (
        <div className="mt-4 rounded-2xl border border-brass/30 bg-brass-soft px-3.5 py-3 text-[13.5px] text-ink">
          <div className="font-semibold text-paper">{face.label}: {formatMm(measure.widthMm)} × {formatMm(measure.heightMm)} mm</div>
          <div className="mt-1 text-[12.5px] text-ink-soft">
            Scale change {measure.scaleChange.toFixed(2)}× from the close shot · {measure.matchCount} matched features
          </div>
          <div className="mt-1 text-[12px] text-ink-soft">
            Field estimate for the model, not a certified legal length.
          </div>
        </div>
      )}

      {measureError && phase === "review" && (
        <InlineBanner tone="error" className="mt-4">{measureError}</InlineBanner>
      )}

      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />

      <div className="mt-5 flex flex-col gap-2">
        {live && cameraState === "ready" && (phase === "close" || phase === "full") && (
          <p className="text-[13px] leading-relaxed text-ink">
            {face.label} · keep all four edges visible. {advice.message}
          </p>
        )}
        {live && cameraState === "ready" && (
          <Button variant="primary" className="w-full justify-center" onClick={() => takeFrame(false)}>
            <Camera size={15} />
            {phase === "calibrate" ? "Capture calibration" : phase === "close" ? `Capture close ${face.label.toLowerCase()}` : `Capture full ${face.label.toLowerCase()}`}
          </Button>
        )}
        {live && cameraState !== "ready" && cameraState !== "requesting" && (
          <Button variant="primary" className="w-full justify-center" onClick={() => fileRef.current?.click()}>
            <Camera size={15} /> Add photo for this step
          </Button>
        )}
        {phase === "mark" && (
          <>
            <Button variant="primary" className="w-full justify-center" disabled={markSpan < 12} onClick={confirmCalibration}>
              Save calibration sample
            </Button>
            <Button variant="secondary" className="w-full justify-center" onClick={() => { setCalFrame(null); setPhase("calibrate"); }}>
              Retake
            </Button>
          </>
        )}
        {live && cameraState === "ready" && (phase === "close" || phase === "full") && (
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
        {phase === "full" && (
          <Button variant="ghost" className="w-full justify-center" onClick={() => { setCloseFrame(null); setPhase("close"); }}>
            Retake close shot
          </Button>
        )}
        {phase === "review" && (
          <>
            {measure && (
              <Button variant="primary" className="w-full justify-center" onClick={() => acceptFace(true)}>
                Use {face.label.toLowerCase()} · {formatMm(measure.widthMm)} × {formatMm(measure.heightMm)} mm
              </Button>
            )}
            <Button variant={measure ? "secondary" : "primary"} className="w-full justify-center" onClick={() => acceptFace(false)}>
              {measure ? "Keep photo, skip this measurement" : "Keep photo without a measurement"}
            </Button>
            <Button variant="ghost" className="w-full justify-center" onClick={retakeFace}>
              <RotateCcw size={14} /> Retake this face
            </Button>
          </>
        )}
        {phase === "close" && calibration && (
          <Button
            variant="ghost"
            className="w-full justify-center"
            onClick={() => {
              clearCalibration();
              setCalibration(null);
              setSamples([]);
              setPhase("calibrate");
            }}
          >
            Recalibrate camera
          </Button>
        )}
      </div>

      <p className="mt-4 text-[11.5px] leading-relaxed text-ink-soft">
        Size follows CamMeter: pixel scale at minimum focus, then the scale change between the two shots
        (Hofmann, Seeland & Mader, IJCV 2018). This is a field estimate for the model, not a certified length.
      </p>
    </div>
  );
}
