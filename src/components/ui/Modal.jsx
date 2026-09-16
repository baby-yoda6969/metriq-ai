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
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/70 backdrop-blur-[6px] data-[state=open]:animate-in data-[state=open]:fade-in" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 max-h-[85vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[24px] border border-white/10 bg-panel shadow-[0_24px_80px_-20px_rgba(0,0,0,0.8)] focus:outline-none",
            wide ? "w-[min(880px,92vw)]" : "w-[min(480px,92vw)]"
          )}
        >
          <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
            <Dialog.Title className="font-display text-lg font-semibold text-ink">{title}</Dialog.Title>
            <Dialog.Close className="rounded-full p-1 text-ink-soft hover:bg-panel-alt hover:text-ink">
              <X size={16} />
            </Dialog.Close>
          </div>
          <div className="px-5 py-4">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-border px-5 py-4">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
