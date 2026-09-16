import { MetriqLogoImage } from "./MetriqLogo.jsx";
import { COLORS } from "../lib/theme.js";

// Dark-mode brand header for Welcome / Sign in (matches logo sheet).
const TOPO = `url("data:image/svg+xml,${encodeURIComponent(`
<svg xmlns='http://www.w3.org/2000/svg' width='390' height='340' viewBox='0 0 390 340' fill='none'>
  <path d='M-40 55 C20 28, 70 78, 130 52 S220 8, 285 42 S360 88, 430 55' stroke='#D0E0F8' stroke-opacity='0.22' stroke-width='1.15'/>
  <path d='M-50 105 C15 72, 80 128, 145 98 S245 48, 315 95 S390 145, 450 110' stroke='#D0E0F8' stroke-opacity='0.18' stroke-width='1.15'/>
  <path d='M-30 155 C40 118, 100 175, 170 148 S275 100, 340 145 S415 195, 460 160' stroke='#D0E0F8' stroke-opacity='0.14' stroke-width='1.15'/>
  <path d='M-45 205 C30 165, 105 225, 175 195 S280 150, 350 195 S430 245, 470 210' stroke='#D0E0F8' stroke-opacity='0.11' stroke-width='1.15'/>
  <path d='M-35 255 C45 212, 115 275, 190 245 S295 200, 360 245 S440 295, 480 260' stroke='#D0E0F8' stroke-opacity='0.08' stroke-width='1.15'/>
  <path d='M-25 300 C55 258, 130 320, 205 290 S310 245, 375 290 S450 340, 490 305' stroke='#D0E0F8' stroke-opacity='0.06' stroke-width='1.15'/>
</svg>
`)}")`;

export function AuthWaveHeader({ tall = false, children }) {
  return (
    <div
      className="relative shrink-0 overflow-hidden"
      style={{
        height: tall ? "42%" : "34%",
        minHeight: tall ? 220 : 180,
        backgroundColor: COLORS.authHeader,
        backgroundImage: TOPO,
        backgroundSize: "cover",
        backgroundPosition: "center top",
      }}
    >
      <div className="absolute inset-0 z-[1] flex items-center justify-center pb-8 pt-3">
        <MetriqLogoImage mode="dark" className="h-[78%] max-h-[168px] w-auto" />
      </div>
      {children}
      <svg
        className="pointer-events-none absolute -bottom-px left-0 z-[2] w-full"
        viewBox="0 0 390 48"
        preserveAspectRatio="none"
        aria-hidden="true"
        style={{ height: 48 }}
      >
        <path
          d="M0 18 C70 46, 130 2, 195 22 S320 48, 390 14 L390 48 L0 48 Z"
          fill={COLORS.authBg}
        />
      </svg>
    </div>
  );
}

export function AuthShell({ header, children, tallHeader = false }) {
  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden"
      style={{ background: COLORS.authBg, color: COLORS.authInk, fontFamily: "Manrope, Segoe UI, sans-serif" }}
    >
      <AuthWaveHeader tall={tallHeader}>{header}</AuthWaveHeader>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-7 pb-8 pt-2">
        {children}
      </div>
    </div>
  );
}
