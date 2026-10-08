import { randomUUID } from "node:crypto";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { prisma } from "@ledgerapp/db";
import { AppModule } from "../src/app.module";
import { configureHttpApp } from "../src/http/app-setup";
import { OBJECT_STORAGE } from "../src/attachments/object-storage";
describe("global attachment archive", () => {
  let app: INestApplication,
    owner: ReturnType<typeof request.agent>,
    outsider: ReturnType<typeof request.agent>,
    org: string,
    entry: string,
    actor: string;
  const sign = jest.fn().mockResolvedValue({
    downloadUrl: "https://private.example.test/short-lived",
    expiresAt: new Date(Date.now() + 60000)
  });
  beforeAll(async () => {
    app = (
      await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(OBJECT_STORAGE)
        .useValue({ putObject: jest.fn(), deleteObject: jest.fn(), createSignedDownloadUrl: sign })
        .compile()
    ).createNestApplication();
    configureHttpApp(app);
    await app.init();
    owner = request.agent(app.getHttpServer());
    outsider = request.agent(app.getHttpServer());
    for (const client of [owner, outsider]) {
      const user = (
        await client
          .post("/auth/register")
          .send({
            email: `${randomUUID()}@example.test`,
            displayName: "Bilageägare",
            password: "A-long-test-password-2026!"
          })
          .expect(201)
      ).body;
      if (client === owner) actor = user.user.id;
    }
    const setup = (
      await owner
        .post("/onboarding")
        .send({
          setupKey: randomUUID(),
          name: "Arkivbolag",
          startDate: "2026-01-01",
          endDate: "2026-12-31"
        })
        .expect(201)
    ).body;
    org = setup.organization.id;
    const accounts = await prisma.account.findMany({
      where: { organizationId: org, accountNumber: { in: ["1930", "3000"] } }
    });
    const series = await prisma.voucherSeries.findFirstOrThrow({ where: { organizationId: org } });
    entry = (
      await owner
        .post("/journal-entries")
        .send({
          organizationId: org,
          voucherSeriesId: series.id,
          transactionDate: "2026-01-10",
          description: "Bilagor",
          lines: [
            { accountId: accounts[0]!.id, debit: "10.00", credit: "0" },
            { accountId: accounts[1]!.id, debit: "0", credit: "10.00" }
          ]
        })
        .expect(201)
    ).body.id;
    for (const name of ["Årskvitto ett.pdf", "Årskvitto två.pdf", "Annan fil.pdf"])
      await owner
        .post(`/journal-entries/${entry}/attachments`)
        .attach("file", Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n"), {
          filename: name,
          contentType: "application/pdf"
        })
        .expect(201);
    await owner.post(`/journal-entries/${entry}/post`).send({ expectedVersion: 1 }).expect(201);
    await prisma.attachment.create({
      data: {
        organizationId: org,
        originalName: "Arkivdokument.pdf",
        safeFileName: "archive.pdf",
        storageKey: `disposable-archive/${randomUUID()}.pdf`,
        mimeType: "application/pdf",
        size: 12n,
        sha256: "a".repeat(64),
        kind: "SUPPORTING_DOCUMENT",
        uploadedById: actor
      }
    });
  });
  afterAll(async () => {
    await app?.close();
  });
  const base = () => `/organizations/${org}/attachments`;
  it("denies anonymous/foreign access before signing", async () => {
    await request(app.getHttpServer()).get(base()).expect(401);
    await outsider.get(base()).expect(404);
    const attachment = await prisma.attachment.findFirstOrThrow({ where: { organizationId: org } });
    await outsider.get(`/attachments/${attachment.id}/download`).expect(404);
    expect(sign).not.toHaveBeenCalled();
  });
  it("stable keyset pages return every record once without storage keys", async () => {
    const ids = new Set<string>();
    let cursor: string | null = null;
    for (let index = 0; index < 4; index++) {
      const page: {
        items: { id: string; journalEntry: { id: string; status: string } | null }[];
        nextCursor: string | null;
      } = (
        await owner
          .get(base())
          .query({ limit: 1, ...(cursor ? { cursor } : {}) })
          .expect(200)
      ).body;
      expect(page.items).toHaveLength(1);
      expect(ids.has(page.items[0].id)).toBe(false);
      ids.add(page.items[0].id);
      cursor = page.nextCursor;
      expect(JSON.stringify(page)).not.toContain("storageKey");
      if (page.items[0].journalEntry) {
        expect(page.items[0].journalEntry.id).toBe(entry);
        expect(page.items[0].journalEntry.status).toBe("POSTED");
      }
    }
    expect(ids.size).toBe(4);
    expect(cursor).toBeNull();
  });
  it("includes existing unlinked documents while voucher filters exclude them", async () => {
    const unlinked = (await owner.get(base()).query({ hasVoucher: "false" }).expect(200)).body
      .items;
    expect(unlinked).toHaveLength(1);
    expect(unlinked[0]).toMatchObject({
      originalName: "Arkivdokument.pdf",
      journalEntry: null,
      kind: "SUPPORTING_DOCUMENT"
    });
    expect(
      (await owner.get(base()).query({ hasVoucher: "true" }).expect(200)).body.items
    ).toHaveLength(3);
    expect(
      (await owner.get(base()).query({ hasVoucher: "false", status: "POSTED" }).expect(200)).body
        .items
    ).toEqual([]);
    await owner.get(base()).query({ hasVoucher: "invalid" }).expect(400);
  });
  it("searches filenames and filters MIME/status/series/number/uploader/date", async () => {
    const day = new Date().toISOString().slice(0, 10);
    const result = (
      await owner
        .get(base())
        .query({
          search: "Årskvitto",
          mimeType: "application/pdf",
          status: "POSTED",
          series: "A",
          voucherNumber: 1,
          uploadedBy: actor,
          fromDate: day,
          toDate: day
        })
        .expect(200)
    ).body;
    expect(result.items).toHaveLength(2);
    expect((await owner.get(base()).query({ status: "DRAFT" }).expect(200)).body.items).toEqual([]);
    await owner.get(base()).query({ search: "x" }).expect(400);
    await owner.get(base()).query({ limit: 1000 }).expect(400);
    await owner.get(base()).query({ cursor: "bad" }).expect(400);
  });
  it("posted download works and revoked membership cannot request another URL", async () => {
    const attachment = await prisma.attachment.findFirstOrThrow({ where: { organizationId: org } });
    await owner.get(`/attachments/${attachment.id}/download`).expect(200);
    expect(sign).toHaveBeenCalledTimes(1);
    const reader = (await outsider.get("/auth/me")).body.user.id;
    const member = await prisma.organizationMember.create({
      data: { userId: reader, organizationId: org, role: "READ_ONLY" }
    });
    await outsider.get(base()).expect(200);
    await prisma.organizationMember.update({
      where: { id: member.id },
      data: { removedAt: new Date() }
    });
    await outsider.get(base()).expect(404);
    await outsider.get(`/attachments/${attachment.id}/download`).expect(404);
    expect(sign).toHaveBeenCalledTimes(1);
  });
});
