import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#72b1cc] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    defaultVariants: {
      size: "default",
      variant: "default"
    },
    variants: {
      size: {
        default: "h-10 px-4",
        icon: "size-10",
        sm: "h-8 px-3 text-xs",
        wide: "h-11 px-5"
      },
      variant: {
        default:
          "bg-[#12374c] text-white shadow-[0_8px_18px_rgba(16,47,66,0.16)] hover:bg-[#0d2c3e]",
        ghost: "text-[#244457] hover:bg-[#e6f0f4] hover:text-[#102f42]",
        outline: "border border-[#cddde5] bg-white text-[#17384b] hover:bg-[#f2f7f9]",
        secondary: "bg-[#e2f0f5] text-[#17384b] hover:bg-[#d4e7ef]"
      }
    }
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ asChild = false, className, size, variant, ...props }: ButtonProps) {
  const Component = asChild ? Slot : "button";

  return <Component className={cn(buttonVariants({ className, size, variant }))} {...props} />;
}

export { buttonVariants };
