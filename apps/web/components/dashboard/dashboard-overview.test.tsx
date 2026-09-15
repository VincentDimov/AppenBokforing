import { describe, expect, it } from "@jest/globals";
import { render, screen } from "@testing-library/react";

import { DashboardOverview } from "@/components/dashboard/dashboard-overview";

describe("DashboardOverview", () => {
  it("renders the requested financial summary and marks unavailable data as demo data", () => {
    render(<DashboardOverview />);

    expect(screen.getByText("Aktuellt resultat")).toBeInTheDocument();
    expect(screen.getByText("Intäkter")).toBeInTheDocument();
    expect(screen.getByText("Kostnader")).toBeInTheDocument();
    expect(screen.getByText("Momsposition")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Senaste verifikationer" })).toBeInTheDocument();
    expect(screen.getByText("A-42")).toBeInTheDocument();
    expect(screen.getAllByText("Exempeldata")).not.toHaveLength(0);
    expect(screen.getByRole("link", { name: "Ny verifikation" })).toHaveAttribute(
      "href",
      "/app/bookkeeping/vouchers/new"
    );
  });
});
