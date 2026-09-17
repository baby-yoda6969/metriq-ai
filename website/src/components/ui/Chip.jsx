import { cn } from "../../lib/utils.js";

// Selectable pill, e.g. RetakeReasonModal's reason chips. Not yet consumed
// outside src/screens: wired up when that modal is ported.
export function Chip({ className, selected = false, ...props }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors",
        selected
          ? "border-navy bg-navy text-paper"
          : "border-border bg-panel text-ink-soft hover:border-navy hover:text-ink",
        className
      )}
      {...props}
    />
  );
}
