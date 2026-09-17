import { cva } from "class-variance-authority";
import { cn } from "../../lib/utils.js";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 min-w-0 whitespace-normal text-center rounded-full font-semibold font-body transition-[background,border-color,color,transform,box-shadow] duration-[250ms] ease-[var(--ease-lm-out)] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brass focus-visible:outline-offset-2",
  {
    variants: {
      variant: {
        primary:
          "bg-paper border border-paper text-bg hover:bg-brass-strong hover:border-brass-strong hover:-translate-y-0.5 hover:shadow-[0_14px_32px_-12px_rgba(16,24,32,0.2)] active:translate-y-0",
        dark:
          "bg-transparent border border-border text-paper hover:border-brass/50 hover:bg-brass-soft/50",
        secondary:
          "bg-panel-alt border border-border text-ink hover:border-brass",
        ghost:
          "bg-transparent border border-transparent text-ink-soft hover:bg-panel-alt hover:text-ink",
        link:
          "bg-transparent border border-transparent text-brass underline-offset-2 hover:underline p-0 font-medium",
      },
      size: {
        default: "px-6 py-3.5 text-sm",
        sm: "px-3.5 py-2 text-[13px]",
        icon: "p-2",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  }
);

export function Button({ className, variant, size, as: Comp = "button", ...props }) {
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
