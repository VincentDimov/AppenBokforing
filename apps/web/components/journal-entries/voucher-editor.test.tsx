import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { VoucherEditor } from "./voucher-editor";
import { demoEntry, demoOptions, deferred, jsonResponse } from "@/test/accounting-fixtures";

const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
const replace = jest.fn();
let organizationId = "org-a";
jest.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
jest.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({
    activeOrganizationId: organizationId,
    activeOrganization: { id: organizationId, name: organizationId, role: "OWNER" },
    organizationsStatus: "ready"
  })
}));
const originalFetch = global.fetch;
let persisted = demoEntry;
beforeEach(() => {
  organizationId = "org-a";
  persisted = { ...demoEntry, lines: demoEntry.lines.map((line) => ({ ...line })) };
  fetchMock.mockReset();
  replace.mockReset();
  global.fetch = fetchMock;
  fetchMock.mockImplementation(async (url, init) => {
    const path = String(url);
    if (path.includes("/options?")) return jsonResponse(demoOptions);
    if (path.includes("/attachments")) return jsonResponse([]);
    if (path.includes("/posting-templates")) return jsonResponse([]);
    if (path.includes("/projects?") || path.includes("/cost-centers?")) return jsonResponse([]);
    if (path.includes("/accounts?"))
      return jsonResponse(demoEntry.lines.map((line) => ({ ...line.account, active: true })));
    if (init?.method === "PATCH" || (init?.method === "POST" && !path.endsWith("/post"))) {
      const input = JSON.parse(String(init.body)) as {
        description: string;
        transactionDate: string;
        lines: { debit: string; credit: string }[];
      };
      persisted = {
        ...persisted,
        description: input.description,
        transactionDate: input.transactionDate,
        lines: persisted.lines.map((line, index) => ({ ...line, ...input.lines[index] }))
      };
      return jsonResponse(persisted, init.method === "POST" ? 201 : 200);
    }
    if (path.endsWith("/post")) return jsonResponse({ ...persisted, status, voucherNumber: 1 });
    return jsonResponse(demoEntry);
  });
});
afterAll(() => {
  global.fetch = originalFetch;
});
const mutations = () =>
  fetchMock.mock.calls.filter(([, init]) => ["PATCH", "POST"].includes(init?.method ?? ""));
