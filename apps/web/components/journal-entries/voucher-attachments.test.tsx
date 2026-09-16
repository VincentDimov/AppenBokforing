import { jest } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import type { ComponentProps } from "react";

import { VoucherAttachments } from "@/components/journal-entries/voucher-attachments";

const fetchMock = jest.fn<typeof fetch>();
const originalFetch = global.fetch;

const attachment = {
  createdAt: "2026-09-15T11:00:00.000Z",
  id: "attachment-a",
  journalEntryId: "voucher-a",
  mimeType: "application/pdf" as const,
  organizationId: "organization-a",
  originalName: "receipt.pdf",
  sha256: "a".repeat(64),
  size: 32,
  uploadedBy: { displayName: "Demo User", id: "user-a" }
};

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    json: async () => payload,
    ok: status >= 200 && status < 300,
    status
  } as Response;
}

function renderAttachments(
  props: Partial<ComponentProps<typeof VoucherAttachments>> = {}
) {
  const onUploadingChange = jest.fn();

  render(
    <VoucherAttachments
      canUpload
      isDraft
      journalEntryId="voucher-a"
      onUploadingChange={onUploadingChange}
      {...props}
    />
  );

  return { onUploadingChange };
}

describe("VoucherAttachments", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(global, "fetch", {
      configurable: true,
      value: fetchMock,
      writable: true
    });
  });

  afterAll(() => {
    Object.defineProperty(global, "fetch", {
      configurable: true,
      value: originalFetch,
      writable: true
    });
  });

  it("loads existing evidence and uploads an accepted file through FormData", async () => {
    fetchMock.mockImplementation(async (_input, init) => {
      if (init?.method === "POST") {
        return jsonResponse(attachment, 201);
      }

      return jsonResponse([]);
    });
    const { onUploadingChange } = renderAttachments();

    expect(await screen.findByText("Inga bilagor är kopplade ännu.")).toBeInTheDocument();
    const file = new File(["%PDF-1.7"], "receipt.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText(/Släpp filer här eller välj filer/i), {
      target: { files: [file] }
    });

    expect(await screen.findByText("receipt.pdf")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/journal-entries/voucher-a/attachments",
      expect.objectContaining({ cache: "no-store", credentials: "include" })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/journal-entries/voucher-a/attachments",
      expect.objectContaining({
        body: expect.any(FormData),
        credentials: "include",
        method: "POST"
      })
    );
    expect(onUploadingChange).toHaveBeenCalledWith(true);
    expect(onUploadingChange).toHaveBeenLastCalledWith(false);
  });

  it("rejects an unsupported file before it reaches the API", async () => {
    fetchMock.mockResolvedValue(jsonResponse([]));
    renderAttachments();

    await screen.findByText("Inga bilagor är kopplade ännu.");
    const file = new File(["MZ"], "invoice.exe", { type: "application/x-msdownload" });
    fireEvent.change(screen.getByLabelText(/Släpp filer här eller välj filer/i), {
      target: { files: [file] }
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Endast PDF, JPEG, PNG och WEBP kan laddas upp."
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  it("retains a readable list after posting without offering another upload", async () => {
    fetchMock.mockResolvedValue(jsonResponse([attachment]));
    renderAttachments({ canUpload: false, isDraft: false });

    expect(await screen.findByText("receipt.pdf")).toBeInTheDocument();
    expect(
      screen.getByText(/Bilagorna bevaras med den bokförda verifikationen/i)
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Släpp filer/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ladda ner receipt.pdf" })).toBeInTheDocument();
  });
});
