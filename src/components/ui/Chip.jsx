import { cn } from "../../lib/utils.js";

export function Chip({ className, selected = false, ...props }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors",
        selected
          ? "border-paper bg-paper text-bg"
          : "border-border bg-panel-alt text-ink-soft hover:border-navy hover:text-ink",
        className
      )}
      {...props}
    />
  );
}