async function editExisting() {
  await screen.findByDisplayValue("Original draft");
  await waitFor(() => expect(screen.getByLabelText("Serie")).not.toBeDisabled());
  fireEvent.change(screen.getByLabelText("Beskrivning"), {
    target: { value: "Visible changed draft" }
  });
  fireEvent.change(screen.getByLabelText("Debet rad 1"), { target: { value: "5000,00" } });
  fireEvent.change(screen.getByLabelText("Kredit rad 2"), { target: { value: "5000,00" } });
}
describe("canonical posting flow", () => {
  it("never saves or posts before explicit confirmation, and cancellation retains exact visible values", async () => {
    render(<VoucherEditor entryId={demoEntry.id} />);
    await editExisting();
    fireEvent.click(screen.getByRole("button", { name: "Bokför verifikation" }));
    expect(screen.getByRole("dialog", { name: "Bokför verifikationen?" })).toBeVisible();
    expect(mutations()).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: /^Avbryt$/ }));
    expect(mutations()).toHaveLength(0);
    expect(screen.getByLabelText("Debet rad 1")).toHaveValue("5000,00");
    expect(screen.getByLabelText("Kredit rad 2")).toHaveValue("5000,00");
  });
  it("retains local edits on version conflict and explicitly reloads latest values", async () => {
    const normal = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url, init) => {
      if (init?.method === "PATCH")
        return jsonResponse(
          {
            code: "JOURNAL_ENTRY_VERSION_CONFLICT",
            message: "Verifikationen har ändrats av en annan användare."
          },
          409
        );
      return normal(url, init);
    });
    render(<VoucherEditor entryId={demoEntry.id} />);
    await editExisting();
    fireEvent.click(screen.getByRole("button", { name: "Bokför verifikation" }));
    fireEvent.click(screen.getByRole("button", { name: "Bekräfta bokföring" }));
    expect(
      await screen.findByText("Verifikationen har ändrats av en annan användare.")
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Debet rad 1")).toHaveValue("5000,00");
    expect(mutations()).toHaveLength(1);
    expect(JSON.parse(String(mutations()[0]?.[1]?.body)).expectedVersion).toBe(1);
    fireEvent.click(
      screen.getByRole("button", { name: "Ladda senaste och kasta lokala ändringar" })
    );
    await screen.findByDisplayValue("Original draft");
    expect(
      screen.queryByText("Verifikationen har ändrats av en annan användare.")
    ).not.toBeInTheDocument();
  });
  it("saves explicit VAT base/tax roles and group without inferring from accounts", async () => {
    render(<VoucherEditor entryId={demoEntry.id} />);
    await editExisting();
    fireEvent.change(screen.getByLabelText("Momsroll rad 1"), { target: { value: "BASE" } });
    fireEvent.change(screen.getByLabelText("Momsroll rad 2"), { target: { value: "TAX" } });
    fireEvent.change(screen.getByLabelText("Momsgrupp rad 1"), { target: { value: "sale" } });
    fireEvent.click(screen.getByRole("button", { name: "Bokför verifikation" }));
    fireEvent.click(screen.getByRole("button", { name: "Bekräfta bokföring" }));
    await waitFor(() => expect(mutations()).toHaveLength(2));
    expect(JSON.parse(String(mutations()[0]?.[1]?.body)).lines).toEqual([
      expect.objectContaining({ vatRole: "BASE", vatGroup: "sale" }),
      expect.objectContaining({ vatRole: "TAX" })
    ]);
  });
  it.each(["button", "keyboard"])(
    "PATCHes the visible existing draft before POST via %s",
    async (trigger) => {
      render(<VoucherEditor entryId={demoEntry.id} />);
      await editExisting();
      if (trigger === "button")
        fireEvent.click(screen.getByRole("button", { name: "Bokför verifikation" }));
      else
        fireEvent.keyDown(screen.getByLabelText("Kredit rad 2"), { key: "Enter", ctrlKey: true });
      fireEvent.click(screen.getByRole("button", { name: "Bekräfta bokföring" }));
      await waitFor(() => expect(mutations()).toHaveLength(2));
      expect(mutations()[0]).toEqual([
        "/api/journal-entries/entry-a",
        expect.objectContaining({ method: "PATCH", body: expect.any(String) })
      ]);
      expect(JSON.parse(String(mutations()[0]?.[1]?.body))).toMatchObject({
        description: "Visible changed draft",
        lines: [
          { debit: "5000.00", credit: "0.00" },
          { debit: "0.00", credit: "5000.00" }
        ]
      });
      expect(mutations()[1]?.[0]).toBe("/api/journal-entries/entry-a/post");
    }
  );
  it("keeps the existing-draft mutation locked throughout PATCH and POST", async () => {
    const pending = deferred<Response>();
    const normal = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url, init) =>
      init?.method === "PATCH" ? pending.promise : normal(url, init)
    );
    render(<VoucherEditor entryId={demoEntry.id} />);
    await editExisting();
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Bokför verifikation" }));
      fireEvent.keyDown(screen.getByLabelText("Kredit rad 2"), { key: "Enter", ctrlKey: true });
    });
    const confirmation = screen.getByRole("button", { name: "Bekräfta bokföring" });
    act(() => {
      fireEvent.click(confirmation);
      fireEvent.click(confirmation);
    });
    expect(mutations()).toHaveLength(1);
    await act(async () => pending.resolve(jsonResponse(demoEntry)));
    await waitFor(() => expect(mutations()).toHaveLength(2));
    expect(mutations()[1]?.[0]).toBe("/api/journal-entries/entry-a/post");
  });

  it("does not POST after failed PATCH and retains visible form values", async () => {
    const normal = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url, init) =>
      init?.method === "PATCH"
        ? Promise.resolve(jsonResponse({ message: "Save failed" }, 400))
        : normal(url, init)
    );
    render(<VoucherEditor entryId={demoEntry.id} />);
    await editExisting();
    fireEvent.click(screen.getByRole("button", { name: "Bokför verifikation" }));
    fireEvent.click(screen.getByRole("button", { name: "Bekräfta bokföring" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Save failed");
    expect(screen.getByLabelText("Debet rad 1")).toHaveValue("5000,00");
    expect(mutations()).toHaveLength(1);
  });
  it("CREATEs current visible values then POSTs a new draft once even on duplicate triggers", async () => {
    render(<VoucherEditor />);
    fireEvent.change(screen.getByLabelText("Beskrivning"), { target: { value: "New draft" } });
    const accounts = screen
      .getAllByRole("combobox")
      .filter(
        (input) =>
          input.tagName === "INPUT" && input.getAttribute("placeholder") !== "Kod eller namn"
      );
    for (const account of accounts) {
      fireEvent.focus(account);
      await screen.findByRole("option", { name: "1930 Bank" });
      fireEvent.keyDown(account, { key: "Enter" });
    }
    fireEvent.change(screen.getByLabelText("Debet rad 1"), { target: { value: "1000.00" } });
    fireEvent.change(screen.getByLabelText("Kredit rad 2"), { target: { value: "1000.00" } });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Bokför verifikation" })).toBeEnabled()
    );
    const pending = deferred<Response>();
    const normal = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url, init) =>
      String(url) === "/api/journal-entries" && init?.method === "POST"
        ? pending.promise
        : normal(url, init)
    );
    const button = screen.getByRole("button", { name: "Bokför verifikation" });
    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
      fireEvent.keyDown(screen.getByLabelText("Kredit rad 2"), { key: "Enter", metaKey: true });
    });
    const confirmation = screen.getByRole("button", { name: "Bekräfta bokföring" });
    act(() => {
      fireEvent.click(confirmation);
      fireEvent.click(confirmation);
    });
    expect(mutations()).toHaveLength(1);
    expect(JSON.parse(String(mutations()[0]?.[1]?.body))).toMatchObject({
      organizationId: "org-a",
      description: "New draft"
    });
    await act(async () => pending.resolve(jsonResponse(demoEntry, 201)));
    await waitFor(() => expect(mutations()).toHaveLength(2));
    expect(mutations().map(([url]) => url)).toEqual([
      "/api/journal-entries",
      "/api/journal-entries/entry-a/post"
    ]);
  });
  it.each(["POSTED", "REVERSED"])(
    "refuses all accounting mutations on %s entries, including the hotkey",
    async (status) => {
      const normal = fetchMock.getMockImplementation()!;
      fetchMock.mockImplementation((url, init) =>
        String(url) === "/api/journal-entries/entry-a"
          ? Promise.resolve(jsonResponse({ ...demoEntry, status, voucherNumber: 1 }))
          : normal(url, init)
      );
      render(<VoucherEditor entryId={demoEntry.id} />);
      await screen.findByDisplayValue("Original draft");
      fireEvent.keyDown(screen.getByLabelText("Kredit rad 2"), { key: "Enter", ctrlKey: true });
      expect(mutations()).toHaveLength(0);
    }
  );
  it("hides A's voucher and refuses writes under B's options", async () => {
    const view = render(<VoucherEditor entryId={demoEntry.id} />);
    await editExisting();
    organizationId = "org-b";
    view.rerender(<VoucherEditor entryId={demoEntry.id} />);
    expect(screen.queryByDisplayValue("Visible changed draft")).not.toBeInTheDocument();
    await screen.findByText(/tillhör en annan organisation/);
    expect(screen.queryByRole("button", { name: "Bokför verifikation" })).not.toBeInTheDocument();
    expect(mutations()).toHaveLength(0);
  });
  it("does not continue saving A into posting/navigation after switching to B", async () => {
    const pending = deferred<Response>();
    const normal = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url, init) =>
      init?.method === "PATCH" ? pending.promise : normal(url, init)
    );
    const view = render(<VoucherEditor entryId={demoEntry.id} />);
    await editExisting();
    fireEvent.click(screen.getByRole("button", { name: "Bokför verifikation" }));
    fireEvent.click(screen.getByRole("button", { name: "Bekräfta bokföring" }));
    organizationId = "org-b";
    view.rerender(<VoucherEditor entryId={demoEntry.id} />);
    await act(async () => pending.resolve(jsonResponse(demoEntry)));
    expect(mutations()).toHaveLength(1);
    expect(replace).not.toHaveBeenCalled();
    await screen.findByText(/tillhör en annan organisation/);
  });
});
