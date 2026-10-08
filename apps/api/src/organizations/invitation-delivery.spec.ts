import { InvitationDelivery } from "./invitation-delivery";
describe("invitation delivery boundary", () => {
  const environment = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = environment;
  });
  it("returns only an explicitly local/test fragment link, not an emailed-success claim", async () => {
    process.env.NODE_ENV = "test";
    const result = await new InvitationDelivery().deliver({
      email: "user@example.test",
      token: "secret-token"
    });
    expect(new URL(result.developmentInvitationUrl).hash).toBe("#secret-token");
    expect(new URL(result.developmentInvitationUrl).search).toBe("");
    expect(result).not.toHaveProperty("emailed");
  });
  it("fails closed in production without a real provider", async () => {
    process.env.NODE_ENV = "production";
    await expect(
      new InvitationDelivery().deliver({ email: "user@example.test", token: "secret-token" })
    ).rejects.toMatchObject({ status: 503 });
  });
});
