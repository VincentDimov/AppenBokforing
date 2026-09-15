"use client";

import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import type { ComponentPropsWithoutRef, ElementRef, ReactNode } from "react";
import { forwardRef } from "react";

import { cn } from "@/lib/utils";

const Select = SelectPrimitive.Root;
const SelectGroup = SelectPrimitive.Group;
const SelectValue = SelectPrimitive.Value;

const SelectTrigger = forwardRef<
  ElementRef<typeof SelectPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ children, className, ...props }, ref) => (
  <SelectPrimitive.Trigger
    className={cn(
      "flex h-10 min-w-0 items-center justify-between gap-2 rounded-lg border border-[#cbdbe3] bg-white px-3 text-left text-sm font-medium text-[#17384b] outline-none transition hover:border-[#a9c4d0] focus:ring-2 focus:ring-[#72b1cc] disabled:cursor-not-allowed disabled:opacity-50",
      className
    )}
    ref={ref}
    {...props}
  >
    <span className="min-w-0 truncate">{children}</span>
    <SelectPrimitive.Icon asChild>
      <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-[#668291]" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

const SelectContent = forwardRef<
  ElementRef<typeof SelectPrimitive.Content>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ children, className, position = "popper", ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      className={cn(
        "relative z-50 max-h-72 min-w-[10rem] overflow-hidden rounded-lg border border-[#cbdbe3] bg-white p-1 text-[#17384b] shadow-[0_16px_36px_rgba(16,47,66,0.16)]",
        position === "popper" && "translate-y-1",
        className
      )}
      position={position}
      ref={ref}
      {...props}
    >
      <SelectPrimitive.Viewport
        className={cn(
          "p-0.5",
          position === "popper" && "min-w-[var(--radix-select-trigger-width)]"
        )}
      >
        {children}
      </SelectPrimitive.Viewport>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = SelectPrimitive.Content.displayName;

const SelectItem = forwardRef<
  ElementRef<typeof SelectPrimitive.Item>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ children, className, ...props }, ref) => (
  <SelectPrimitive.Item
    className={cn(
      "relative flex w-full cursor-default select-none items-center rounded-md py-2 pl-8 pr-3 text-sm outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-[#e8f2f6] data-[disabled]:opacity-50",
      className
    )}
    ref={ref}
    {...props}
  >
    <span className="absolute left-2 flex size-4 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check aria-hidden="true" className="size-3.5 text-[#1f6b86]" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = SelectPrimitive.Item.displayName;

function SelectLabel({
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      className={cn(
        "px-2 py-1.5 text-xs font-semibold tracking-[0.08em] text-[#668291] uppercase",
        className
      )}
      {...props}
    >
      {children}
    </SelectPrimitive.Label>
  );
}

export { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue };

export type SelectContentProps = { children: ReactNode };
