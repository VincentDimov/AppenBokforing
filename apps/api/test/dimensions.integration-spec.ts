import { randomUUID } from "node:crypto";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { prisma } from "@ledgerapp/db";
import { parseSie4 } from "@ledgerapp/sie";
import { AppModule } from "../src/app.module";
import { configureHttpApp } from "../src/http/app-setup";
import { validateIndependent } from "../../../tests/sie-independent.cjs";
jest.setTimeout(90_000);
describe("dimension registers and immutable labels", () => {
  let app: INestApplication;
  let owner: ReturnType<typeof request.agent>;
  let outsider: ReturnType<typeof request.agent>;
  let org: string;
  let year: string;
  let foreignOrg: string;
  let project: string;
  let center: string;
  let series: string;
  let postedId: string;
  let accounts: string[];
  const base = () => `/organizations/${org}`;
  beforeAll(async () => {
    app = (
      await Test.createTestingModule({ imports: [AppModule] }).compile()
    ).createNestApplication();
    configureHttpApp(app);
    await app.init();
    owner = request.agent(app.getHttpServer());
    outsider = request.agent(app.getHttpServer());
    for (const client of [owner, outsider]) {
      await client
        .post("/auth/register")
        .send({
          email: `${randomUUID()}@example.test`,
          displayName: "Projektägare",
          password: "A-long-test-password-2026!"
        })
        .expect(201);
      const fixture = (
        await client
          .post("/onboarding")
          .send({
            setupKey: randomUUID(),
            name: "Dimensioner",
            startDate: "2026-01-01",
            endDate: "2026-12-31"
          })
          .expect(201)
      ).body;
      if (client === owner) {
        org = fixture.organization.id;
        year = fixture.fiscalYear.id;
      } else foreignOrg = fixture.organization.id;
    }
    accounts = (
      await prisma.account.findMany({
        where: { organizationId: org, accountNumber: { in: ["1930", "3000"] } },
        orderBy: { accountNumber: "asc" }
      })
    ).map((account) => account.id);
    series = (await prisma.voucherSeries.findFirstOrThrow({ where: { organizationId: org } })).id;
  });
  afterAll(async () => {
    await app?.close();
  });
  async function draft(projectCode = "P_1", costCenterCode = "CC_1") {
    return (
      await owner
        .post("/journal-entries")
        .send({
          organizationId: org,
          voucherSeriesId: series,
          transactionDate: "2026-01-10",
          description: "Dimensions",
          lines: [
            { accountId: accounts[0], debit: "100", credit: "0", projectCode, costCenterCode },
            { accountId: accounts[1], debit: "0", credit: "100", projectCode, costCenterCode }
          ]
        })
        .expect(201)
    ).body;
  }
  it("creates and searches safe identities with Swedish names", async () => {
    project = (
      await owner
        .post(`${base()}/projects`)
        .send({ code: "p_1", name: "Årsprojekt Öst" })
        .expect(201)
    ).body.id;
    center = (
      await owner
        .post(`${base()}/cost-centers`)
        .send({ code: "CC_1", name: "Sälj Ängelholm" })
        .expect(201)
    ).body.id;
    expect((await owner.get(`${base()}/projects?search=öst`).expect(200)).body).toHaveLength(1);
    await owner.post(`${base()}/projects`).send({ code: 'P"\n#VER', name: "Unsafe" }).expect(400);
    await outsider.get(`${base()}/projects`).expect(404);
  });
  it("posts snapshots and rename does not change original labels or identifiers", async () => {
    const entry = await draft();
    const result = await owner
      .post(`/journal-entries/${entry.id}/post`)
      .send({ expectedVersion: entry.version })
      .expect(201);
    postedId = entry.id;
    expect(result.body.lines[0].project).toMatchObject({ code: "P_1", name: "Årsprojekt Öst" });
    await owner
      .patch(`${base()}/projects/${project}`)
      .send({ name: "Framtida projektnamn" })
      .expect(200);
    expect((await owner.get(`/journal-entries/${postedId}`)).body.lines[0].project.name).toBe(
      "Årsprojekt Öst"
    );
    await owner.patch(`${base()}/projects/${project}`).send({ code: "CHANGED" }).expect(409);
    await expect(prisma.project.delete({ where: { id: project } })).rejects.toThrow();
    await expect(
      prisma.journalLine.update({
        where: { id: result.body.lines[0].id },
        data: { projectSnapshot: { id: project, code: "P_1", name: "Alter history" } }
      })
    ).rejects.toThrow();
  });
  it("dimension deactivation vs post has a single consistent outcome and keeps historical report filtering", async () => {
    const entry = await draft();
    const result = await Promise.all([
      owner.post(`/journal-entries/${entry.id}/post`).send({ expectedVersion: entry.version }),
      owner.patch(`${base()}/cost-centers/${center}`).send({ isActive: false })
    ]);
    expect(result[1].status).toBe(200);
    expect([201, 409]).toContain(result[0].status);
    const report = (
      await owner
        .get("/reports/income-statement")
        .query({
          organizationId: org,
          fiscalYear: year,
          fromDate: "2026-01-01",
          toDate: "2026-12-31",
          project: "P_1",
          costCenter: "CC_1"
        })
        .expect(200)
    ).body;
    expect(report.totals.periodResult).toBe(result[0].status === 201 ? "200.00" : "100.00");
    expect((await owner.get(`${base()}/cost-centers?activeOnly=true`)).body).toEqual([]);
    await owner.patch(`${base()}/cost-centers/${center}`).send({ isActive: true }).expect(200);
  });
  it("concurrent name change vs post freezes the name visible at posting", async () => {
    const entry = await draft();
    const results = await Promise.all([
      owner.post(`/journal-entries/${entry.id}/post`).send({ expectedVersion: entry.version }),
      owner.patch(`${base()}/projects/${project}`).send({ name: "Tredje projektnamnet" })
    ]);
    expect(results.map((result) => result.status)).toEqual([201, 200]);
    const stored = await prisma.journalLine.findFirstOrThrow({
      where: { journalEntryId: entry.id }
    });
    expect(stored.projectSnapshot).toEqual(
      expect.objectContaining({ code: "P_1", name: expect.any(String) })
    );
    expect((await owner.get(`/journal-entries/${entry.id}`)).body.lines[0].project).toEqual(
      stored.projectSnapshot
    );
  });
  it("SIE independently validates and roundtrips supported identities, original labels and inactive dimensions", async () => {
    await owner.patch(`${base()}/projects/${project}`).send({ isActive: false }).expect(200);
    const exported = await owner
      .get("/exports/sie")
      .query({ organizationId: org, fiscalYear: year })
      .expect(200);
    const bytes = Buffer.from(exported.body);
    expect(() => validateIndependent(bytes)).not.toThrow();
    const parsed = parseSie4(bytes);
    expect(parsed.objects).toContainEqual({ dimension: "6", id: "P_1", name: "Årsprojekt Öst" });
    const destination = (
      await owner
        .post("/onboarding")
        .send({
          setupKey: randomUUID(),
          name: "SIE destination",
          startDate: "2026-01-01",
          endDate: "2026-12-31"
        })
        .expect(201)
    ).body;
    const input = {
      organizationId: destination.organization.id,
      fiscalYearId: destination.fiscalYear.id,
      contentBase64: bytes.toString("base64")
    };
    const preview = (await owner.post("/imports/sie").send(input).expect(201)).body;
    await owner
      .post("/imports/sie")
      .send({ ...input, confirm: true, previewToken: preview.previewToken })
      .expect(201);
    expect(
      await prisma.journalLine.findFirst({
        where: { organizationId: destination.organization.id, projectId: { not: null } }
      })
    ).toMatchObject({
      projectSnapshot: expect.objectContaining({ code: "P_1", name: "Årsprojekt Öst" })
    });
  });
  it("reversal preserves original snapshots even after rename/deactivation", async () => {
    const reversed = await owner
      .post(`/journal-entries/${postedId}/reverse`)
      .send({ voucherSeriesId: series, transactionDate: "2026-01-11", description: "Correction" })
      .expect(201);
    expect(reversed.body.lines[0].project.name).toBe("Årsprojekt Öst");
  });
  it("cross-tenant IDs and codes cannot be assigned, and duplicate creates have one winner", async () => {
    const foreign = (
      await outsider
        .post(`/organizations/${foreignOrg}/projects`)
        .send({ code: "FOREIGN", name: "Främmande" })
        .expect(201)
    ).body;
    await owner.patch(`${base()}/projects/${foreign.id}`).send({ name: "No" }).expect(404);
    const input = {
      organizationId: org,
      voucherSeriesId: series,
      transactionDate: "2026-01-10",
      description: "Forgery",
      lines: [
        { accountId: accounts[0], debit: "100", credit: "0", projectCode: "FOREIGN" },
        { accountId: accounts[1], debit: "0", credit: "100" }
      ]
    };
    await owner.post("/journal-entries").send(input).expect(404);
    await owner
      .post("/journal-entries")
      .send({ ...input, lines: [{ ...input.lines[0], projectId: foreign.id }, input.lines[1]] })
      .expect(400);
    const results = await Promise.all([
      owner.post(`${base()}/projects`).send({ code: "DUP", name: "One" }),
      owner.post(`${base()}/projects`).send({ code: "DUP", name: "Two" })
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
  });
});
