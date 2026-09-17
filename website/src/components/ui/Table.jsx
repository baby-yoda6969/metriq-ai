import { cn } from "../../lib/utils.js";

// Thin table primitives, replacing the `.lm-table`/`.lm-table-wrap` classes
// repeated verbatim across HistoryView/DashboardView/PenaltyModal/BatchLedger.
// Not yet consumed outside src/screens: wired up as each of those is ported.
export function TableWrap({ className, children }) {
  return <div className={cn("overflow-x-auto rounded-xl border border-border", className)}>{children}</div>;
}
export function Table({ className, ...props }) {
  return <table className={cn("w-full border-collapse text-sm", className)} {...props} />;
}
export function Thead({ className, ...props }) {
  return <thead className={cn("bg-panel-alt text-left text-[11px] uppercase tracking-wide text-ink-soft", className)} {...props} />;
}
export function Tr({ className, ...props }) {
  return <tr className={cn("border-b border-border last:border-0", className)} {...props} />;
}
export function Th({ className, ...props }) {
  return <th className={cn("px-3 py-2.5 font-mono font-medium", className)} {...props} />;
}
export function Td({ className, ...props }) {
  return <td className={cn("px-3 py-2.5", className)} {...props} />;
}
