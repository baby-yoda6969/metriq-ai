import { cn } from "../../lib/utils.js";

export function Card({ className, interactive = false, as: Comp = "div", ...props }) {
  return (
    <Comp
      className={cn(
        "rounded-[22px] border border-border bg-panel p-5 transition-[border-color,transform,background] duration-150",
        interactive && "cursor-pointer text-left hover:border-brass/40 hover:bg-panel-alt focus-visible:outline focus-visible:outline-2 focus-visible:outline-brass focus-visible:outline-offset-2",
        className
      )}
      {...props}
    />
  );
}
