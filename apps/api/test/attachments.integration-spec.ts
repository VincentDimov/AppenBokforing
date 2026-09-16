import { createHash, randomUUID } from "node:crypto";

import {
  AccountType,
  AuditAction,
  AuditEntityType,
  BalanceSide,
  OrganizationMemberRole,
  prisma
} from "@ledgerapp/db";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import {
  OBJECT_STORAGE,
  type ObjectStorage,
  type PutObjectInput,
  type SignedDownloadInput
} from "../src/attachments/object-storage";
import { configureHttpApp } from "../src/http/app-setup";

interface TestUser {
  id: string;
}

interface TestOrganization {
  id: string;
}

interface CalendarFixture {
  voucherSeriesId: string;
}

interface AccountFixture {
  bankId: string;
  revenueId: string;
}

/**
 * Keeps API integration tests independent of a live MinIO bucket while exposing
 * every storage interaction that the attachment endpoints must authorize.
 */
class InMemoryObjectStorage implements ObjectStorage {
  readonly deletes: string[] = [];
  readonly puts: PutObjectInput[] = [];
  readonly signedDownloads: SignedDownloadInput[] = [];

  private readonly objects = new Map<string, Buffer>();

  async putObject(input: PutObjectInput): Promise<void> {
    this.puts.push({ ...input, body: Buffer.from(input.body) });
    this.objects.set(input.storageKey, Buffer.from(input.body));
  }

  async deleteObject(storageKey: string): Promise<void> {
    this.deletes.push(storageKey);
    this.objects.delete(storageKey);
  }

  async createSignedDownloadUrl(input: SignedDownloadInput): Promise<{
    downloadUrl: string;
    expiresAt: Date;
  }> {
    this.signedDownloads.push(input);

    return {
      downloadUrl: `https://storage.test/download/${encodeURIComponent(input.storageKey)}`,
      expiresAt: new Date("2030-01-01T00:05:00.000Z")
    };
  }
}

const runId = randomUUID();
const runSuffix = runId.slice(0, 12);
const password = "A-long-integration-test-password-2026!";
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const PDF_BYTES = Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d
]);
const WEBP_BYTES = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x04, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20
]);

jest.setTimeout(30_000);

