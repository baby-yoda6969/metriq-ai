import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { useTheme } from "../lib/ThemeContext.jsx";

const FALLBACK_MS = 10000;
const REDUCED_MS = 900;
const ERROR_HOLD_MS = 1200;
const MIN_VISIBLE_MS = 1600;

/** Theme-aware splash — plays the loading video once, then onDone. */
export function SplashScreen({ onDone }) {
  const { mode } = useTheme();
  // Freeze theme for this splash so a late theme hydrate doesn't remount the video mid-play.
  const frozenMode = useRef(mode).current;
  const reduceMotion = useReducedMotion();
  const doneRef = useRef(false);
  const startedAt = useRef(Date.now());
  const videoRef = useRef(null);
  const [failed, setFailed] = useState(false);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone?.();
  }, [onDone]);

  const finishAfterMin = useCallback(() => {
    const elapsed = Date.now() - startedAt.current;
    const wait = Math.max(0, MIN_VISIBLE_MS - elapsed);
    window.setTimeout(finish, wait);
  }, [finish]);

  useEffect(() => {
    if (reduceMotion || failed) {
      const t = window.setTimeout(finish, failed ? ERROR_HOLD_MS : REDUCED_MS);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(finish, FALLBACK_MS);
    return () => window.clearTimeout(t);
  }, [finish, reduceMotion, failed]);

  useEffect(() => {
    if (reduceMotion || failed) return undefined;
    const el = videoRef.current;
    if (!el) return undefined;

    let cancelled = false;

    const tryPlay = () => {
      const p = el.play();
      if (p && typeof p.catch === "function") {
        // Don't abort the splash on a transient autoplay rejection — keep trying.
        p.catch(() => {
          if (cancelled) return;
          window.setTimeout(() => {
            if (!cancelled && el.paused) el.play().catch(() => {});
          }, 200);
        });
      }
    };

    const onPlaying = () => {
      startedAt.current = Date.now();
    };

    const onEnded = () => {
      if (!cancelled) finishAfterMin();
    };

    const onError = () => {
      if (!cancelled) setFailed(true);
    };

    el.addEventListener("playing", onPlaying);
    el.addEventListener("ended", onEnded);
    el.addEventListener("error", onError);
    tryPlay();

    return () => {
      cancelled = true;
      el.removeEventListener("playing", onPlaying);
      el.removeEventListener("ended", onEnded);
      el.removeEventListener("error", onError);
    };
  }, [finishAfterMin, reduceMotion, failed, frozenMode]);

  const src = frozenMode === "light" ? "/brand/loading-light.mp4" : "/brand/loading-dark.mp4";
  const bg = frozenMode === "light" ? "#F3F5F8" : "#000000";
  const logo = frozenMode === "light" ? "/brand/logo-light.png" : "/brand/logo-loading.png";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden"
      style={{ background: bg }}
      role="status"
      aria-live="polite"
      aria-label="Loading metriq ai"
    >
      {reduceMotion || failed ? (
        <img
          src={logo}
          alt="metriq ai"
          className="w-[240px] max-w-[72vw] select-none object-contain"
          draggable={false}
        />
      ) : (
        <video
          ref={videoRef}
          src={src}
          autoPlay
          muted
          playsInline
          preload="auto"
          className="h-full w-full max-h-full max-w-full object-contain"
        />
      )}
    </div>
  );
}
