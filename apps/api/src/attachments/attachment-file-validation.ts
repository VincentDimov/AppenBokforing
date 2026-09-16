import { createHash } from "node:crypto";
import { basename, extname } from "node:path";

import { BadRequestException, PayloadTooLargeException } from "@nestjs/common";

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

type SupportedMimeType = "application/pdf" | "image/jpeg" | "image/png" | "image/webp";

interface SupportedFileType {
  extension: string;
  mimeType: SupportedMimeType;
}

export interface ValidatedAttachmentFile extends SupportedFileType {
  buffer: Buffer;
  originalName: string;
  sha256: string;
  size: number;
}

const supportedTypesByExtension: Readonly<Record<string, SupportedFileType>> = {
  ".jpeg": { extension: "jpeg", mimeType: "image/jpeg" },
  ".jpg": { extension: "jpg", mimeType: "image/jpeg" },
  ".pdf": { extension: "pdf", mimeType: "application/pdf" },
  ".png": { extension: "png", mimeType: "image/png" },
  ".webp": { extension: "webp", mimeType: "image/webp" }
};

/**
 * The accepted surface is deliberately tiny. Multer's MIME value is only an
 * untrusted header, so it must agree with both a safe extension and file magic.
 */
export function validateAttachmentFile(
  file: Express.Multer.File | undefined
): ValidatedAttachmentFile {
  if (!file || !Buffer.isBuffer(file.buffer)) {
    throw new BadRequestException("Provide one attachment in the file field.");
  }

  if (file.buffer.byteLength === 0) {
    throw new BadRequestException("The attachment must not be empty.");
  }

  if (file.buffer.byteLength > MAX_ATTACHMENT_BYTES || file.size > MAX_ATTACHMENT_BYTES) {
    throw new PayloadTooLargeException("Attachments must be at most 10 MiB.");
  }

  if (hasExecutableSignature(file.buffer)) {
    throw new BadRequestException("Executable content is not allowed as an attachment.");
  }

  const originalName = sanitizeOriginalName(file.originalname);
  const byExtension = supportedTypesByExtension[extname(originalName).toLowerCase()];
  const detectedMimeType = detectMimeType(file.buffer);
  const declaredMimeType = normalizeMimeType(file.mimetype);

  if (!byExtension) {
    throw new BadRequestException("Only PDF, JPEG, PNG, and WEBP attachments are allowed.");
  }

  if (!detectedMimeType || detectedMimeType !== byExtension.mimeType) {
    throw new BadRequestException("The attachment contents do not match its allowed file type.");
  }

  if (declaredMimeType !== byExtension.mimeType) {
    throw new BadRequestException("The attachment MIME type does not match its extension.");
  }

  return {
    ...byExtension,
    buffer: file.buffer,
    originalName,
    sha256: createHash("sha256").update(file.buffer).digest("hex"),
    size: file.buffer.byteLength
  };
}

function sanitizeOriginalName(value: string): string {
  const normalized = basename(value.replaceAll("\\", "/"))
    .normalize("NFC")
    .split("")
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint >= 32 && codePoint !== 127;
    })
    .join("")
    .trim();

  if (!normalized || normalized === "." || normalized === "..") {
    throw new BadRequestException("The attachment filename is invalid.");
  }

  return normalized.slice(0, 512);
}

function normalizeMimeType(value: string | undefined): string {
  return value?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function detectMimeType(buffer: Buffer): SupportedMimeType | null {
  if (buffer.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    return "application/pdf";
  }

  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
    return "image/jpeg";
  }

  if (
    buffer
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "image/png";
  }

  if (
    buffer.subarray(0, 4).equals(Buffer.from("RIFF")) &&
    buffer.subarray(8, 12).equals(Buffer.from("WEBP"))
  ) {
    return "image/webp";
  }

  return null;
}

function hasExecutableSignature(buffer: Buffer): boolean {
  return (
    buffer.subarray(0, 2).equals(Buffer.from("MZ")) ||
    buffer.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])) ||
    buffer.subarray(0, 2).equals(Buffer.from("#!")) ||
    buffer.subarray(0, 4).equals(Buffer.from([0xfe, 0xed, 0xfa, 0xce])) ||
    buffer.subarray(0, 4).equals(Buffer.from([0xcf, 0xfa, 0xed, 0xfe]))
  );
}
