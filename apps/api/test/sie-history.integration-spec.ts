import { randomUUID, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { prisma } from "@ledgerapp/db";
import { AppModule } from "../src/app.module";
import { configureHttpApp } from "../src/http/app-setup";
describe("SIE persisted confirmation history", () => {
  let app: INestApplication,
    owner: ReturnType<typeof request.agent>,
    outsider: ReturnType<typeof request.agent>,
    org: string,
    year: string;
  const fixture = readFileSync(
    resolve(__dirname, "../../../tests/fixtures/sie-spec-derived.pc8-escaped.txt"),
    "ascii"
  );
  const bytes = Buffer.from(
    fixture.replace(/\\x([a-f0-9]{2})/gi, (_match, hex: string) =>
      String.fromCharCode(parseInt(hex, 16))
    ),
    "latin1"
  );
  beforeAll(async () => {
    app = (
      await Test.createTestingModule({ imports: [AppModule] }).compile()
    ).createNestApplication();
    configureHttpApp(app);
    await app.init();
    owner = request.agent(app.getHttpServer());
    outsider = request.agent(app.getHttpServer());
    for (const client of [owner, outsider])
      await client
        .post("/auth/register")
        .send({
          email: `${randomUUID()}@example.test`,
          displayName: "SIE-granskare",
          password: "A-long-test-password-2026!"
        })
        .expect(201);
    const setup = (
      await owner
        .post("/onboarding")
        .send({
          setupKey: randomUUID(),
          name: "SIE-historik",
          startDate: "2026-01-01",
          endDate: "2026-12-31"
        })
        .expect(201)
    ).body;
    org = setup.organization.id;
    year = setup.fiscalYear.id;
  });
  afterAll(async () => {
    await app?.close();
  });
  const input = () => ({
    organizationId: org,
    fiscalYearId: year,
    contentBase64: bytes.toString("base64"),
    fileName: "Årsfil.sie"
  });
  it("preview writes no history and altered content/token cannot commit", async () => {
    const preview = (await owner.post("/imports/sie").send(input()).expect(201)).body;
    expect(preview.accountsFound).toBe(3);
    expect(preview.warnings.length).toBeGreaterThan(0);
    expect(await prisma.sieImport.count({ where: { organizationId: org } })).toBe(0);
    await owner
      .post("/imports/sie")
      .send({
        ...input(),
        confirm: true,
        previewToken: preview.previewToken,
        contentBase64: Buffer.concat([bytes, Buffer.from("\n")]).toString("base64")
      })
      .expect(409);
    expect(await prisma.sieImport.count({ where: { organizationId: org } })).toBe(0);
  });
  it("confirmation records counts, hash, actor and links imported vouchers atomically", async () => {
    const preview = (await owner.post("/imports/sie").send(input()).expect(201)).body;
    const result = (
      await owner
        .post("/imports/sie")
        .send({ ...input(), confirm: true, previewToken: preview.previewToken })
        .expect(201)
    ).body;
    expect(result.accountsCreated).toBe(2);
    expect(result.accountsReused).toBe(1);
    const history = (await owner.get(`/organizations/${org}/sie/history`).expect(200)).body;
    expect(history.imports).toHaveLength(1);
    expect(history.imports[0]).toMatchObject({
      sourceFileName: "Årsfil.sie",
      sourceSha256: createHash("sha256").update(bytes).digest("hex"),
      status: "COMPLETED",
      importedEntryCount: 1,
      summary: { accountsCreated: 2, accountsReused: 1 }
    });
    expect(
      await prisma.journalEntry.count({
        where: { organizationId: org, sieImportId: result.importId }
      })
    ).toBe(1);
    const text = JSON.stringify(history);
    expect(text).not.toContain("previewToken");
    expect(text).not.toContain("contentBase64");
    await owner
      .post("/imports/sie")
      .send({ ...input(), confirm: true, previewToken: preview.previewToken })
      .expect(409);
    expect(await prisma.sieImport.count({ where: { organizationId: org } })).toBe(1);
  });
  it("history denies anonymous, foreign and removed members", async () => {
    await request(app.getHttpServer()).get(`/organizations/${org}/sie/history`).expect(401);
    await outsider.get(`/organizations/${org}/sie/history`).expect(404);
    const id = (await outsider.get("/auth/me")).body.user.id;
    await prisma.organizationMember.create({
      data: { organizationId: org, userId: id, role: "READ_ONLY", removedAt: new Date() }
    });
    await outsider.get(`/organizations/${org}/sie/history`).expect(404);
  });
});
