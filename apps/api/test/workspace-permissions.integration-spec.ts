import { randomUUID } from "node:crypto";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { prisma, OrganizationMemberRole } from "@ledgerapp/db";
import { AppModule } from "../src/app.module";
import { configureHttpApp } from "../src/http/app-setup";
import { OBJECT_STORAGE, type ObjectStorage } from "../src/attachments/object-storage";
import { exportSie4Bytes } from "@ledgerapp/sie";
jest.setTimeout(60_000);
describe("cross-phase workspace authorization", () => {
  let app: INestApplication;
  let owner: ReturnType<typeof request.agent>;
  let org: string, fiscalYear: string, targetYear: string, equity: string;
  const clients = new Map<OrganizationMemberRole, ReturnType<typeof request.agent>>();
  // Only the storage boundary is a test transport; authorization/accounting use real PG.
  const storage: ObjectStorage = {
    putObject: jest.fn().mockResolvedValue(undefined),
    deleteObject: jest.fn().mockResolvedValue(undefined),
    createSignedDownloadUrl: jest.fn().mockResolvedValue({
      downloadUrl: "https://storage.test/role-matrix",
      expiresAt: new Date("2035-01-01")
    })
  };
  beforeAll(async () => {
    app = (
      await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(OBJECT_STORAGE)
        .useValue(storage)
        .compile()
    ).createNestApplication();
    configureHttpApp(app);
    await app.init();
    owner = request.agent(app.getHttpServer());
    await owner
      .post("/auth/register")
      .send({
        email: `${randomUUID()}@example.test`,
        displayName: "Matrix owner",
        password: "Long-matrix-password-2026!"
      })
      .expect(201);
    const fixture = (
      await owner
        .post("/onboarding")
        .send({
          setupKey: randomUUID(),
          name: "Permissions",
          startDate: "2026-01-01",
          endDate: "2026-12-31"
        })
        .expect(201)
    ).body;
    org = fixture.organization.id;
    fiscalYear = fixture.fiscalYear.id;
    equity = (
      await prisma.account.findFirstOrThrow({ where: { organizationId: org, type: "EQUITY" } })
    ).id;
    targetYear = (
      await owner
        .post("/fiscal-years")
        .send({ organizationId: org, name: "2027", startDate: "2027-01-01", endDate: "2027-12-31" })
        .expect(201)
    ).body.id;
  });
  afterAll(async () => {
    await app?.close();
  });
  it.each(Object.values(OrganizationMemberRole))(
    "enforces %s on settings, members, series, IB, carry and dimensions",
    async (role) => {
      let client = owner;
      if (role !== "OWNER") {
        client = request.agent(app.getHttpServer());
        const user = (
          await client
            .post("/auth/register")
            .send({
              email: `${randomUUID()}@example.test`,
              displayName: role,
              password: "Long-matrix-password-2026!"
            })
            .expect(201)
        ).body.user;
        await prisma.organizationMember.create({
          data: { organizationId: org, userId: user.id, role }
        });
      }
      const admin = ["OWNER", "ADMIN"].includes(role),
        accounting = ["OWNER", "ADMIN", "ACCOUNTANT"].includes(role);
      clients.set(role, client);
      const base = `/organizations/${org}`;
      for (const path of [
        "members",
        "projects",
        "cost-centers",
        `voucher-series?fiscalYear=${fiscalYear}`,
        `opening-balances?fiscalYear=${fiscalYear}`
      ])
        await client.get(`${base}/${path}`).expect(200);
      await client
        .patch(base)
        .send({ address: "Updated address" })
        .expect(admin ? 200 : 403);
      await client
        .post(`${base}/invitations`)
        .send({ email: `${randomUUID()}@example.test`, role: "READ_ONLY" })
        .expect(admin ? 201 : 403);
      await client
        .post(`${base}/voucher-series`)
        .send({ fiscalYearId: fiscalYear, code: role, name: role })
        .expect(accounting ? 201 : 403);
      for (const kind of ["projects", "cost-centers"])
        await client
          .post(`${base}/${kind}`)
          .send({ code: role, name: role })
          .expect(accounting ? 201 : 403);
      const current = (await client.get(`${base}/opening-balances?fiscalYear=${fiscalYear}`)).body;
      await client
        .post(`${base}/opening-balances`)
        .send({ fiscalYearId: fiscalYear, expectedFingerprint: current.fingerprint, rows: [] })
        .expect(accounting ? 201 : 403);
      const carry = await client
        .post(`${base}/carry-forward/preview`)
        .send({
          sourceFiscalYearId: fiscalYear,
          targetFiscalYearId: targetYear,
          resultAccountId: equity
        })
        .expect(accounting ? 409 : 403);
      if (accounting) expect(carry.body.code).toBe("CARRY_FORWARD_SOURCE_OPEN");
    }
  );
  it.each(Object.values(OrganizationMemberRole))(
    "enforces %s across accounts, draft/post/reversal, reports, fiscal years, SIE and attachments",
    async (role) => {
      // Reuse the five genuine authenticated users; do not bypass register throttling.
      const client = clients.get(role)!;
      const accounting = ["OWNER", "ADMIN", "ACCOUNTANT"].includes(role);
      const admin = ["OWNER", "ADMIN"].includes(role);
      const index = Object.values(OrganizationMemberRole).indexOf(role);
      const yearNumber = 2028 + index;
      const yearPayload = {
        organizationId: org,
        name: `Matrix ${role}`,
        startDate: `${yearNumber}-01-01`,
        endDate: `${yearNumber}-12-31`
      };
      const attempt = await client
        .post("/fiscal-years")
        .send(yearPayload)
        .expect(admin ? 201 : 403);
      const roleYear = admin
        ? attempt.body
        : (await owner.post("/fiscal-years").send(yearPayload).expect(201)).body;
      const series = (
        await owner
          .post(`/organizations/${org}/voucher-series`)
          .send({
            fiscalYearId: roleYear.id,
            code: "A",
            name: "Matrix"
          })
          .expect(201)
      ).body;
      await client
        .post("/accounts")
        .send({
          organizationId: org,
          number: `${19000 + index}`,
          name: `Role ${role}`,
          accountType: "ASSET"
        })
        .expect(accounting ? 201 : 403);
      const accounts = await prisma.account.findMany({
        where: { organizationId: org, accountNumber: { in: ["1930", "3000"] } },
        orderBy: { accountNumber: "asc" }
      });
      const draftPayload = {
        organizationId: org,
        voucherSeriesId: series.id,
        transactionDate: `${yearNumber}-01-10`,
        description: `Matrix ${role}`,
        lines: [
          { accountId: accounts[0].id, debit: "10.00", credit: "0" },
          { accountId: accounts[1].id, debit: "0", credit: "10.00" }
        ]
      };
      const draftAttempt = await client
        .post("/journal-entries")
        .send(draftPayload)
        .expect(accounting ? 201 : 403);
      const draft = accounting
        ? draftAttempt.body
        : (await owner.post("/journal-entries").send(draftPayload).expect(201)).body;
      await client
        .patch(`/journal-entries/${draft.id}`)
        .send({ description: "Reviewed matrix", expectedVersion: draft.version })
        .expect(accounting ? 200 : 403);
      const current = (await owner.get(`/journal-entries/${draft.id}`).expect(200)).body;
      await client.get(`/journal-entries/${draft.id}/attachments`).expect(200);
      const beforePuts = (storage.putObject as jest.Mock).mock.calls.length;
      await client
        .post(`/journal-entries/${draft.id}/attachments`)
        .attach("file", Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n"), {
          filename: "matrix.pdf",
          contentType: "application/pdf"
        })
        .expect(accounting ? 201 : 403);
      expect((storage.putObject as jest.Mock).mock.calls.length).toBe(
        beforePuts + (accounting ? 1 : 0)
      );
      const postAttempt = await client
        .post(`/journal-entries/${draft.id}/post`)
        .send({ expectedVersion: current.version })
        .expect(accounting ? 201 : 403);
      if (!accounting)
        await owner
          .post(`/journal-entries/${draft.id}/post`)
          .send({ expectedVersion: current.version })
          .expect(201);
      else expect(postAttempt.body.status).toBe("POSTED");
      await client
        .post(`/journal-entries/${draft.id}/reverse`)
        .send({
          voucherSeriesId: series.id,
          transactionDate: `${yearNumber}-01-11`
        })
        .expect(accounting ? 201 : 403);
      for (const report of [
        "general-ledger",
        "income-statement",
        "trial-balance",
        "balance-sheet",
        "vat"
      ])
        await client
          .get(`/reports/${report}`)
          .query({
            organizationId: org,
            fiscalYear: roleYear.id,
            ...(report === "balance-sheet"
              ? { reportDate: `${yearNumber}-12-31` }
              : { fromDate: `${yearNumber}-01-01`, toDate: `${yearNumber}-12-31` })
          })
          .expect(200);
      await client.get(`/accounts?organizationId=${org}`).expect(200);
      await client.get(`/exports/sie?organizationId=${org}&fiscalYear=${roleYear.id}`).expect(200);
      const bytes = exportSie4Bytes({
        organization: { name: "Permissions" },
        fiscalYear: { start: `${yearNumber}-01-01`, end: `${yearNumber}-12-31` },
        accounts: [],
        balances: [],
        objects: [],
        vouchers: []
      });
      await client
        .post("/imports/sie")
        .send({
          organizationId: org,
          contentBase64: Buffer.from(bytes).toString("base64"),
          fiscalYearId: roleYear.id
        })
        .expect(accounting ? 201 : 403);
      const calendarBody = { organizationId: org, confirm: true };
      const period = roleYear.accountingPeriods[0];
      await client
        .post(`/accounting-periods/${period.id}/lock`)
        .send(calendarBody)
        .expect(accounting ? 201 : 403);
      await client
        .post(`/accounting-periods/${period.id}/unlock`)
        .send(calendarBody)
        .expect(accounting ? 201 : 403);
      for (const item of roleYear.accountingPeriods)
        await owner.post(`/accounting-periods/${item.id}/lock`).send(calendarBody).expect(201);
      await client
        .post(`/fiscal-years/${roleYear.id}/close`)
        .send(calendarBody)
        .expect(admin ? 201 : 403);
    }
  );
  it("rejects anonymous requests on every new organization read boundary", async () => {
    for (const path of [
      "members",
      "projects",
      "cost-centers",
      `voucher-series?fiscalYear=${fiscalYear}`,
      `opening-balances?fiscalYear=${fiscalYear}`
    ])
      await request(app.getHttpServer()).get(`/organizations/${org}/${path}`).expect(401);
  });
});
