import { HealthController } from "./health.controller";

describe("HealthController", () => {
  it("reports the API as healthy", () => {
    const controller = new HealthController();

    const health = controller.getHealth();

    expect(health).toMatchObject({
      service: "ledgerapp-api",
      status: "ok"
    });
    expect(Number.isNaN(Date.parse(health.timestamp))).toBe(false);
  });
});
