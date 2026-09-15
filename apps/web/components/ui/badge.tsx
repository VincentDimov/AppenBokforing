import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "outline" | "success" | "warning";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const badgeVariants: Record<BadgeVariant, string> = {
  default: "border-transparent bg-[#dceef5] text-[#1a516a]",
  outline: "border-[#c8d8e1] bg-white text-[#426173]",
  success: "border-transparent bg-[#dff3e8] text-[#176246]",
  warning: "border-transparent bg-[#fff1d9] text-[#8c5617]"
};

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold tracking-[0.04em]",
        badgeVariants[variant],
        className
      )}
      {...props}
    />
  );
}
