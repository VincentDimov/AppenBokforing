import { validateAttachmentFile } from "./attachment-file-validation";
const safe = "%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n";
function pdf(body: string) {
  return {
    buffer: Buffer.from(body),
    originalname: "receipt.pdf",
    mimetype: "application/pdf",
    size: Buffer.byteLength(body)
  } as Express.Multer.File;
}
describe("conservative PDF upload boundary (not malware certification)", () => {
  it("accepts a passive fixture and keeps byte checksum metadata", () => {
    expect(validateAttachmentFile(pdf(safe))).toMatchObject({
      size: Buffer.byteLength(safe),
      mimeType: "application/pdf"
    });
  });
  it.each([
    "%PDF-1.7\n",
    safe + "MZ executable payload",
    safe.replace("/Catalog", "/Catalog /OpenAction /JavaScript"),
    safe.replace("/Catalog", "/Catalog /EmbeddedFile")
  ])("rejects truncated, appended/polyglot and active content", (body) => {
    expect(() => validateAttachmentFile(pdf(body))).toThrow("Malformed or active PDF");
  });
});
