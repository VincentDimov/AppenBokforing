/**
 * Narrow storage boundary for accounting evidence. Keeping it independent from
 * S3 makes authorization and validation integration tests deterministic.
 */
export const OBJECT_STORAGE = Symbol("OBJECT_STORAGE");

export interface PutObjectInput {
  body: Buffer;
  contentType: string;
  sha256: string;
  storageKey: string;
}

export interface SignedDownloadInput {
  contentDisposition: string;
  contentType: string;
  storageKey: string;
}

export interface SignedDownload {
  downloadUrl: string;
  expiresAt: Date;
}

export interface ObjectStorage {
  putObject(input: PutObjectInput): Promise<void>;
  deleteObject(storageKey: string): Promise<void>;
  createSignedDownloadUrl(input: SignedDownloadInput): Promise<SignedDownload>;
}