describe("journal entry attachments", () => {
  let app: INestApplication;
  let storage: InMemoryObjectStorage;
  let ownerAgent: ReturnType<typeof request.agent>;
  let otherOwnerAgent: ReturnType<typeof request.agent>;
  let readOnlyAgent: ReturnType<typeof request.agent>;
  let owner: TestUser;
  let organizationA: TestOrganization;
  let organizationB: TestOrganization;
  let calendarA: CalendarFixture;
  let calendarB: CalendarFixture;
  let accountsA: AccountFixture;
  let accountsB: AccountFixture;

  beforeAll(async () => {
    storage = new InMemoryObjectStorage();
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule]
    })
      .overrideProvider(OBJECT_STORAGE)
      .useValue(storage)
      .compile();

    app = moduleFixture.createNestApplication();
    configureHttpApp(app);
    await app.init();

    const server = app.getHttpServer();
    ownerAgent = request.agent(server);
    otherOwnerAgent = request.agent(server);
    readOnlyAgent = request.agent(server);

    owner = await register(ownerAgent, "attachments-owner");
    const otherOwner = await register(otherOwnerAgent, "attachments-other-owner");
    const readOnly = await register(readOnlyAgent, "attachments-read-only");
    organizationA = await createOrganization(ownerAgent, "attachments-owner-org");
    organizationB = await createOrganization(otherOwnerAgent, "attachments-other-owner-org");
    [calendarA, calendarB] = await Promise.all([
      createCalendar(organizationA.id, "A"),
      createCalendar(organizationB.id, "B")
    ]);
    [accountsA, accountsB] = await Promise.all([
      createAccounts(organizationA.id, "A"),
      createAccounts(organizationB.id, "B")
    ]);

    await prisma.organizationMember.create({
      data: {
        organizationId: organizationA.id,
        role: OrganizationMemberRole.READ_ONLY,
        userId: readOnly.id
      }
    });

    expect(otherOwner.id).toEqual(expect.any(String));
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it("uploads an allowed file to a draft, records its checksum and creates an audit event", async () => {
    const draft = await createDraft(ownerAgent, organizationA, calendarA, accountsA);
    const response = await upload(ownerAgent, draft.id, {
      body: PDF_BYTES,
      contentType: "application/pdf",
      filename: "receipt.pdf"
    }).expect(201);

    const expectedChecksum = checksum(PDF_BYTES);
    expect(response.body).toMatchObject({
      journalEntryId: draft.id,
      mimeType: "application/pdf",
      organizationId: organizationA.id,
      originalName: "receipt.pdf",
      sha256: expectedChecksum,
      size: PDF_BYTES.byteLength,
      uploadedBy: expect.objectContaining({ id: owner.id })
    });
    expect(response.body.createdAt).toEqual(expect.any(String));
    expect(response.body).not.toHaveProperty("storageKey");

    const attachment = await prisma.attachment.findUniqueOrThrow({
      where: { id: response.body.id }
    });
    expect(attachment).toMatchObject({
      size: BigInt(PDF_BYTES.byteLength),
      journalEntryId: draft.id,
      mimeType: "application/pdf",
      organizationId: organizationA.id,
      sha256: expectedChecksum,
      uploadedById: owner.id
    });
    expect(attachment.storageKey).toMatch(
      new RegExp(`^organizations/${organizationA.id}/journal-entries/${draft.id}/`)
    );
    expect(attachment.storageKey).not.toContain("receipt.pdf");
    expect(attachment.storageKey).not.toContain("..");
    expect(storage.puts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          body: PDF_BYTES,
          contentType: "application/pdf",
          sha256: expectedChecksum,
          storageKey: attachment.storageKey
        })
      ])
    );
    await expect(
      prisma.auditEvent.findFirst({
        where: {
          action: AuditAction.CREATE,
          actorUserId: owner.id,
          entityId: attachment.id,
          entityType: AuditEntityType.ATTACHMENT,
          organizationId: organizationA.id
        }
      })
    ).resolves.not.toBeNull();
  });

  it("accepts each permitted PDF and image format after matching extension, MIME type and magic bytes", async () => {
    const samples = [
      { body: PDF_BYTES, contentType: "application/pdf", filename: "receipt.pdf" },
      { body: JPEG_BYTES, contentType: "image/jpeg", filename: "receipt.jpg" },
      { body: PNG_BYTES, contentType: "image/png", filename: "receipt.png" },
      { body: WEBP_BYTES, contentType: "image/webp", filename: "receipt.webp" }
    ];

    for (const sample of samples) {
      const draft = await createDraft(ownerAgent, organizationA, calendarA, accountsA);
      const response = await upload(ownerAgent, draft.id, sample).expect(201);

      expect(response.body).toMatchObject({
        journalEntryId: draft.id,
        mimeType: sample.contentType,
        originalName: sample.filename,
        sha256: checksum(sample.body),
        size: sample.body.byteLength
      });
    }
  });

  it("retains a draft attachment after its voucher is posted", async () => {
    const draft = await createDraft(ownerAgent, organizationA, calendarA, accountsA);
    const uploaded = await upload(ownerAgent, draft.id, {
      body: PDF_BYTES,
      contentType: "application/pdf",
      filename: "posting-evidence.pdf"
    }).expect(201);

    await ownerAgent.post(`/journal-entries/${draft.id}/post`).expect(201);

    const list = await ownerAgent.get(`/journal-entries/${draft.id}/attachments`).expect(200);
    expect(list.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: uploaded.body.id,
          journalEntryId: draft.id,
          sha256: checksum(PDF_BYTES)
        })
      ])
    );
    await expect(
      prisma.attachment.findUnique({ where: { id: uploaded.body.id } })
    ).resolves.toMatchObject({ journalEntryId: draft.id });

    const putsBeforePostedUpload = storage.puts.length;
    await upload(ownerAgent, draft.id, {
      body: PDF_BYTES,
      contentType: "application/pdf",
      filename: "late-evidence.pdf"
    }).expect(409);
    expect(storage.puts).toHaveLength(putsBeforePostedUpload);
  });

  it("rejects missing, too-large, executable, mismatched MIME, and mismatched extension uploads without persisting metadata", async () => {
    const draft = await createDraft(ownerAgent, organizationA, calendarA, accountsA);
    const putsBefore = storage.puts.length;

    await ownerAgent.post(`/journal-entries/${draft.id}/attachments`).expect(400);
    await upload(ownerAgent, draft.id, {
      body: PDF_BYTES,
      contentType: "application/pdf",
      filename: "malware.exe"
    }).expect(400);
    await upload(ownerAgent, draft.id, {
      body: PDF_BYTES,
      contentType: "application/x-msdownload",
      filename: "receipt.pdf"
    }).expect(400);
    await upload(ownerAgent, draft.id, {
      body: Buffer.from("MZ\u0090\u0000This is executable content"),
      contentType: "application/pdf",
      filename: "receipt.pdf"
    }).expect(400);

    const tooLarge = Buffer.alloc(MAX_ATTACHMENT_BYTES + 1);
    PDF_BYTES.copy(tooLarge);
    await upload(ownerAgent, draft.id, {
      body: tooLarge,
      contentType: "application/pdf",
      filename: "too-large.pdf"
    }).expect(413);

    expect(storage.puts).toHaveLength(putsBefore);
    await expect(
      prisma.attachment.count({
        where: { journalEntryId: draft.id, organizationId: organizationA.id }
      })
    ).resolves.toBe(0);
  });

  it("requires authentication, hides foreign voucher and attachment IDs, and denies read-only uploads", async () => {
    const draftA = await createDraft(ownerAgent, organizationA, calendarA, accountsA);
    const draftB = await createDraft(otherOwnerAgent, organizationB, calendarB, accountsB);
    const uploaded = await upload(ownerAgent, draftA.id, {
      body: PDF_BYTES,
      contentType: "application/pdf",
      filename: "tenant-proof.pdf"
    }).expect(201);
    const putsBeforeDeniedUploads = storage.puts.length;
    const signedDownloadsBeforeForeignAccess = storage.signedDownloads.length;

    await request(app.getHttpServer())
      .post(`/journal-entries/${draftA.id}/attachments`)
      .attach("file", PDF_BYTES, { contentType: "application/pdf", filename: "anonymous.pdf" })
      .expect(401);
    await otherOwnerAgent
      .post(`/journal-entries/${draftA.id}/attachments`)
      .attach("file", PDF_BYTES, { contentType: "application/pdf", filename: "foreign.pdf" })
      .expect(404);
    await ownerAgent.get(`/journal-entries/${draftB.id}/attachments`).expect(404);
    await otherOwnerAgent.get(`/attachments/${uploaded.body.id}/download`).expect(404);
    await readOnlyAgent.get(`/journal-entries/${draftA.id}/attachments`).expect(200);
    await readOnlyAgent
      .post(`/journal-entries/${draftA.id}/attachments`)
      .attach("file", PDF_BYTES, { contentType: "application/pdf", filename: "read-only.pdf" })
      .expect(403);

    expect(storage.puts).toHaveLength(putsBeforeDeniedUploads);
    expect(storage.signedDownloads).toHaveLength(signedDownloadsBeforeForeignAccess);
  });

  it("only signs a member's attachment download and never returns storage metadata to the browser", async () => {
    const draft = await createDraft(ownerAgent, organizationA, calendarA, accountsA);
    const uploaded = await upload(ownerAgent, draft.id, {
      body: PNG_BYTES,
      contentType: "image/png",
      filename: "receipt.png"
    }).expect(201);
    const attachment = await prisma.attachment.findUniqueOrThrow({
      where: { id: uploaded.body.id }
    });
    const signedDownloadsBefore = storage.signedDownloads.length;

    const response = await ownerAgent.get(`/attachments/${uploaded.body.id}/download`).expect(200);

    expect(response.body).toMatchObject({
      downloadUrl: expect.stringMatching(/^https:\/\/storage\.test\/download\//),
      expiresAt: expect.any(String)
    });
    expect(response.body).not.toHaveProperty("storageKey");
    expect(storage.signedDownloads.slice(signedDownloadsBefore)).toEqual([
      expect.objectContaining({
        contentDisposition: expect.stringContaining("attachment"),
        contentType: "image/png",
        storageKey: attachment.storageKey
      })
    ]);
  });

  function checksum(value: Buffer): string {
    return createHash("sha256").update(value).digest("hex");
  }

  function upload(
    agent: ReturnType<typeof request.agent>,
    journalEntryId: string,
    file: { body: Buffer; contentType: string; filename: string }
  ) {
    return agent
      .post(`/journal-entries/${journalEntryId}/attachments`)
      .attach("file", file.body, { contentType: file.contentType, filename: file.filename });
  }
});

