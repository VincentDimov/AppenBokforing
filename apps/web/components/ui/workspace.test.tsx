import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { ConfirmDialog } from "./dialog";
import { EmptyState, PageHeader, StatusBadge, roleLabels } from "./workspace";

it("presents Swedish accounting statuses without claiming compliance", () => {
  render(
    <>
      <StatusBadge status="POSTED" />
      <StatusBadge status="REVERSED" />
      <StatusBadge status="LOCKED" />
    </>
  );
  expect(screen.getByText("Bokförd")).toBeInTheDocument();
  expect(screen.getByText("Rättad")).toBeInTheDocument();
  expect(screen.getByText("Låst")).toBeInTheDocument();
  expect(roleLabels.READ_ONLY).toBe("Läsbehörighet");
});
it("keeps one semantic page title and an actionable empty state", () => {
  render(
    <>
      <PageHeader title="Konton" context="Register" />
      <EmptyState
        title="Inga konton"
        description="Skapa första kontot."
        action={<button>Nytt konto</button>}
      />
    </>
  );
  expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Nytt konto" })).toBeEnabled();
});
it("requires explicit confirmation and restores focus and scroll state on cancel", () => {
  const confirm = jest.fn();
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button onClick={() => setOpen(true)}>Öppna</button>
        <ConfirmDialog
          open={open}
          title="Bokför?"
          description="Beloppen låses."
          onCancel={() => setOpen(false)}
          onConfirm={confirm}
        />
      </>
    );
  }
  render(<Harness />);
  const opener = screen.getByRole("button", { name: "Öppna" });
  opener.focus();
  fireEvent.click(opener);
  expect(screen.getByRole("dialog", { name: "Bokför?" })).toBeVisible();
  expect(document.body.style.overflow).toBe("hidden");
  expect(confirm).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Avbryt" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(opener).toHaveFocus();
  expect(document.body.style.overflow).toBe("");
});
it("prevents disabled confirmation from dispatching a write", () => {
  const confirm = jest.fn();
  render(
    <ConfirmDialog
      open
      title="Bokför?"
      description="Kontrollera först."
      disabled
      onCancel={jest.fn()}
      onConfirm={confirm}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "Bekräfta" }));
  expect(confirm).not.toHaveBeenCalled();
});
it("closes on Escape without dispatching a write", () => {
  const cancel = jest.fn(),
    confirm = jest.fn();
  render(
    <ConfirmDialog
      open
      title="Ändra?"
      description="Granska först."
      onCancel={cancel}
      onConfirm={confirm}
    />
  );
  fireEvent(screen.getByRole("dialog"), new Event("cancel", { bubbles: true, cancelable: true }));
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(confirm).not.toHaveBeenCalled();
});
