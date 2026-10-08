import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DimensionTypeahead } from "./dimension-typeahead";
import { jsonResponse } from "@/test/accounting-fixtures";
const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});
it("searches only active tenant dimensions and selects with the keyboard", async () => {
  const fetchMock = jest
    .fn()
    .mockResolvedValue(jsonResponse([{ id: "p", code: "P_1", name: "Öst", active: true }]));
  global.fetch = fetchMock;
  const change = jest.fn();
  render(
    <DimensionTypeahead
      org="tenant-a"
      kind="projects"
      value=""
      onChange={change}
      disabled={false}
      label="Projekt"
    />
  );
  const input = screen.getByRole("combobox");
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "Öst" } });
  await screen.findByRole("option", { name: "P_1 · Öst" });
  expect(fetchMock).toHaveBeenLastCalledWith(
    expect.stringContaining("/organizations/tenant-a/projects?search=%C3%96st&activeOnly=true"),
    expect.anything()
  );
  fireEvent.keyDown(input, { key: "Enter" });
  expect(change).toHaveBeenLastCalledWith("P_1");
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
});
it("fails closed on malformed payloads and retains historical inactive labels", async () => {
  global.fetch = jest.fn().mockResolvedValue(jsonResponse({ unexpected: true }));
  const view = render(
    <DimensionTypeahead
      org="a"
      kind="cost-centers"
      value=""
      onChange={jest.fn()}
      disabled={false}
      label="Kostnadsställe"
    />
  );
  fireEvent.focus(screen.getByRole("combobox"));
  await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  expect(screen.queryByRole("option")).not.toBeInTheDocument();
  view.rerender(
    <DimensionTypeahead
      org="a"
      kind="cost-centers"
      value="K_1"
      displayName="Historiskt namn"
      onChange={jest.fn()}
      disabled
      label="Kostnadsställe"
    />
  );
  expect(screen.getByLabelText("Kostnadsställe")).toHaveTextContent("K_1 · Historiskt namn");
});
