"use client";
import { useEffect, useId, useRef, useState } from "react";
import { FloatingOptions } from "@/components/ui/floating-options";
import { workspaceRequest } from "@/lib/workspace-api";
import type { Dimension } from "@/components/organizations/dimensions-page";
export function DimensionTypeahead({
  org,
  kind,
  value,
  onChange,
  disabled,
  label,
  displayName
}: {
  org: string;
  kind: "projects" | "cost-centers";
  value: string;
  onChange: (code: string) => void;
  disabled: boolean;
  label: string;
  displayName?: string;
}) {
  const id = useId();
  const anchor = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [choices, setChoices] = useState<Dimension[]>([]);
  const [active, setActive] = useState(0);
  useEffect(() => {
    if (!open) setQuery(value);
  }, [value, open]);
  useEffect(() => {
    if (!open || disabled || !org) return;
    const controller = new AbortController();
    setChoices([]);
    workspaceRequest<Dimension[]>(
      `/organizations/${org}/${kind}?${new URLSearchParams({ search: query, activeOnly: "true" })}`,
      { signal: controller.signal }
    )
      .then((choices) => {
        if (!Array.isArray(choices)) throw new Error("Ogiltigt registersvar");
        if (!controller.signal.aborted) {
          setChoices(
            choices.filter(
              (choice) =>
                choice &&
                typeof choice.id === "string" &&
                typeof choice.code === "string" &&
                typeof choice.name === "string"
            )
          );
          setActive(0);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setChoices([]);
      });
    return () => controller.abort();
  }, [open, disabled, org, kind, query]);
  function choose(choice: Dimension) {
    onChange(choice.code);
    setQuery(choice.code);
    setOpen(false);
  }
  if (disabled && displayName)
    return (
      <span aria-label={label}>
        {value} · {displayName}
      </span>
    );
  return (
    <div ref={anchor} className="relative min-w-32">
      <input
        className="h-9 w-full rounded border p-2"
        aria-label={label}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-activedescendant={open && choices[active] ? `${id}-${active}` : undefined}
        disabled={disabled}
        value={query}
        placeholder="Kod eller namn"
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onChange={(event) => {
          setQuery(event.target.value);
          onChange("");
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setActive((index) => Math.min(index + 1, Math.max(choices.length - 1, 0)));
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((index) => Math.max(index - 1, 0));
          }
          if (event.key === "Escape") setOpen(false);
          if (event.key === "Enter" && open && choices[active]) {
            event.preventDefault();
            choose(choices[active]!);
          }
        }}
      />
      {open && !disabled && (
        <FloatingOptions anchor={anchor}>
          <ul id={id} role="listbox" className="w-full rounded border bg-white shadow-lg">
            {choices.map((choice, index) => (
              <li
                id={`${id}-${index}`}
                key={choice.id}
                role="option"
                aria-selected={active === index}
                className={`cursor-pointer p-2 ${active === index ? "bg-accent-soft" : ""}`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(choice);
                }}
              >
                {choice.code} · {choice.name}
              </li>
            ))}
          </ul>
        </FloatingOptions>
      )}
    </div>
  );
}
