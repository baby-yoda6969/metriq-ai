import { cva } from "class-variance-authority";
import { cn } from "../../lib/utils.js";

// Status pill, covering what the legacy code split across Stamp /
// RiskScoreBadge / SourceBadge / exempt-badge. Wired up screen-by-screen as
// each of those gets ported; not yet consumed outside src/screens.
export const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold font-mono uppercase tracking-wide",
  {
    variants: {
      tone: {
        neutral: "bg-panel-alt text-ink-soft",
        compliant: "bg-green-soft text-green",
        "non-compliant": "bg-red-soft text-red",
        caution: "bg-brass-soft text-brass",
        navy: "bg-navy text-white",
      },
    },
    defaultVariants: { tone: "neutral" },
  }
);

export function Badge({ className, tone, ...props }) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
