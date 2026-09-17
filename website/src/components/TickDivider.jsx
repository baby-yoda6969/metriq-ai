// A hand-drawn ruler/tick-mark divider, used under section headings across
// the app as a small "measured, official" motif. Shared between App.jsx's
// legacy screens and the new Tailwind-based ones (src/screens/*).
export function TickDivider({ className = "" }) {
  return (
    <svg className={"lm-tick " + className} viewBox="0 0 400 12" preserveAspectRatio="none" aria-hidden="true">
      <line x1="0" y1="6" x2="400" y2="6" stroke="var(--border)" strokeWidth="1" />
      {Array.from({ length: 21 }).map((_, i) => (
        <line key={i} x1={i * 20} y1={i % 5 === 0 ? 1 : 3} x2={i * 20} y2={11} stroke="var(--brass)" strokeWidth="1" opacity={i % 5 === 0 ? 0.8 : 0.35} />
      ))}
    </svg>
  );
}
