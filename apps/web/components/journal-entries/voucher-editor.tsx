"use client";

import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  LoaderCircle,
  Paperclip,
  Plus,
  RotateCcw,
  Save,
  Trash2
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  AccountTypeahead,
  type AccountChoice
} from "@/components/journal-entries/account-typeahead";
import { VoucherAttachments } from "@/components/journal-entries/voucher-attachments";
import { useAuth } from "@/components/auth/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  createJournalEntry,
  getJournalEntry,
  getJournalEntryOptions,
  postJournalEntry,
  reverseJournalEntry,
  updateJournalEntry,
  type JournalEntry,
  type JournalEntryInput,
  type JournalEntryOptions
} from "@/lib/api/journal-entries";
import { calculateVoucherAmounts, formatOre, isValidJournalAmountLine } from "@/lib/vouchers";

interface EditableLine {
  account: AccountChoice | null;
  clientId: string;
  costCenterCode: string;
  credit: string;
  debit: string;
  description: string;
  projectCode: string;
  vatCode: string;
}

interface VoucherEditorProps {
  entryId?: string;
}

const writeRoles = new Set(["OWNER", "ADMIN", "ACCOUNTANT"]);

export function VoucherEditor({ entryId }: Readonly<VoucherEditorProps>) {
  const router = useRouter();
  const { activeOrganization, activeOrganizationId, organizationsStatus } = useAuth();
  const [description, setDescription] = useState("");
  const [attachmentsUploading, setAttachmentsUploading] = useState(false);
  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(entryId));
  const [isSaving, setIsSaving] = useState(false);
  const [lines, setLines] = useState<EditableLine[]>(() => [createLine(), createLine()]);
  const [options, setOptions] = useState<JournalEntryOptions | null>(null);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [reversalDate, setReversalDate] = useState(today());
  const [reversalDescription, setReversalDescription] = useState("");
  const [reversalOptions, setReversalOptions] = useState<JournalEntryOptions | null>(null);
  const [reversalOptionsError, setReversalOptionsError] = useState<string | null>(null);
  const [reversalOptionsLoading, setReversalOptionsLoading] = useState(false);
  const [reversalSeriesId, setReversalSeriesId] = useState("");
  const [showReversalConfirmation, setShowReversalConfirmation] = useState(false);
  const [transactionDate, setTransactionDate] = useState(today());
  const [voucherSeriesId, setVoucherSeriesId] = useState("");
  const nextLineToFocus = useRef<string | null>(null);

  const canWrite = activeOrganization ? writeRoles.has(activeOrganization.role) : false;
  const isDraft = !entry || entry.status === "DRAFT";
  const isEditable = canWrite && isDraft && !isSaving && !attachmentsUploading;
  const amounts = calculateVoucherAmounts(lines);
  const hasValidLines =
    lines.length > 0 &&
    lines.every((line) => line.account !== null && isValidJournalAmountLine(line));
  const canSave =
    isEditable &&
    Boolean(activeOrganizationId && voucherSeriesId && description.trim() && transactionDate) &&
    hasValidLines;
  const isBalanced = amounts !== null && amounts.debit > 0n && amounts.difference === 0n;
  const canPost = canSave && lines.length >= 2 && isBalanced;
  const canCreateCorrection = Boolean(
    entry &&
    entry.status === "POSTED" &&
    canWrite &&
    !isSaving &&
    !entry.reversesEntryId &&
    !entry.reversedByEntryId
  );
  const correctionTargetIsOpen =
    reversalOptions?.accountingPeriod.status === "OPEN" &&
    reversalOptions.fiscalYear.status === "OPEN";
  const canConfirmCorrection = Boolean(
    canCreateCorrection &&
    isIsoDate(reversalDate) &&
    reversalSeriesId &&
    correctionTargetIsOpen &&
    !reversalOptionsLoading
  );

  useEffect(() => {
    if (!entryId) {
      setEntry(null);
      setDescription("");
      setLines([createLine(), createLine()]);
      setTransactionDate(today());
      setVoucherSeriesId("");
      setError(null);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);
    setError(null);

    void getJournalEntry(entryId, controller.signal)
      .then((loadedEntry) => applyEntry(loadedEntry))
      .catch((caughtError: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Verifikationen kunde inte laddas. Försök igen."
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, [entryId]);

  useEffect(() => {
    if (!activeOrganizationId || !isIsoDate(transactionDate)) {
      setOptions(null);
      return;
    }

    const controller = new AbortController();
    setOptionsLoading(true);
    setOptionsError(null);

    void getJournalEntryOptions(activeOrganizationId, transactionDate, controller.signal)
      .then((loadedOptions) => {
        setOptions(loadedOptions);
        setVoucherSeriesId((current) => {
          if (current && loadedOptions.voucherSeries.some((series) => series.id === current)) {
            return current;
          }

          return loadedOptions.voucherSeries[0]?.id ?? "";
        });
      })
      .catch((caughtError: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setOptions(null);
        setOptionsError(
          caughtError instanceof Error
            ? caughtError.message
            : "Kalender och verifikationsserier kunde inte laddas."
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setOptionsLoading(false);
        }
      });

    return () => controller.abort();
  }, [activeOrganizationId, transactionDate]);

  useEffect(() => {
    if (!showReversalConfirmation || !activeOrganizationId || !isIsoDate(reversalDate)) {
      setReversalOptions(null);
      return;
    }

    const controller = new AbortController();
    setReversalOptionsLoading(true);
    setReversalOptionsError(null);

    void getJournalEntryOptions(activeOrganizationId, reversalDate, controller.signal)
      .then((loadedOptions) => {
        setReversalOptions(loadedOptions);
        setReversalSeriesId((current) => {
          if (current && loadedOptions.voucherSeries.some((series) => series.id === current)) {
            return current;
          }

          return loadedOptions.voucherSeries[0]?.id ?? "";
        });
      })
      .catch((caughtError: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setReversalOptions(null);
        setReversalOptionsError(
          caughtError instanceof Error
            ? caughtError.message
            : "Kalender och verifikationsserier kunde inte laddas."
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setReversalOptionsLoading(false);
        }
      });

    return () => controller.abort();
  }, [activeOrganizationId, reversalDate, showReversalConfirmation]);

  useEffect(() => {
    const targetId = nextLineToFocus.current;

    if (!targetId) {
      return;
    }

    document.getElementById(`voucher-account-${targetId}`)?.focus();
    nextLineToFocus.current = null;
  }, [lines]);

  function applyEntry(nextEntry: JournalEntry) {
    setDescription(nextEntry.description);
    setEntry(nextEntry);
    setLines(
      nextEntry.lines.map((line) => ({
        account: line.account,
        clientId: line.id,
        costCenterCode: line.costCenter?.code ?? "",
        credit: line.credit,
        debit: line.debit,
        description: line.description ?? "",
        projectCode: line.project?.code ?? "",
        vatCode: line.vatCode?.code ?? ""
      }))
    );
    setTransactionDate(nextEntry.transactionDate);
    setVoucherSeriesId(nextEntry.voucherSeries?.id ?? "");
  }

  function updateLine(
    clientId: string,
    field: keyof Omit<EditableLine, "clientId">,
    value: string
  ) {
    setLines((current) =>
      current.map((line) => (line.clientId === clientId ? { ...line, [field]: value } : line))
    );
  }

  function updateAccount(clientId: string, account: AccountChoice | null) {
    setLines((current) =>
      current.map((line) => (line.clientId === clientId ? { ...line, account } : line))
    );
  }

  function addLine(focusAccount = false) {
    const nextLine = createLine();

    if (focusAccount) {
      nextLineToFocus.current = nextLine.clientId;
    }

    setLines((current) => [...current, nextLine]);
  }

  function removeLine(clientId: string) {
    if (lines.length <= 1) {
      return;
    }

    setLines((current) => current.filter((line) => line.clientId !== clientId));
  }

  function buildInput(): Omit<JournalEntryInput, "organizationId"> | null {
    if (!voucherSeriesId || !description.trim() || !isIsoDate(transactionDate) || !hasValidLines) {
      setError("Fyll i huvud och alla konteringsrader med ett giltigt konto och belopp.");
      return null;
    }

    return {
      description: description.trim(),
      lines: lines.map((line) => ({
        accountId: line.account!.id,
        costCenterCode: cleanOptionalCode(line.costCenterCode),
        credit: normalizeMoney(line.credit),
        debit: normalizeMoney(line.debit),
        description: line.description.trim() || null,
        projectCode: cleanOptionalCode(line.projectCode),
        vatCode: cleanOptionalCode(line.vatCode)
      })),
      transactionDate,
      voucherSeriesId
    };
  }

  async function persistDraft(navigateAfterSave: boolean): Promise<JournalEntry | null> {
    const input = buildInput();

    if (!input || !activeOrganizationId) {
      return null;
    }

    setIsSaving(true);
    setError(null);

    try {
      const saved = entry
        ? await updateJournalEntry(entry.id, input)
        : await createJournalEntry({ ...input, organizationId: activeOrganizationId });

      applyEntry(saved);

      if (navigateAfterSave && !entry) {
        router.replace(`/app/bookkeeping/vouchers/${saved.id}`);
      }

      return saved;
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Utkastet kunde inte sparas.");
      return null;
    } finally {
      setIsSaving(false);
    }
  }

  async function handlePost() {
    if (!canPost) {
      setError("Verifikationen måste ha minst två giltiga rader och skillnaden måste vara 0,00.");
      return;
    }

    const saved = entry ?? (await persistDraft(false));

    if (!saved) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const posted = await postJournalEntry(saved.id);
      applyEntry(posted);
      router.replace(`/app/bookkeeping/vouchers/${posted.id}`);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Verifikationen kunde inte bokföras."
      );
    } finally {
      setIsSaving(false);
    }
  }

  function openReversalConfirmation() {
    setError(null);
    setReversalDate(today());
    setReversalDescription("");
    setReversalOptions(null);
    setReversalOptionsError(null);
    setReversalSeriesId("");
    setShowReversalConfirmation(true);
  }

  async function handleReverse() {
    if (!entry || !canConfirmCorrection) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const correction = await reverseJournalEntry(entry.id, {
        ...(reversalDescription.trim() ? { description: reversalDescription.trim() } : {}),
        transactionDate: reversalDate,
        voucherSeriesId: reversalSeriesId
      });

      setShowReversalConfirmation(false);
      router.replace(`/app/bookkeeping/vouchers/${correction.id}`);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Rättelsen kunde inte bokföras."
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (organizationsStatus === "idle" || organizationsStatus === "loading" || isLoading) {
    return <VoucherEditorMessage message="Laddar verifikation…" />;
  }

  if (!activeOrganization) {
    return (
      <VoucherEditorMessage message="Välj eller skapa en organisation innan du arbetar med verifikationer." />
    );
  }

  if (error && entryId && !entry) {
    return <VoucherEditorMessage message={error} />;
  }

  const selectedSeries = options?.voucherSeries.find((series) => series.id === voucherSeriesId);
  const selectedReversalSeries = reversalOptions?.voucherSeries.find(
    (series) => series.id === reversalSeriesId
  );
  const pageTitle = entry?.voucherNumber
    ? `Verifikation ${entry.voucherSeries?.code ?? ""}${entry.voucherNumber}`
    : entry
      ? "Utkast till verifikation"
      : "Ny verifikation";

  return (
    <div className="mx-auto max-w-[1500px]">
      <header className="flex flex-col gap-5 border-b border-[#ccdce4] pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[#537786] hover:text-[#12374c]"
            href="/app/bookkeeping/vouchers"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Alla verifikationer
          </Link>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div>
              <p className="text-xs font-semibold tracking-[0.13em] text-[#638292] uppercase">
                Bokföring
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-[#12374c] sm:text-4xl">
                {pageTitle}
              </h1>
            </div>
            {entry ? (
              <StatusBadge status={entry.status} />
            ) : (
              <Badge variant="warning">Utkast</Badge>
            )}
          </div>
          <p className="mt-3 text-sm leading-6 text-[#58717e]">
            {entry?.status === "POSTED"
              ? "Bokförda belopp är låsta. Spårbarheten bevaras i revisionsloggen."
              : "Belopp hanteras i ören i gränssnittet och valideras som Decimal i databasen."}
          </p>
        </div>
        {entry?.status === "POSTED" ? (
          <div className="flex flex-wrap items-center gap-3 border border-[#b7ddca] bg-[#eff9f3] px-4 py-3 text-sm text-[#256447]">
            <span className="flex items-center gap-2">
              <CheckCircle2 aria-hidden="true" className="size-4" />
              Bokförd {entry.postedAt ? new Date(entry.postedAt).toLocaleDateString("sv-SE") : ""}
            </span>
            {canCreateCorrection ? (
              <Button onClick={openReversalConfirmation} size="sm" type="button" variant="outline">
                <RotateCcw aria-hidden="true" className="size-3.5" />
                Skapa rättelse
              </Button>
            ) : null}
          </div>
        ) : null}
      </header>

      {error ? (
        <div
          className="mt-6 flex items-start gap-3 border-l-2 border-[#c76b52] bg-[#fff6f2] px-4 py-4 text-sm leading-6 text-[#914a38]"
          role="alert"
        >
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <p>{error}</p>
        </div>
      ) : null}

      {entry?.reversesEntry || entry?.reversedByEntry ? (
        <VoucherRelationshipPanel
          correction={entry.reversedByEntry}
          original={entry.reversesEntry}
        />
      ) : null}

      {entry ? (
        <VoucherAttachments
          canUpload={canWrite && entry.status === "DRAFT" && !isSaving}
          isDraft={entry.status === "DRAFT"}
          journalEntryId={entry.id}
          onUploadingChange={setAttachmentsUploading}
        />
      ) : (
        <section className="mt-6 border border-[#d6e3e9] bg-[#f7fafb] px-5 py-4 text-sm leading-6 text-[#58717e] md:px-6">
          <span className="mr-2 inline-flex align-middle text-[#24627c]">
            <Paperclip aria-hidden="true" className="size-4" />
          </span>
          Spara utkastet fÃ¶rst fÃ¶r att lÃ¤gga till underlag. Bilagor bevaras sedan nÃ¤r
          verifikationen bokfÃ¶rs.
        </section>
      )}

      {showReversalConfirmation && entry ? (
        <section className="mt-6 border border-[#e2cbbd] bg-[#fffaf6] p-5 shadow-[0_8px_22px_rgba(81,48,22,0.04)] md:p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-[-0.025em] text-[#583827]">
                Skapa rättelse
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-[#785a49]">
                En ny bokförd motverifikation skapas med omvänd debet och kredit. Originalet är låst
                och ändras inte.
              </p>
            </div>
            <Badge variant="outline">Steg 2 av 2</Badge>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-[minmax(11rem,0.7fr)_minmax(13rem,0.9fr)_minmax(0,1.5fr)]">
            <label className="block">
              <span className="text-xs font-semibold tracking-[0.1em] text-[#795d4c] uppercase">
                Rättelsedatum
              </span>
              <input
                className="mt-2 h-10 w-full rounded-lg border border-[#dcc6b8] bg-white px-3 text-sm text-[#3e3029] outline-none focus:border-[#b87b58] focus:ring-4 focus:ring-[#f6e2d5]"
                disabled={isSaving}
                onChange={(event) => setReversalDate(event.target.value)}
                type="date"
                value={reversalDate}
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold tracking-[0.1em] text-[#795d4c] uppercase">
                Rättelseserie
              </span>
              <select
                className="mt-2 h-10 w-full rounded-lg border border-[#dcc6b8] bg-white px-3 text-sm text-[#3e3029] outline-none focus:border-[#b87b58] focus:ring-4 focus:ring-[#f6e2d5] disabled:bg-[#f7eee8]"
                disabled={isSaving || reversalOptionsLoading}
                onChange={(event) => setReversalSeriesId(event.target.value)}
                value={reversalSeriesId}
              >
                <option value="">{reversalOptionsLoading ? "Laddar serier…" : "Välj serie"}</option>
                {reversalOptions?.voucherSeries.map((series) => (
                  <option key={series.id} value={series.id}>
                    {series.code} — {series.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold tracking-[0.1em] text-[#795d4c] uppercase">
                Beskrivning (valfri)
              </span>
              <input
                className="mt-2 h-10 w-full rounded-lg border border-[#dcc6b8] bg-white px-3 text-sm text-[#3e3029] outline-none placeholder:text-[#9c8577] focus:border-[#b87b58] focus:ring-4 focus:ring-[#f6e2d5] disabled:bg-[#f7eee8]"
                disabled={isSaving}
                maxLength={500}
                onChange={(event) => setReversalDescription(event.target.value)}
                placeholder={`Rättelse av ${entry.voucherSeries?.code ?? ""}${entry.voucherNumber ?? ""}`}
                value={reversalDescription}
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[#795d4c]">
            <span>
              Räkenskapsår: <strong>{reversalOptions?.fiscalYear.name ?? "—"}</strong>
            </span>
            <span>
              Period: <strong>{reversalOptions?.accountingPeriod.periodNumber ?? "—"}</strong>
            </span>
            {selectedReversalSeries ? <span>Serie {selectedReversalSeries.code}</span> : null}
            {reversalOptions?.accountingPeriod.status === "LOCKED" ? (
              <span className="font-medium text-[#a04f39]">Målperioden är låst.</span>
            ) : null}
            {reversalOptions?.fiscalYear.status === "CLOSED" ? (
              <span className="font-medium text-[#a04f39]">Målräkenskapsåret är stängt.</span>
            ) : null}
            {reversalOptionsError ? (
              <span className="font-medium text-[#a04f39]">{reversalOptionsError}</span>
            ) : null}
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Button
              disabled={isSaving}
              onClick={() => setShowReversalConfirmation(false)}
              type="button"
              variant="outline"
            >
              Avbryt
            </Button>
            <Button
              disabled={!canConfirmCorrection}
              onClick={() => void handleReverse()}
              type="button"
            >
              {isSaving ? (
                <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
              ) : (
                <RotateCcw aria-hidden="true" className="size-4" />
              )}
              Bekräfta och bokför rättelse
            </Button>
          </div>
        </section>
      ) : null}

      {!canWrite && isDraft ? (
        <div className="mt-6 border border-[#d7e4e9] bg-[#f7fafb] px-4 py-3 text-sm text-[#58717e]">
          Du har läsbehörighet. Owner, admin eller accountant krävs för att ändra eller bokföra.
        </div>
      ) : null}

      <section className="mt-6 border border-[#d6e3e9] bg-white shadow-[0_8px_22px_rgba(16,47,66,0.035)]">
        <div className="grid gap-5 border-b border-[#e1ebef] p-5 md:grid-cols-2 xl:grid-cols-[minmax(13rem,0.8fr)_minmax(10rem,0.55fr)_minmax(0,1.7fr)] md:p-6">
          <label className="block">
            <span className="text-xs font-semibold tracking-[0.1em] text-[#64818f] uppercase">
              Serie
            </span>
            <select
              className="mt-2 h-10 w-full rounded-lg border border-[#cbdbe3] bg-white px-3 text-sm text-[#17384b] outline-none focus:border-[#4a8fa9] focus:ring-4 focus:ring-[#d8edf5] disabled:bg-[#f3f6f7]"
              disabled={!isEditable || optionsLoading}
              onChange={(event) => setVoucherSeriesId(event.target.value)}
              value={voucherSeriesId}
            >
              <option value="">{optionsLoading ? "Laddar serier…" : "Välj serie"}</option>
              {options?.voucherSeries.map((series) => (
                <option key={series.id} value={series.id}>
                  {series.code} — {series.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-semibold tracking-[0.1em] text-[#64818f] uppercase">
              Bokföringsdatum
            </span>
            <input
              className="mt-2 h-10 w-full rounded-lg border border-[#cbdbe3] bg-white px-3 text-sm text-[#17384b] outline-none focus:border-[#4a8fa9] focus:ring-4 focus:ring-[#d8edf5] disabled:bg-[#f3f6f7]"
              disabled={!isEditable}
              onChange={(event) => setTransactionDate(event.target.value)}
              type="date"
              value={transactionDate}
            />
          </label>
          <label className="block md:col-span-2 xl:col-span-1">
            <span className="text-xs font-semibold tracking-[0.1em] text-[#64818f] uppercase">
              Beskrivning
            </span>
            <input
              className="mt-2 h-10 w-full rounded-lg border border-[#cbdbe3] bg-white px-3 text-sm text-[#17384b] outline-none placeholder:text-[#8298a3] focus:border-[#4a8fa9] focus:ring-4 focus:ring-[#d8edf5] disabled:bg-[#f3f6f7]"
              disabled={!isEditable}
              maxLength={500}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Till exempel kundbetalning eller leverantörsfaktura"
              value={description}
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 border-b border-[#e1ebef] bg-[#f7fafb] px-5 py-3 text-xs text-[#64818f] md:px-6">
          <span>
            Räkenskapsår:{" "}
            <strong className="font-semibold text-[#294f62]">
              {options?.fiscalYear.name ?? entry?.fiscalYear.name ?? "—"}
            </strong>
          </span>
          <span>
            Period:{" "}
            <strong className="font-semibold text-[#294f62]">
              {options?.accountingPeriod.periodNumber ??
                entry?.accountingPeriod.periodNumber ??
                "—"}
            </strong>
          </span>
          {optionsError ? <span className="text-[#a4503a]">{optionsError}</span> : null}
          {selectedSeries ? <span>Serie {selectedSeries.code}</span> : null}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="border-b border-[#e5edf1] bg-[#f7fafb] text-[11px] font-semibold tracking-[0.08em] text-[#6c8490] uppercase">
              <tr>
                <th className="w-[16rem] px-4 py-3.5 font-semibold md:px-6">Konto</th>
                <th className="min-w-[13rem] px-3 py-3.5 font-semibold">Beskrivning</th>
                <th className="w-[8rem] px-3 py-3.5 font-semibold">Kst.</th>
                <th className="w-[8rem] px-3 py-3.5 font-semibold">Projekt</th>
                <th className="w-[8rem] px-3 py-3.5 font-semibold">Moms</th>
                <th className="w-[8.5rem] px-3 py-3.5 text-right font-semibold">Debet</th>
                <th className="w-[8.5rem] px-3 py-3.5 text-right font-semibold">Kredit</th>
                <th className="w-12 px-3 py-3.5" />
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <tr className="border-b border-[#edf2f4] last:border-b-0" key={line.clientId}>
                  <td className="px-4 py-2 md:px-6">
                    <AccountTypeahead
                      account={line.account}
                      disabled={!isEditable}
                      id={`voucher-account-${line.clientId}`}
                      onAdvance={() =>
                        document.getElementById(`voucher-description-${line.clientId}`)?.focus()
                      }
                      onChange={(account) => updateAccount(line.clientId, account)}
                      organizationId={activeOrganizationId}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <TableInput
                      disabled={!isEditable}
                      id={`voucher-description-${line.clientId}`}
                      onChange={(value) => updateLine(line.clientId, "description", value)}
                      placeholder="Radbeskrivning"
                      value={line.description}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <TableInput
                      disabled={!isEditable}
                      onChange={(value) =>
                        updateLine(line.clientId, "costCenterCode", value.toUpperCase())
                      }
                      placeholder="Kod"
                      value={line.costCenterCode}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <TableInput
                      disabled={!isEditable}
                      onChange={(value) =>
                        updateLine(line.clientId, "projectCode", value.toUpperCase())
                      }
                      placeholder="Kod"
                      value={line.projectCode}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <TableInput
                      disabled={!isEditable}
                      onChange={(value) =>
                        updateLine(line.clientId, "vatCode", value.toUpperCase())
                      }
                      placeholder="Kod"
                      value={line.vatCode}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <TableInput
                      align="right"
                      ariaLabel={`Debet rad ${index + 1}`}
                      disabled={!isEditable}
                      inputMode="decimal"
                      onChange={(value) => updateLine(line.clientId, "debit", value)}
                      placeholder="0,00"
                      value={line.debit}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <TableInput
                      align="right"
                      ariaLabel={`Kredit rad ${index + 1}`}
                      disabled={!isEditable}
                      inputMode="decimal"
                      onChange={(value) => updateLine(line.clientId, "credit", value)}
                      onKeyDown={(event) => {
                        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                          event.preventDefault();
                          void handlePost();
                        } else if (event.key === "Enter" && index === lines.length - 1) {
                          event.preventDefault();
                          addLine(true);
                        }
                      }}
                      placeholder="0,00"
                      value={line.credit}
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      aria-label={`Ta bort rad ${index + 1}`}
                      className="grid size-8 place-items-center rounded-md text-[#79929d] hover:bg-[#fff0eb] hover:text-[#a7503b] disabled:opacity-40"
                      disabled={!isEditable || lines.length <= 1}
                      onClick={() => removeLine(line.clientId)}
                      type="button"
                    >
                      <Trash2 aria-hidden="true" className="size-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-5 border-t border-[#dce8ed] bg-[#f8fbfc] p-5 md:flex-row md:items-end md:justify-between md:px-6">
          <div>
            {isDraft ? (
              <Button
                disabled={!isEditable}
                onClick={() => addLine(true)}
                type="button"
                variant="outline"
              >
                <Plus aria-hidden="true" className="size-4" />
                Lägg till rad
              </Button>
            ) : null}
            <p className="mt-3 text-xs leading-5 text-[#66818e]">
              Enter på sista kreditfältet lägger till en rad. Ctrl/Cmd + Enter försöker bokföra.
            </p>
          </div>
          <div className="w-full max-w-lg">
            <dl className="grid grid-cols-3 gap-3 text-right text-sm">
              <AmountSummary label="Summa debet" value={amounts ? formatOre(amounts.debit) : "—"} />
              <AmountSummary
                label="Summa kredit"
                value={amounts ? formatOre(amounts.credit) : "—"}
              />
              <AmountSummary
                emphasis
                label="Differens"
                negative={Boolean(amounts && amounts.difference !== 0n)}
                value={amounts ? formatOre(amounts.difference) : "—"}
              />
            </dl>
            {isDraft ? (
              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
                <Button
                  disabled={!canSave}
                  onClick={() => void persistDraft(true)}
                  type="button"
                  variant="outline"
                >
                  {isSaving ? (
                    <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                  ) : (
                    <Save aria-hidden="true" className="size-4" />
                  )}
                  Spara utkast
                </Button>
                <Button disabled={!canPost} onClick={() => void handlePost()} type="button">
                  {isSaving ? (
                    <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                  ) : (
                    <CheckCircle2 aria-hidden="true" className="size-4" />
                  )}
                  Bokför verifikation
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

function TableInput({
  align = "left",
  ariaLabel,
  disabled,
  id,
  inputMode,
  onChange,
  onKeyDown,
  placeholder,
  value
}: Readonly<{
  align?: "left" | "right";
  ariaLabel?: string;
  disabled: boolean;
  id?: string;
  inputMode?: "decimal" | "text";
  onChange: (value: string) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  placeholder: string;
  value: string;
}>) {
  return (
    <input
      aria-label={ariaLabel}
      className={`h-9 w-full rounded-md border border-[#cadbe3] bg-white px-2 text-sm text-[#17384b] outline-none placeholder:text-[#90a3ac] focus:border-[#4b90aa] focus:ring-3 focus:ring-[#d8edf5] disabled:bg-[#f3f6f7] ${
        align === "right" ? "text-right tabular-nums" : ""
      }`}
      disabled={disabled}
      id={id}
      inputMode={inputMode}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      value={value}
    />
  );
}

function AmountSummary({
  emphasis = false,
  label,
  negative = false,
  value
}: Readonly<{ emphasis?: boolean; label: string; negative?: boolean; value: string }>) {
  return (
    <div className={emphasis ? "border-l border-[#d7e4e9] pl-3" : ""}>
      <dt className="text-[10px] font-semibold tracking-[0.09em] text-[#68838f] uppercase">
        {label}
      </dt>
      <dd
        className={`mt-1 font-semibold tabular-nums ${
          negative ? "text-[#a5503b]" : emphasis ? "text-[#1b6549]" : "text-[#244b60]"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function StatusBadge({ status }: Readonly<{ status: JournalEntry["status"] }>) {
  if (status === "POSTED") {
    return <Badge variant="success">Bokförd</Badge>;
  }

  if (status === "REVERSED") {
    return <Badge variant="outline">Makulerad</Badge>;
  }

  return <Badge variant="warning">Utkast</Badge>;
}

function VoucherRelationshipPanel({
  correction,
  original
}: Readonly<{
  correction: JournalEntry["reversedByEntry"];
  original: JournalEntry["reversesEntry"];
}>) {
  return (
    <section className="mt-6 border border-[#d2e2e7] bg-[#f4fafb] px-5 py-4 text-sm text-[#365869] md:px-6">
      <p className="text-xs font-semibold tracking-[0.1em] text-[#638292] uppercase">
        Kopplade verifikationer
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {original ? (
          <VoucherRelationshipLink entry={original} label="Original verifikation" />
        ) : null}
        {correction ? (
          <VoucherRelationshipLink entry={correction} label="Rättelseverifikation" />
        ) : null}
      </div>
    </section>
  );
}

function VoucherRelationshipLink({
  entry,
  label
}: Readonly<{
  entry: NonNullable<JournalEntry["reversesEntry"]>;
  label: string;
}>) {
  const identity = entry.voucherNumber
    ? `${entry.voucherSeries?.code ?? ""}${entry.voucherNumber}`
    : "Utan verifikationsnummer";

  return (
    <Link
      className="inline-flex items-center gap-2 rounded-md border border-[#c9dce3] bg-white px-3 py-2 font-medium text-[#1c526b] hover:border-[#83aeba] hover:bg-[#eaf5f7]"
      href={`/app/bookkeeping/vouchers/${entry.id}`}
    >
      <span className="text-[#68838f]">{label}</span>
      <span>{identity}</span>
      <span className="text-xs text-[#68838f]">{entry.transactionDate}</span>
    </Link>
  );
}

function VoucherEditorMessage({ message }: Readonly<{ message: string }>) {
  return (
    <section className="mx-auto max-w-4xl border border-[#d6e3e9] bg-white p-6 text-sm leading-6 text-[#58717e] shadow-[0_8px_22px_rgba(16,47,66,0.035)] sm:p-8">
      {message}
    </section>
  );
}

function cleanOptionalCode(value: string): string | null {
  return value.trim() ? value.trim().toUpperCase() : null;
}

function createLine(): EditableLine {
  return {
    account: null,
    clientId:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `line-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    costCenterCode: "",
    credit: "0,00",
    debit: "0,00",
    description: "",
    projectCode: "",
    vatCode: ""
  };
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeMoney(value: string): string {
  return value.trim().replace(",", ".");
}

function today(): string {
  const date = new Date();
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);

  return offsetDate.toISOString().slice(0, 10);
}
