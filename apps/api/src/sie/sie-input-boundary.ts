import { PayloadTooLargeException } from "@nestjs/common";

// UTF-8 bytes of the decoded JSON content string, NOT characters or wire bytes.
export const SIE_IMPORT_MAX_BYTES = 128 * 1024;
// Covers 6x worst-case JSON escaping plus UUID, confirm and envelope overhead.
// Finite cap for every JSON endpoint; multipart attachment limits are independent.
export const JSON_BODY_MAX_BYTES = 1024 * 1024;

export function assertSieInputSize(content: string): void {
  if (Buffer.byteLength(content, "utf8") > SIE_IMPORT_MAX_BYTES) {
    throw new PayloadTooLargeException(
      "SIE content exceeds the maximum of 131072 UTF-8 bytes (128 KiB)."
    );
  }
}
