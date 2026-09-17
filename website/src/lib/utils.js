import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// Merges conditional class lists (clsx) then dedupes conflicting Tailwind
// utilities (tailwind-merge). Standard helper for cva-based components.
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
