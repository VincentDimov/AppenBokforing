import { bytesBase64, downloadBinary } from "./binary-download";
describe("binary SIE transport", () => {
  it("retains high PC8 bytes rather than encoding UTF-8 text", () => {
    expect(bytesBase64(new Uint8Array([0x8f, 0x8e, 0x99]))).toBe("j46Z");
  });
  it("reports a rejected export without creating a misleading file", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: "Exporten är blockerad." })
    } as Response);
    await expect(downloadBinary("/api/exports/sie", "ledgerapp.sie")).rejects.toThrow(
      "Exporten är blockerad."
    );
    globalThis.fetch = originalFetch;
  });
});
