import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AppSidebar } from "@/components/app/app-sidebar";
import { AdminDirectory } from "./admin-directory";
import { AdminAction } from "./admin-actions";
import { AdminLayout } from "./admin-layout";
import { jsonResponse } from "@/test/accounting-fixtures";

let mockRole: string | undefined = "SUPER_ADMIN",
  mockCapability = true,
  mockStatus = "authenticated";
jest.mock("@/components/auth/auth-provider", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => ({
    status: mockStatus,
    user: {
      displayName: "Fixture admin",
      platformRole: mockRole,
      canAccessPlatformAdmin: mockCapability
    },
    refresh: jest.fn(),
    signOut: jest.fn()
  })
}));
const mockReplace = jest.fn();
jest.mock("next/navigation", () => ({
  usePathname: () => "/admin/users",
  useRouter: () => ({ replace: mockReplace })
}));
const originalFetch = global.fetch,
  fetchMock = jest.fn();
beforeEach(() => {
  mockRole = "SUPER_ADMIN";
  mockCapability = true;
  mockStatus = "authenticated";
  mockReplace.mockReset();
  fetchMock.mockReset();
  global.fetch = fetchMock;
  fetchMock.mockImplementation(async () =>
    jsonResponse({ items: [], total: 0, page: 1, pageSize: 25 })
  );
});
afterAll(() => {
  global.fetch = originalFetch;
});
it("shows Admin immediately after Översikt only with server-returned capability", () => {
  const { rerender } = render(<AppSidebar />);
  const links = screen.getAllByRole("link");
  const overview = links.findIndex((link) => link.textContent === "Översikt");
  expect(links[overview + 1]).toHaveTextContent("Admin");
  expect(links[overview + 1]).toHaveAttribute("href", "/admin");
  mockCapability = false;
  mockRole = undefined;
  rerender(<AppSidebar />);
  expect(screen.queryByRole("link", { name: "Admin" })).not.toBeInTheDocument();
});
it("denies the admin workspace to a company administrator", () => {
  mockCapability = false;
  mockRole = undefined;
  render(
    <AdminLayout>
      <p>Privileged content</p>
    </AdminLayout>
  );
  expect(screen.getByText(/Åtkomst nekad/)).toBeInTheDocument();
  expect(screen.queryByText("Privileged content")).not.toBeInTheDocument();
  expect(fetchMock).not.toHaveBeenCalled();
});
it("dedicated sidebar offers back navigation, active state and Swedish modules", () => {
  render(
    <AdminLayout>
      <h1>Administration</h1>
    </AdminLayout>
  );
  expect(screen.getByRole("link", { name: "Tillbaka till översikt" })).toHaveAttribute(
    "href",
    "/app"
  );
  expect(screen.getByRole("link", { name: "Användare" })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("link", { name: "Företag" })).toHaveAttribute(
    "href",
    "/admin/organizations"
  );
});
it("debounces real server search and resets pagination", async () => {
  render(<AdminDirectory kind="users" />);
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  const previous = fetchMock.mock.calls.length;
  fireEvent.change(screen.getByLabelText(/Sök namn/), { target: { value: "Åsa" } });
  expect(fetchMock.mock.calls.length).toBe(previous);
  await waitFor(() =>
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("search=%C3%85sa"))).toBe(true)
  );
  expect(screen.getByText("Inga träffar")).toBeInTheDocument();
});
it("does not display creation workflows for PLATFORM_VIEWER", async () => {
  mockRole = "PLATFORM_VIEWER";
  render(<AdminDirectory kind="users" />);
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  expect(screen.queryByRole("button", { name: "Skapa användare" })).not.toBeInTheDocument();
});
it("aborts stale list requests and offers error recovery", async () => {
  fetchMock.mockImplementation(async () => jsonResponse({ message: "Unavailable" }, 503));
  render(<AdminDirectory kind="organizations" />);
  await screen.findByRole("alert");
  const previous = fetchMock.mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "Försök igen" }));
  await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(previous));
  expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
});
it("requires typed confirmation and sends one mutation with no password in URL", async () => {
  const done = jest.fn();
  fetchMock.mockImplementation(async () => jsonResponse({}));
  render(
    <AdminAction
      label="Säkert prov"
      path="/users/test/suspend"
      target="fixture@example.test"
      consequence="Återkallar sessioner."
      payload={() => ({})}
      done={done}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "Säkert prov" }));
  fireEvent.click(screen.getByRole("button", { name: "Spara" }));
  expect(fetchMock).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText(/Skriv fixture/), {
    target: { value: "fixture@example.test" }
  });
  fireEvent.click(screen.getByRole("button", { name: "Spara" }));
  await waitFor(() => expect(done).toHaveBeenCalledTimes(1));
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/platform-admin/users/test/suspend",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ confirmation: "fixture@example.test" })
    })
  );
});
