export interface JournalEntryAttachment {
  createdAt: string;
  id: string;
  journalEntryId: string | null;
  mimeType: "application/pdf" | "image/jpeg" | "image/png" | "image/webp";
  organizationId: string;
  originalName: string;
  sha256: string;
  size: number;
  uploadedBy: {
    displayName: string;
    id: string;
  } | null;
}

export interface AttachmentDownload {
  downloadUrl: string;
  expiresAt: string;
}

export class AttachmentsApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "AttachmentsApiError";
  }
}

export async function getJournalEntryAttachments(
  journalEntryId: string,
  signal?: AbortSignal
): Promise<JournalEntryAttachment[]> {
  const response = await fetch(`/api/journal-entries/${journalEntryId}/attachments`, {
    cache: "no-store",
    credentials: "include",
    signal
  });
  const payload = await parsePayload(response);

  if (!response.ok) {
    throw new AttachmentsApiError(getErrorMessage(payload), response.status);
  }

  if (!Array.isArray(payload)) {
    throw new AttachmentsApiError("Bilagelistan kunde inte tolkas.", response.status);
  }

  return payload as JournalEntryAttachment[];
}

export async function uploadJournalEntryAttachment(
  journalEntryId: string,
  file: File
): Promise<JournalEntryAttachment> {
  const formData = new FormData();
  formData.append("file", file, file.name);

  const response = await fetch(`/api/journal-entries/${journalEntryId}/attachments`, {
    body: formData,
    cache: "no-store",
    credentials: "include",
    method: "POST"
  });
  const payload = await parsePayload(response);

  if (!response.ok) {
    throw new AttachmentsApiError(getErrorMessage(payload), response.status);
  }

  if (!isAttachment(payload)) {
    throw new AttachmentsApiError("Bilagan kunde inte tolkas efter uppladdning.", response.status);
  }

  return payload;
}

export async function getAttachmentDownload(attachmentId: string): Promise<AttachmentDownload> {
  const response = await fetch(`/api/attachments/${attachmentId}/download`, {
    cache: "no-store",
    credentials: "include"
  });
  const payload = await parsePayload(response);

  if (!response.ok) {
    throw new AttachmentsApiError(getErrorMessage(payload), response.status);
  }

  if (!isAttachmentDownload(payload)) {
    throw new AttachmentsApiError("NedladdningslÃ¤nken kunde inte tolkas.", response.status);
  }

  return payload;
}

async function parsePayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function isAttachment(payload: unknown): payload is JournalEntryAttachment {
  return Boolean(
    payload && typeof payload === "object" && "id" in payload && "originalName" in payload
  );
}

function isAttachmentDownload(payload: unknown): payload is AttachmentDownload {
  return Boolean(
    payload &&
    typeof payload === "object" &&
    "downloadUrl" in payload &&
    typeof payload.downloadUrl === "string" &&
    "expiresAt" in payload &&
    typeof payload.expiresAt === "string"
  );
}

function getErrorMessage(payload: unknown): string {
  if (!payload || typeof payload !== "object" || !("message" in payload)) {
    return "NÃ¥got gick fel. FÃ¶rsÃ¶k igen.";
  }

  const message = payload.message;

  return Array.isArray(message)
    ? message.filter((item): item is string => typeof item === "string").join(" ")
    : typeof message === "string"
      ? message
      : "NÃ¥got gick fel. FÃ¶rsÃ¶k igen.";
}
