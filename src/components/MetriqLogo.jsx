import { cn } from "../lib/utils.js";

// Brand colors sampled from the official metriq ai mark.
export const LOGO = {
  dark: {
    primary: "#F7F8FA",
    muted: "#D0E0F8",
    mist: "#B8C8E0",
    bg: "#000000",
  },
  light: {
    primary: "#101820",
    muted: "#708098",
    mist: "#8898A8",
    bg: "#FFFFFF",
  },
};

/** Official brand mark (raster) — matches the provided logo sheets. */
export function MetriqMark({ mode = "dark", size = 28, className }) {
  const src = mode === "light" ? "/brand/mark-light.png" : "/brand/mark-dark.png";
  // Official mark is wider than tall (~1.7:1); keep height = size.
  const width = Math.round(size * 1.75);
  return (
    <img
      src={src}
      alt=""
      width={width}
      height={size}
      className={cn("shrink-0 object-contain object-left", className)}
      style={{ width, height: size }}
      draggable={false}
      aria-hidden="true"
    />
  );
}

/** Full lockup from the official brand sheet. */
export function MetriqLogo({
  mode = "dark",
  size = "md",
  className,
  markOnly = false,
}) {
  const markSize = size === "lg" ? 56 : size === "sm" ? 28 : 36;

  if (markOnly) {
    return <MetriqMark mode={mode} size={markSize} className={className} />;
  }

  const height = size === "lg" ? 72 : size === "sm" ? 36 : 52;
  return (
    <MetriqLogoImage
      mode={mode}
      className={cn("w-auto", className)}
      style={{ height }}
    />
  );
}

/** Full lockup — pixel-perfect match to the brand sheet. */
export function MetriqLogoImage({ mode = "dark", className, style }) {
  const src = mode === "light" ? "/brand/logo-light.png" : "/brand/logo-dark.png";
  return (
    <img
      src={src}
      alt="metriq ai"
      className={cn("select-none object-contain", className)}
      style={style}
      draggable={false}
    />
  );
}
