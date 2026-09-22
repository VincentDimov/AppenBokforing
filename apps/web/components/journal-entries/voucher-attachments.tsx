"use client";

import { Download, FileText, LoaderCircle, UploadCloud } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  getAttachmentDownload,
  getJournalEntryAttachments,
  uploadJournalEntryAttachment,
  type JournalEntryAttachment
} from "@/lib/api/attachments";

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const acceptedExtensions = new Map([
  ["pdf", "application/pdf"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["png", "image/png"],
  ["webp", "image/webp"]
]);

interface VoucherAttachmentsProps {
  canUpload: boolean;
  isDraft: boolean;
  journalEntryId: string;
  onUploadingChange: (isUploading: boolean) => void;
}

/** Evidence is uploaded only to saved drafts and remains readable after posting. */
export function VoucherAttachments({
  canUpload,
  isDraft,
  journalEntryId,
  onUploadingChange
}: Readonly<VoucherAttachmentsProps>) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<JournalEntryAttachment[]>([]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setError(null);

    void getJournalEntryAttachments(journalEntryId, controller.signal)
      .then((loadedAttachments) => setAttachments(loadedAttachments))
      .catch((caughtError: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            caughtError instanceof Error ? caughtError.message : "Bilagorna kunde inte laddas."
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, [journalEntryId]);

  async function handleFiles(files: FileList | File[]) {
    if (!canUpload || !isDraft || isUploading) {
      return;
    }

    const selectedFiles = Array.from(files);

    if (selectedFiles.length === 0) {
      return;
    }

    const firstClientError = selectedFiles.map(validateClientFile).find(Boolean);

    if (firstClientError) {
      setError(firstClientError);
      return;
    }

    setError(null);
    setIsUploading(true);
    onUploadingChange(true);

    try {
      for (const file of selectedFiles) {
        const uploaded = await uploadJournalEntryAttachment(journalEntryId, file);
        setAttachments((current) => [uploaded, ...current]);
      }
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Bilagan kunde inte laddas upp."
      );
    } finally {
      setIsUploading(false);
      onUploadingChange(false);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function downloadAttachment(attachment: JournalEntryAttachment) {
    if (downloadingId) {
      return;
    }

    setDownloadingId(attachment.id);
    setError(null);

    try {
      const { downloadUrl } = await getAttachmentDownload(attachment.id);
      window.location.assign(downloadUrl);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Nedladdningen kunde inte startas."
      );
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <section
      aria-labelledby="voucher-attachments-heading"
      className="mt-6 border border-[#d6e3e9] bg-white shadow-[0_8px_22px_rgba(16,47,66,0.035)]"
    >
      <div className="flex flex-col gap-2 border-b border-[#e1ebef] px-5 py-4 md:flex-row md:items-center md:justify-between md:px-6">
        <div>
          <p className="text-xs font-semibold tracking-[0.1em] text-[#64818f] uppercase">
            Underlag
          </p>
          <h2
            className="mt-1 text-lg font-semibold tracking-[-0.025em] text-[#17384b]"
            id="voucher-attachments-heading"
          >
            Bilagor
          </h2>
        </div>
        <p className="text-xs leading-5 text-[#66818e]">
          PDF, JPEG, PNG eller WEBP — högst 10 MiB.
        </p>
      </div>

      {isDraft ? (
        <div className="p-5 md:p-6">
          <input
            accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={!canUpload || isUploading}
            id={`voucher-attachments-${journalEntryId}`}
            multiple
            onChange={(event) => void handleFiles(event.target.files ?? [])}
            ref={fileInputRef}
            type="file"
          />
          <label
            aria-describedby="voucher-attachments-help"
            className={`flex min-h-32 cursor-pointer flex-col items-center justify-center border border-dashed px-5 py-6 text-center transition-colors focus-within:ring-4 focus-within:ring-[#d8edf5] ${
              isDragging
                ? "border-[#4b90aa] bg-[#edf8fb]"
                : "border-[#bfd5df] bg-[#f8fbfc] hover:border-[#78a9ba] hover:bg-[#f1f8fa]"
            } ${!canUpload || isUploading ? "cursor-not-allowed opacity-60" : ""}`}
            htmlFor={`voucher-attachments-${journalEntryId}`}
            onDragEnter={(event) => {
              event.preventDefault();
              if (canUpload && !isUploading) {
                setIsDragging(true);
              }
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              setIsDragging(false);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              void handleFiles(event.dataTransfer.files);
            }}
            onKeyDown={(event) => {
              if ((event.key === "Enter" || event.key === " ") && canUpload && !isUploading) {
                event.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            role="button"
            tabIndex={canUpload && !isUploading ? 0 : -1}
          >
            {isUploading ? (
              <LoaderCircle aria-hidden="true" className="size-6 animate-spin text-[#24627c]" />
            ) : (
              <UploadCloud aria-hidden="true" className="size-6 text-[#24627c]" />
            )}
            <span className="mt-3 text-sm font-semibold text-[#1b5068]">
              {isUploading ? "Laddar upp underlag…" : "Släpp filer här eller välj filer"}
            </span>
            <span className="mt-1 text-xs leading-5 text-[#66818e]" id="voucher-attachments-help">
              Filnamnet används bara för visning. Lagringsnyckel och kontrollsumma skapas på
              servern.
            </span>
          </label>
          {!canUpload ? (
            <p className="mt-3 text-xs leading-5 text-[#66818e]">
              Du behöver skrivbehörighet för att ladda upp bilagor.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="border-b border-[#e1ebef] bg-[#f7fafb] px-5 py-3 text-sm text-[#58717e] md:px-6">
          Bilagorna bevaras med den bokförda verifikationen. Nya filer kan inte läggas till efter
          bokföring.
        </p>
      )}

      {error ? (
        <p
          className="mx-5 mt-4 border-l-2 border-[#c76b52] bg-[#fff6f2] px-3 py-2 text-sm text-[#914a38] md:mx-6"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div aria-live="polite" className="divide-y divide-[#e8eff2]">
        {isLoading ? (
          <p className="px-5 py-4 text-sm text-[#66818e] md:px-6">Laddar bilagor…</p>
        ) : attachments.length === 0 ? (
          <p className="px-5 py-4 text-sm text-[#66818e] md:px-6">Inga bilagor är kopplade ännu.</p>
        ) : (
          attachments.map((attachment) => (
            <article
              className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between md:px-6"
              key={attachment.id}
            >
              <div className="flex min-w-0 items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-md bg-[#e9f4f7] text-[#24627c]">
                  <FileText aria-hidden="true" className="size-4" />
                </span>
                <div className="min-w-0">
                  <p
                    className="truncate text-sm font-semibold text-[#244b60]"
                    title={attachment.originalName}
                  >
                    {attachment.originalName}
                  </p>
                  <p className="mt-1 text-xs text-[#66818e]">
                    {formatSize(attachment.size)} • {formatMimeType(attachment.mimeType)} •{" "}
                    {new Date(attachment.createdAt).toLocaleDateString("sv-SE")}
                    {attachment.uploadedBy ? ` • ${attachment.uploadedBy.displayName}` : ""}
                  </p>
                </div>
              </div>
              <Button
                aria-label={`Ladda ner ${attachment.originalName}`}
                disabled={Boolean(downloadingId)}
                onClick={() => void downloadAttachment(attachment)}
                size="sm"
                type="button"
                variant="outline"
              >
                {downloadingId === attachment.id ? (
                  <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />
                ) : (
                  <Download aria-hidden="true" className="size-3.5" />
                )}
                Hämta
              </Button>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function validateClientFile(file: File): string | null {
  if (file.size === 0) {
    return `${file.name || "Filen"} är tom.`;
  }

  if (file.size > MAX_ATTACHMENT_BYTES) {
    return `${file.name || "Filen"} är större än 10 MiB.`;
  }

  const extension = file.name.split(".").at(-1)?.toLowerCase() ?? "";
  const expectedMimeType = acceptedExtensions.get(extension);

  if (!expectedMimeType) {
    return "Endast PDF, JPEG, PNG och WEBP kan laddas upp.";
  }

  if (file.type && file.type.toLowerCase() !== expectedMimeType) {
    return "Filens typ stämmer inte överens med filändelsen.";
  }

  return null;
}

function formatSize(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }

  return `${(size / 1024).toLocaleString("sv-SE", { maximumFractionDigits: 1 })} kB`;
}

function formatMimeType(mimeType: JournalEntryAttachment["mimeType"]): string {
  return mimeType === "application/pdf" ? "PDF" : mimeType.replace("image/", "").toUpperCase();
}
