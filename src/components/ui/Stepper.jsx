import { Check } from "lucide-react";
import { cn } from "../../lib/utils.js";

// Horizontal step indicator, replacing the bespoke markup in
// Reusable step indicator. Extracted from the six-face capture flow in
// ThreeDCaptureModal and generalizing it for
// RuleAdminView's draft-submit-approve flow. Not yet consumed outside
// src/screens: wired up when those flows are ported.
export function Stepper({ steps, activeIndex }) {
  return (
    <ol className="flex items-center gap-2">
      {steps.map((label, i) => {
        const done = i < activeIndex;
        const active = i === activeIndex;
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold font-mono",
                done && "bg-green text-white",
                active && !done && "bg-navy text-paper",
                !active && !done && "bg-panel-alt text-ink-soft"
              )}
            >
              {done ? <Check size={12} /> : i + 1}
            </span>
            <span className={cn("text-[13px]", active ? "font-semibold text-ink" : "text-ink-soft")}>{label}</span>
            {i < steps.length - 1 && <span className="mx-1 h-px w-6 bg-border" aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}