async function register(agent: ReturnType<typeof request.agent>, label: string): Promise<TestUser> {
  const response = await agent
    .post("/auth/register")
    .send({
      displayName: `Integration ${label}`,
      email: `${label}-${runId}@example.test`,
      password
    })
    .expect(201);

  return response.body.user as TestUser;
}

async function createOrganization(
  agent: ReturnType<typeof request.agent>,
  label: string
): Promise<TestOrganization> {
  const response = await agent
    .post("/organizations")
    .send({
      name: `Integration ${label}`,
      slug: `${label}-${runSuffix}`
    })
    .expect(201);

  return response.body as TestOrganization;
}

async function createCalendar(organizationId: string, suffix: string): Promise<CalendarFixture> {
  const fiscalYear = await prisma.fiscalYear.create({
    data: {
      endDate: new Date("2026-12-31T00:00:00.000Z"),
      name: `Attachment fiscal year ${suffix} ${runSuffix}`,
      organizationId,
      startDate: new Date("2026-01-01T00:00:00.000Z")
    }
  });
  await prisma.accountingPeriod.create({
    data: {
      endDate: new Date("2026-01-31T00:00:00.000Z"),
      fiscalYearId: fiscalYear.id,
      organizationId,
      periodNumber: 1,
      startDate: new Date("2026-01-01T00:00:00.000Z")
    }
  });
  const voucherSeries = await prisma.voucherSeries.create({
    data: {
      code: "A",
      fiscalYearId: fiscalYear.id,
      name: "Attachment series A",
      organizationId
    }
  });

  return { voucherSeriesId: voucherSeries.id };
}

