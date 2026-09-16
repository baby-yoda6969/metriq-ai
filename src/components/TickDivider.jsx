export function TickDivider({ className = "" }) {
  return (
    <div className={"lm-tick " + className} aria-hidden="true">
      <div className="h-px w-full bg-gradient-to-r from-transparent via-navy/70 to-transparent" />
    </div>
  );
}
