import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TemplatePicker } from "./template-picker";
import { workspaceRequest } from "@/lib/workspace-api";
jest.mock("@/lib/workspace-api", () => ({ workspaceRequest: jest.fn() }));
const request = jest.mocked(workspaceRequest);
describe("template draft copy", () => {
  beforeEach(() => request.mockReset());
  it("requires explicit replacement and applies only the returned snapshot", async () => {
    request
      .mockResolvedValueOnce([{ id: "one", name: "Bankmall" }])
      .mockResolvedValueOnce({ description: "Bank", lines: [] });
    const apply = jest.fn();
    render(<TemplatePicker org="org" disabled={false} onApply={apply} />);
    await screen.findByRole("option", { name: "Bankmall" });
    fireEvent.change(screen.getByLabelText("Mall"), { target: { value: "one" } });
    expect(screen.getByRole("button", { name: "Använd mall" })).toBeDisabled();
    fireEvent.click(screen.getByLabelText("Ersätt raderna i utkastet"));
    fireEvent.click(screen.getByRole("button", { name: "Använd mall" }));
    await waitFor(() => expect(apply).toHaveBeenCalledWith({ description: "Bank", lines: [] }));
  });
  it("deactivation error never changes the draft", async () => {
    request
      .mockResolvedValueOnce([{ id: "one", name: "Bankmall" }])
      .mockRejectedValueOnce(new Error("Mallen är inaktiv."));
    const apply = jest.fn();
    render(<TemplatePicker org="org" disabled={false} onApply={apply} />);
    await screen.findByRole("option", { name: "Bankmall" });
    fireEvent.change(screen.getByLabelText("Mall"), { target: { value: "one" } });
    fireEvent.click(screen.getByLabelText("Ersätt raderna i utkastet"));
    fireEvent.click(screen.getByRole("button", { name: "Använd mall" }));
    await screen.findByRole("alert");
    expect(apply).not.toHaveBeenCalled();
  });
});
