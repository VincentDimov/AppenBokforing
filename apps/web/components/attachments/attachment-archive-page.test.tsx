import { act, fireEvent, render, screen } from "@testing-library/react";
import { AttachmentArchivePage } from "./attachment-archive-page";
import { workspaceRequest } from "@/lib/workspace-api";
let org = "org-a";
jest.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ activeOrganizationId: org })
}));
jest.mock("@/lib/workspace-api", () => ({ workspaceRequest: jest.fn() }));
const request = jest.mocked(workspaceRequest);
const item = {
  id: "a",
  originalName: "Årskvitto.pdf",
  createdAt: "2026-10-08",
  mimeType: "application/pdf",
  size: "123",
  sha256: "hash",
  uploadedBy: null,
  journalEntry: {
    id: "voucher",
    status: "POSTED",
    voucherNumber: 1,
    entryDate: "2026-01-10",
    description: "",
    voucherSeries: { code: "A" }
  }
};
beforeEach(() => {
  org = "org-a";
  request.mockReset();
});
it("pages on the server and surfaces a failed subsequent page", async () => {
  request
    .mockResolvedValueOnce({ items: [item], nextCursor: "next" })
    .mockRejectedValueOnce(new Error("Paging failed"));
  render(<AttachmentArchivePage />);
  await screen.findByText("Årskvitto.pdf", { selector: "td" });
  fireEvent.click(screen.getByRole("button", { name: "Nästa sida" }));
  expect(await screen.findByRole("status")).toHaveTextContent(/Paging failed|Läser/);
  await screen.findByText("Paging failed");
  expect(String(request.mock.calls[1]![0])).toContain("cursor=next");
  expect(screen.queryByText("Årskvitto.pdf", { selector: "td" })).toBeNull();
});
it("aborts old tenant reads and never renders a late archive", async () => {
  let resolve: (value: unknown) => void = () => {};
  request
    .mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        })
    )
    .mockResolvedValue({ items: [], nextCursor: null });
  const view = render(<AttachmentArchivePage />);
  org = "org-b";
  view.rerender(<AttachmentArchivePage />);
  await screen.findByText(/Inga bilagor matchar/);
  await act(async () => resolve({ items: [item], nextCursor: null }));
  expect(screen.queryByText("Årskvitto.pdf", { selector: "td" })).toBeNull();
  expect(request.mock.calls[0]![1]!.signal!.aborted).toBe(true);
});
