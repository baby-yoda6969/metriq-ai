import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "../../lib/utils.js";
import { useDismissOnBack } from "../../lib/useDismissOnBack.js";

// Radix Dialog wrapper, replacing the legacy hand-rolled `lm-modal-scrim` /
// `lm-modal` markup + `useBodyScrollLock`, gaining focus trapping, Escape
// handling, and scroll lock for free. Not yet consumed outside src/screens:
// wired up as each of the app's ~9 one-off modals is ported.
export function Modal({ open, onOpenChange, title, wide = false, children, footer }) {
  // So the browser/hardware back button closes this dialog instead of
  // leaving the app — see useDismissOnBack for why that matters here.
  useDismissOnBack(open, () => onOpenChange(false));

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-navy-deep/60 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 max-h-[85dvh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[22px] border border-border bg-panel shadow-xl focus:outline-none",
            wide ? "w-[min(880px,92vw)]" : "w-[min(480px,92vw)]"
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <Dialog.Title className="font-display text-lg font-semibold text-ink">{title}</Dialog.Title>
            <Dialog.Close aria-label="Close dialog" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-ink-soft hover:bg-panel-alt hover:text-ink">
              <X size={16} />
            </Dialog.Close>
          </div>
          <div className="px-5 py-4">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-4">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
