import { cn } from "../lib/utils.js";
import { useTheme } from "../lib/ThemeContext.jsx";

/**
 * Branded loading animation.
 * Variants: "mark" | "lockup" | "screen"
 * Screen uses the theme-matched loading video.
 */
export function MetriqLoader({
  variant = "lockup",
  label,
  className,
  size = "md",
}) {
  const { mode } = useTheme();
  const lockupH =
    size === "lg" ? 88 : size === "sm" ? 44 : 64;
  const markSize =
    size === "lg" ? 72 : size === "sm" ? 36 : 52;
  const videoSrc = mode === "light" ? "/brand/loading-light.mp4" : "/brand/loading-dark.mp4";
  const screenBg = mode === "light" ? "#F3F5F8" : "#000000";

  if (variant === "screen") {
    return (
      <div
        className={cn(
          "fixed inset-0 z-[80] flex flex-col items-center justify-center overflow-hidden",
          className
        )}
        style={{ background: screenBg }}
        role="status"
        aria-live="polite"
        aria-label={label || "Loading"}
      >
        <video
          key={videoSrc}
          src={videoSrc}
          autoPlay
          muted
          playsInline
          loop
          preload="auto"
          className="h-full w-full max-h-full max-w-full object-contain"
        />
        {label && (
          <p
            className={cn(
              "pointer-events-none absolute bottom-[18%] text-[13px] font-medium tracking-wide",
              mode === "light" ? "text-ink-soft" : "text-white/50"
            )}
          >
            {label}
          </p>
        )}
      </div>
    );
  }

  if (variant === "mark") {
    return (
      <div
        className={cn("inline-flex flex-col items-center gap-2", className)}
        role="status"
        aria-label={label || "Loading"}
      >
        <LoaderMark size={markSize} />
        {label && (
          <p className="metriq-loader-label text-[12px] font-medium text-ink-soft">{label}</p>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn("inline-flex flex-col items-center gap-3", className)}
      role="status"
      aria-live="polite"
      aria-label={label || "Loading"}
    >
      <div
        className="metriq-loader-video relative overflow-hidden rounded-2xl"
        style={{ height: lockupH, width: Math.round(lockupH * 1.6) }}
      >
        <video
          key={videoSrc}
          src={videoSrc}
          autoPlay
          muted
          playsInline
          loop
          preload="auto"
          className="h-full w-full object-cover"
        />
      </div>
      {label && (
        <p className="metriq-loader-label text-[12.5px] font-medium tracking-wide text-ink-soft">
          {label}
        </p>
      )}
    </div>
  );
}

/** SVG mark with sequenced bar + pulsing i-dot (compact fallback). */
export function LoaderMark({ size = 56, className }) {
  return (
    <svg
      width={size}
      height={Math.round(size * 0.72)}
      viewBox="0 0 100 72"
      fill="none"
      className={cn("metriq-loader-mark", className)}
      aria-hidden="true"
    >
      <rect
        className="mq-bar mq-bar-a"
        x="4"
        y="30"
        width="42"
        height="14"
        rx="7"
        fill="#3A4552"
        transform="rotate(-50 25 37)"
      />
      <rect
        className="mq-bar mq-bar-b"
        x="22"
        y="12"
        width="42"
        height="14"
        rx="7"
        fill="#B8C6D8"
        transform="rotate(50 43 19)"
      />
      <rect
        className="mq-bar mq-bar-c"
        x="66"
        y="20"
        width="14"
        height="42"
        rx="7"
        fill="#3A4552"
      />
      <circle className="mq-dot" cx="73" cy="9" r="7.5" fill="#B8C6D8" />
    </svg>
  );
}