async function createAccounts(organizationId: string, suffix: string): Promise<AccountFixture> {
  const [bank, revenue] = await Promise.all([
    prisma.account.create({
      data: {
        accountNumber: `19${suffix === "A" ? "50" : "51"}`,
        name: `Attachment bank ${suffix}`,
        normalBalance: BalanceSide.DEBIT,
        organizationId,
        type: AccountType.ASSET
      },
      select: { id: true }
    }),
    prisma.account.create({
      data: {
        accountNumber: `30${suffix === "A" ? "50" : "51"}`,
        name: `Attachment revenue ${suffix}`,
        normalBalance: BalanceSide.CREDIT,
        organizationId,
        type: AccountType.REVENUE
      },
      select: { id: true }
    })
  ]);

  return { bankId: bank.id, revenueId: revenue.id };
}

async function createDraft(
  agent: ReturnType<typeof request.agent>,
  organization: TestOrganization,
  calendar: CalendarFixture,
  accounts: AccountFixture
): Promise<{ id: string }> {
  const response = await agent
    .post("/journal-entries")
    .send({
      description: "Attachment integration voucher",
      lines: [
        {
          accountId: accounts.bankId,
          credit: "0.00",
          debit: "100.00",
          description: "Attachment debit"
        },
        {
          accountId: accounts.revenueId,
          credit: "100.00",
          debit: "0.00",
          description: "Attachment credit"
        }
      ],
      organizationId: organization.id,
      transactionDate: "2026-01-15",
      voucherSeriesId: calendar.voucherSeriesId
    })
    .expect(201);

  return response.body as { id: string };
}
