"use client";

import { FloatingOptions } from "@/components/ui/floating-options";
import { Search } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { getAccounts, type Account } from "@/lib/api/accounts";

export interface AccountChoice {
  id: string;
  name: string;
  number: string;
}

interface AccountTypeaheadProps {
  account: AccountChoice | null;
  ariaLabel?: string;
  disabled?: boolean;
  id: string;
  onAdvance?: () => void;
  onChange: (account: AccountChoice | null) => void;
  organizationId: string;
}

export function AccountTypeahead({
  account,
  ariaLabel,
  disabled = false,
  id,
  onAdvance,
  onChange,
  organizationId
}: Readonly<AccountTypeaheadProps>) {
  const listboxId = useId();
  const anchor = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [matches, setMatches] = useState<Account[]>([]);
  const [query, setQuery] = useState(account ? accountLabel(account) : "");

  useEffect(() => {
    setQuery(account ? accountLabel(account) : "");
  }, [account]);

  useEffect(() => {
    if (!isOpen || !organizationId) {
      return;
    }

    const controller = new AbortController();

    void getAccounts(organizationId, query, controller.signal)
      .then((accounts) => {
        if (controller.signal.aborted) return;
        setMatches(accounts.filter((candidate) => candidate.active));
        setActiveIndex(0);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setMatches([]);
        }
      });

    return () => controller.abort();
  }, [isOpen, organizationId, query]);

  function selectAccount(nextAccount: AccountChoice) {
    onChange(nextAccount);
    setQuery(accountLabel(nextAccount));
    setIsOpen(false);
  }

  return (
    <div ref={anchor} className="relative min-w-[12rem]">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted"
      />
      <input
        aria-label={ariaLabel}
        aria-activedescendant={
          isOpen && matches[activeIndex] ? `${listboxId}-${activeIndex}` : undefined
        }
        aria-autocomplete="list"
        aria-controls={isOpen ? listboxId : undefined}
        aria-expanded={isOpen}
        autoComplete="off"
        className="h-9 w-full rounded-md border border-border bg-white py-1.5 pl-8 pr-2 text-sm text-ink outline-none transition placeholder:text-muted focus:border-border focus:ring-3 focus:ring-focus disabled:bg-surface-muted"
        disabled={disabled}
        id={id}
        onBlur={() => window.setTimeout(() => setIsOpen(false), 120)}
        onChange={(event) => {
          setQuery(event.target.value);
          onChange(null);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setIsOpen(true);
            setActiveIndex((current) => Math.min(current + 1, Math.max(matches.length - 1, 0)));
          }

          if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((current) => Math.max(current - 1, 0));
          }

          if (event.key === "Escape") {
            setIsOpen(false);
          }

          if (event.key === "Enter") {
            const selected = matches[activeIndex];

            if (isOpen && selected) {
              event.preventDefault();
              selectAccount(selected);
            } else if (onAdvance) {
              event.preventDefault();
              onAdvance();
            }
          }
        }}
        placeholder="Konto"
        role="combobox"
        value={query}
      />
      {isOpen ? (
        <FloatingOptions anchor={anchor}>
          <ul
            className="w-full rounded-md border border-border bg-white py-1 shadow-lg"
            id={listboxId}
            role="listbox"
          >
            {matches.length > 0 ? (
              matches.map((candidate, index) => (
                <li
                  id={`${listboxId}-${index}`}
                  aria-selected={index === activeIndex}
                  className={`cursor-pointer px-3 py-2 text-sm ${
                    index === activeIndex
                      ? "bg-accent-soft text-ink"
                      : "text-secondary hover:bg-surface-muted"
                  }`}
                  key={candidate.id}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    selectAccount(candidate);
                  }}
                  role="option"
                >
                  <span className="font-semibold">{candidate.number}</span>
                  <span className="ml-2 text-muted">{candidate.name}</span>
                </li>
              ))
            ) : (
              <li
                className="px-3 py-3 text-sm text-muted"
                role="option"
                aria-disabled="true"
                aria-selected="false"
              >
                Inga aktiva konton matchar sökningen.
              </li>
            )}
          </ul>
        </FloatingOptions>
      ) : null}
    </div>
  );
}

function accountLabel(account: AccountChoice): string {
  return `${account.number} — ${account.name}`;
}
