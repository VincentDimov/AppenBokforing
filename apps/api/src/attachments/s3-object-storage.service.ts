import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type {
  ObjectStorage,
  PutObjectInput,
  SignedDownload,
  SignedDownloadInput
} from "./object-storage";

const DEFAULT_REGION = "eu-north-1";
const DEFAULT_SIGNED_URL_TTL_SECONDS = 5 * 60;
const MAX_SIGNED_URL_TTL_SECONDS = 60 * 60;

interface ObjectStorageSettings {
  accessKeyId: string;
  bucket: string;
  endpoint: string;
  publicEndpoint: string;
  region: string;
  secretAccessKey: string;
  signedUrlTtlSeconds: number;
}

/** Private S3-compatible adapter. MinIO needs path-style URLs in local development. */
@Injectable()
export class S3ObjectStorageService implements ObjectStorage {
  private bucketReady: Promise<void> | undefined;
  private objectClient: S3Client | undefined;
  private signingClient: S3Client | undefined;
  private settings: ObjectStorageSettings | undefined;

  constructor(private readonly configService: ConfigService) {}

  async putObject(input: PutObjectInput): Promise<void> {
    try {
      await this.ensureBucket();
      const settings = this.getSettings();

      await this.getObjectClient().send(
        new PutObjectCommand({
          Body: input.body,
          Bucket: settings.bucket,
          ContentLength: input.body.byteLength,
          ContentType: input.contentType,
          Key: input.storageKey,
          Metadata: { sha256: input.sha256 }
        })
      );
    } catch (error) {
      this.throwStorageUnavailable(error);
    }
  }

  async deleteObject(storageKey: string): Promise<void> {
    try {
      const settings = this.getSettings();

      await this.getObjectClient().send(
        new DeleteObjectCommand({ Bucket: settings.bucket, Key: storageKey })
      );
    } catch (error) {
      this.throwStorageUnavailable(error);
    }
  }

  async createSignedDownloadUrl(input: SignedDownloadInput): Promise<SignedDownload> {
    try {
      await this.ensureBucket();
      const settings = this.getSettings();
      const expiresAt = new Date(Date.now() + settings.signedUrlTtlSeconds * 1000);
      const downloadUrl = await getSignedUrl(
        this.getSigningClient(),
        new GetObjectCommand({
          Bucket: settings.bucket,
          Key: input.storageKey,
          ResponseContentDisposition: input.contentDisposition,
          ResponseContentType: input.contentType
        }),
        { expiresIn: settings.signedUrlTtlSeconds }
      );

      return { downloadUrl, expiresAt };
    } catch (error) {
      this.throwStorageUnavailable(error);
    }
  }

  private async ensureBucket(): Promise<void> {
    if (!this.bucketReady) {
      this.bucketReady = this.createBucketIfNeeded().catch((error: unknown) => {
        this.bucketReady = undefined;
        throw error;
      });
    }

    return this.bucketReady;
  }

  private async createBucketIfNeeded(): Promise<void> {
    const settings = this.getSettings();

    try {
      await this.getObjectClient().send(new HeadBucketCommand({ Bucket: settings.bucket }));
      return;
    } catch (error) {
      if (!this.isMissingBucketError(error)) {
        throw error;
      }
    }

    try {
      await this.getObjectClient().send(new CreateBucketCommand({ Bucket: settings.bucket }));
    } catch (error) {
      if (!this.isBucketAlreadyExistsError(error)) {
        throw error;
      }
    }
  }

  private getObjectClient(): S3Client {
    this.objectClient ??= this.createClient(this.getSettings().endpoint);
    return this.objectClient;
  }

  private getSigningClient(): S3Client {
    this.signingClient ??= this.createClient(this.getSettings().publicEndpoint);
    return this.signingClient;
  }

  private createClient(endpoint: string): S3Client {
    const settings = this.getSettings();

    return new S3Client({
      credentials: {
        accessKeyId: settings.accessKeyId,
        secretAccessKey: settings.secretAccessKey
      },
      endpoint,
      forcePathStyle: true,
      region: settings.region
    });
  }

  private getSettings(): ObjectStorageSettings {
    if (this.settings) {
      return this.settings;
    }

    const endpoint = this.getRequiredUrl("S3_ENDPOINT");
    const publicEndpoint = this.configService.get<string>("S3_PUBLIC_ENDPOINT")?.trim() || endpoint;
    this.assertUrl("S3_PUBLIC_ENDPOINT", publicEndpoint);
    const signedUrlTtlSeconds = this.getPositiveInteger(
      "S3_SIGNED_URL_TTL_SECONDS",
      DEFAULT_SIGNED_URL_TTL_SECONDS
    );

    if (signedUrlTtlSeconds > MAX_SIGNED_URL_TTL_SECONDS) {
      throw new Error("S3_SIGNED_URL_TTL_SECONDS must not exceed one hour.");
    }

    this.settings = {
      accessKeyId: this.getRequiredValue("S3_ACCESS_KEY_ID"),
      bucket: this.getRequiredValue("S3_BUCKET"),
      endpoint,
      publicEndpoint,
      region: this.configService.get<string>("S3_REGION")?.trim() || DEFAULT_REGION,
      secretAccessKey: this.getRequiredValue("S3_SECRET_ACCESS_KEY"),
      signedUrlTtlSeconds
    };

    return this.settings;
  }

  private getRequiredValue(name: string): string {
    const value = this.configService.get<string>(name)?.trim();

    if (!value) {
      throw new Error(`${name} must be configured for attachment storage.`);
    }

    return value;
  }

  private getRequiredUrl(name: string): string {
    const value = this.getRequiredValue(name);
    this.assertUrl(name, value);
    return value;
  }

  private assertUrl(name: string, value: string): void {
    try {
      const url = new URL(value);

      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("Unsupported protocol");
      }
    } catch {
      throw new Error(`${name} must be an http(s) URL.`);
    }
  }

  private getPositiveInteger(name: string, fallback: number): number {
    const value = this.configService.get<string>(name);

    if (value === undefined || value.trim() === "") {
      return fallback;
    }

    const parsed = Number(value);

    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
      throw new Error(`${name} must be a positive integer.`);
    }

    return parsed;
  }

  private isMissingBucketError(error: unknown): boolean {
    return this.getStatusCode(error) === 404 || this.getErrorName(error) === "NoSuchBucket";
  }

  private isBucketAlreadyExistsError(error: unknown): boolean {
    const name = this.getErrorName(error);
    return (
      this.getStatusCode(error) === 409 ||
      name === "BucketAlreadyExists" ||
      name === "BucketAlreadyOwnedByYou"
    );
  }

  private getErrorName(error: unknown): string | undefined {
    return error instanceof Error ? error.name : undefined;
  }

  private getStatusCode(error: unknown): number | undefined {
    if (!error || typeof error !== "object" || !("$metadata" in error)) {
      return undefined;
    }

    const metadata = error.$metadata;

    if (!metadata || typeof metadata !== "object" || !("httpStatusCode" in metadata)) {
      return undefined;
    }

    return typeof metadata.httpStatusCode === "number" ? metadata.httpStatusCode : undefined;
  }

  private throwStorageUnavailable(error: unknown): never {
    if (error instanceof ServiceUnavailableException) {
      throw error;
    }

    throw new ServiceUnavailableException("Attachment storage is temporarily unavailable.");
  }
}
