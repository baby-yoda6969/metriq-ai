import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { cn } from "../../lib/utils.js";

const ICONS = { error: AlertTriangle, success: CheckCircle2, info: Info };

// Replaces the legacy `.lm-error` box and inline decision badges. Not yet
// consumed outside src/screens: wired up when ScanView/CaseDetail are
// ported.
export function InlineBanner({ tone = "info", className, children, ...props }) {
  const Icon = ICONS[tone] ?? Info;
  const toneClass = {
    error: "bg-red-soft text-red border-red/20",
    success: "bg-green-soft text-green border-green/20",
    info: "bg-panel-alt text-ink-soft border-border",
  }[tone];
  return (
    <div className={cn("flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm", toneClass, className)} {...props}>
      <Icon size={15} className="mt-0.5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}
