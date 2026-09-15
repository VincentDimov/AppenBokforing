"use client";

import { Search } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { getAccounts, type Account } from "@/lib/api/accounts";

export interface AccountChoice {
  id: string;
  name: string;
  number: string;
}

interface AccountTypeaheadProps {
  account: AccountChoice | null;
  disabled?: boolean;
  id: string;
  onAdvance?: () => void;
  onChange: (account: AccountChoice | null) => void;
  organizationId: string;
}

export function AccountTypeahead({
  account,
  disabled = false,
  id,
  onAdvance,
  onChange,
  organizationId
}: Readonly<AccountTypeaheadProps>) {
  const listboxId = useId();
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
    <div className="relative min-w-[12rem]">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[#70909e]"
      />
      <input
        aria-autocomplete="list"
        aria-controls={isOpen ? listboxId : undefined}
        aria-expanded={isOpen}
        autoComplete="off"
        className="h-9 w-full rounded-md border border-[#cadbe3] bg-white py-1.5 pl-8 pr-2 text-sm text-[#17384b] outline-none transition placeholder:text-[#8aa0aa] focus:border-[#4b90aa] focus:ring-3 focus:ring-[#d8edf5] disabled:bg-[#f3f6f7]"
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
        <ul
          className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-[#bcd3de] bg-white py-1 shadow-[0_12px_26px_rgba(16,47,66,0.16)]"
          id={listboxId}
          role="listbox"
        >
          {matches.length > 0 ? (
            matches.map((candidate, index) => (
              <li
                aria-selected={index === activeIndex}
                className={`cursor-pointer px-3 py-2 text-sm ${
                  index === activeIndex
                    ? "bg-[#e4f2f7] text-[#10384c]"
                    : "text-[#365968] hover:bg-[#f1f7f9]"
                }`}
                key={candidate.id}
                onMouseDown={(event) => {
                  event.preventDefault();
                  selectAccount(candidate);
                }}
                role="option"
              >
                <span className="font-semibold">{candidate.number}</span>
                <span className="ml-2 text-[#5d7784]">{candidate.name}</span>
              </li>
            ))
          ) : (
            <li className="px-3 py-3 text-sm text-[#6d8792]" role="option">
              Inga aktiva konton matchar sökningen.
            </li>
          )}
        </ul>
      ) : null}
    </div>
  );
}

function accountLabel(account: AccountChoice): string {
  return `${account.number} — ${account.name}`;
}
