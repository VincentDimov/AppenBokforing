import { randomUUID } from "node:crypto";
import { prisma } from "@ledgerapp/db";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureHttpApp } from "../src/http/app-setup";

/** Entirely original synthetic data. Never imports the copyrighted BAS chart. */
describe("BAS versioned catalog / tenant activation", () => {
  let app: INestApplication,
    owner: ReturnType<typeof request.agent>,
    reader: ReturnType<typeof request.agent>;
  let org: string,
    foreign: string,
    catalog: string,
    sub: string,
    restricted: string,
    contra: string;
  const run = randomUUID(),
    password = "Synthetic-only-long-test-password-2026!";
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    configureHttpApp(app);
    await app.init();
    owner = request.agent(app.getHttpServer());
    reader = request.agent(app.getHttpServer());
    await owner
      .post("/auth/register")
      .send({ email: `bas-owner-${run}@example.test`, displayName: "Synthetic owner", password })
      .expect(201);
    const user = await reader
      .post("/auth/register")
      .send({ email: `bas-reader-${run}@example.test`, displayName: "Synthetic reader", password })
      .expect(201);
    org = (
      await owner
        .post("/organizations")
        .send({ name: "Synthetic BAS organization", slug: `bas-${run}` })
        .expect(201)
    ).body.id;
    foreign = (
      await prisma.organization.create({
        data: { name: "Foreign synthetic tenant", slug: `bas-foreign-${run}` }
      })
    ).id;
    await prisma.organizationMember.create({
      data: { organizationId: org, userId: user.body.user.id, role: "READ_ONLY" }
    });
    const rows = [
      {
        accountNumber: "1100",
        category: "GROUP_ACCOUNT" as const,
        type: "ASSET" as const,
        normalBalance: "DEBIT" as const,
        parentAccountNumber: null,
        isK2Restricted: false,
        isDefaultActive: true
      },
      {
        accountNumber: "1110",
        category: "MAIN_ACCOUNT" as const,
        type: "ASSET" as const,
        normalBalance: "DEBIT" as const,
        parentAccountNumber: null,
        isK2Restricted: false,
        isDefaultActive: true
      },
      {
        accountNumber: "1111",
        category: "SUBACCOUNT" as const,
        type: "ASSET" as const,
        normalBalance: "DEBIT" as const,
        parentAccountNumber: "1110",
        isK2Restricted: false,
        isDefaultActive: false
      },
      {
        accountNumber: "1290",
        category: "MAIN_ACCOUNT" as const,
        type: "ASSET" as const,
        normalBalance: "CREDIT" as const,
        parentAccountNumber: null,
        isK2Restricted: false,
        isDefaultActive: true
      },
      {
        accountNumber: "2080",
        category: "MAIN_ACCOUNT" as const,
        type: "EQUITY" as const,
        normalBalance: "CREDIT" as const,
        parentAccountNumber: null,
        isK2Restricted: true,
        isDefaultActive: false
      },
      {
        accountNumber: "8000",
        category: "GROUP_ACCOUNT" as const,
        type: "REVENUE" as const,
        normalBalance: "CREDIT" as const,
        parentAccountNumber: null,
        isK2Restricted: false,
        isDefaultActive: true
      },
      {
        accountNumber: "8010",
        category: "MAIN_ACCOUNT" as const,
        type: "EXPENSE" as const,
        normalBalance: "DEBIT" as const,
        parentAccountNumber: null,
        isK2Restricted: false,
        isDefaultActive: true
      }
    ];
    await prisma.$transaction(async (tx) => {
      catalog = (
        await tx.basCatalogVersion.create({
          data: {
            version: `SYNTHETIC-ONLY-${run}`,
            sourceVersion: "synthetic-v1",
            sourceReference: "synthetic://fixture",
            sourceSha256: "a".repeat(64),
            contentSha256: "b".repeat(64),
            licenseReference: "Original synthetic fixture only",
            classificationReviewReference: "Manually defined synthetic economic expectations",
            verificationReport: { synthetic: true },
            rowCount: rows.length
          }
        })
      ).id;
      await tx.basAccountCatalog.createMany({
        data: rows.map((row) => ({
          ...row,
          id: randomUUID(),
          catalogVersionId: catalog,
          officialName: `Synthetic ${row.accountNumber}`,
          accountClass: row.accountNumber[0]!,
          accountGroup: row.accountNumber.slice(0, 2),
          className: "Synthetic class",
          groupName: "Synthetic group",
          isBookable: true,
          classificationReference: "Synthetic fixture reviewed",
          sourcePosition: "Fixture"
        }))
      });
    });
    const entries = await prisma.basAccountCatalog.findMany({
      where: { catalogVersionId: catalog }
    });
    sub = entries.find((e) => e.accountNumber === "1111")!.id;
    restricted = entries.find((e) => e.accountNumber === "2080")!.id;
    contra = entries.find((e) => e.accountNumber === "1290")!.id;
  });
  afterAll(async () => {
    await prisma.basCatalogVersion.updateMany({
      where: { id: catalog, isDefault: true },
      data: { isDefault: false }
    });
    await app?.close();
  });
  it("rejects anonymous and foreign-tenant catalog reads", async () => {
    await request(app.getHttpServer()).get(`/accounts/catalog?organizationId=${org}`).expect(401);
    await owner.get(`/accounts/catalog?organizationId=${foreign}`).expect(404);
  });
  it("forbids read-only activation, provision and framework change", async () => {
    for (const path of ["activate", "activation-preview"])
      await reader
        .post(`/accounts/catalog/${path}`)
        .send({ organizationId: org, catalogAccountIds: [sub] })
        .expect(403);
    await reader
      .post("/accounts/catalog/provision")
      .send({ organizationId: org, versionId: catalog })
      .expect(403);
    await reader
      .post("/accounts/catalog/framework")
      .send({ organizationId: org, framework: "K3", confirmation: "Synthetic BAS organization" })
      .expect(403);
  });
  it("preserves existing ids/names/VAT/status and provision is idempotent under concurrency", async () => {
    const custom = await prisma.account.create({
      data: {
        organizationId: org,
        accountNumber: "1110",
        name: "Local reviewed label",
        type: "ASSET",
        normalBalance: "DEBIT",
        isActive: false
      }
    });
    const first = await owner
      .post("/accounts/catalog/provision")
      .send({ organizationId: org, versionId: catalog })
      .expect(201);
    expect(first.body).toMatchObject({ configured: true, inserted: 4, preserved: 1 });
    expect(await prisma.account.findUnique({ where: { id: custom.id } })).toMatchObject({
      name: custom.name,
      isActive: false,
      basCatalogAccountId: null
    });
    const results = await Promise.all(
      [1, 2].map(() =>
        owner
          .post("/accounts/catalog/provision")
          .send({ organizationId: org, versionId: catalog })
          .expect(201)
      )
    );
    expect(results.map((r) => r.body.inserted)).toEqual([0, 0]);
    expect(await prisma.account.count({ where: { organizationId: org } })).toBe(5);
    expect(
      await prisma.account.count({
        where: { organizationId: org, accountNumber: { in: ["1111", "2080"] } }
      })
    ).toBe(0);
  });
  it("returns real counts, numeric sorting, Swedish labels and bounded pages", async () => {
    const result = await reader
      .get(`/accounts/catalog?organizationId=${org}&tab=all&pageSize=25`)
      .expect(200);
    expect(result.body.total).toBe(7);
    expect(result.body.items.map((i: { number: string }) => i.number)).toEqual([
      "1100",
      "1110",
      "1111",
      "1290",
      "2080",
      "8000",
      "8010"
    ]);
    expect(result.body.counts).toMatchObject({ active: 4, available: 3, main: 6, sub: 1 });
    await owner.get(`/accounts/catalog?organizationId=${org}&pageSize=10000`).expect(400);
    await owner.get(`/accounts/catalog?organizationId=${org}&group=ab`).expect(400);
  });
  it("fails bulk activation atomically for NOT_CONFIGURED and K2", async () => {
    for (const framework of ["NOT_CONFIGURED", "K2"]) {
      await owner
        .post("/accounts/catalog/framework")
        .send({ organizationId: org, framework, confirmation: "Synthetic BAS organization" })
        .expect(201);
      const preview = await owner
        .post("/accounts/catalog/activation-preview")
        .send({ organizationId: org, catalogAccountIds: [sub, restricted] })
        .expect(201);
      expect(preview.body).toMatchObject({ selected: 2, canAdd: 1, notAllowed: 1 });
      await owner
        .post("/accounts/catalog/activate")
        .send({ organizationId: org, catalogAccountIds: [sub, restricted] })
        .expect(400);
      expect(
        await prisma.account.count({ where: { organizationId: org, accountNumber: "1111" } })
      ).toBe(0);
    }
  });
  it("blocks a manually created restricted number without BAS provenance", async () => {
    await owner
      .post("/accounts")
      .send({
        organizationId: org,
        number: "2080",
        name: "Custom bypass attempt",
        accountType: "EQUITY"
      })
      .expect(400);
    await expect(
      prisma.account.create({
        data: {
          organizationId: org,
          accountNumber: "2080",
          name: "SQL bypass",
          type: "EQUITY",
          normalBalance: "CREDIT"
        }
      })
    ).rejects.toThrow();
  });
  it("rejects foreign catalog ids without creating any account", async () => {
    await owner
      .post("/accounts/catalog/activate")
      .send({ organizationId: org, catalogAccountIds: [randomUUID()] })
      .expect(404);
  });
  it("requires typed confirmation for K3 and activates precisely the selected accounts", async () => {
    await owner
      .post("/accounts/catalog/framework")
      .send({ organizationId: org, framework: "K3", confirmation: "wrong" })
      .expect(400);
    await owner
      .post("/accounts/catalog/framework")
      .send({ organizationId: org, framework: "K3", confirmation: "Synthetic BAS organization" })
      .expect(201);
    const results = await Promise.all(
      [1, 2].map(() =>
        owner
          .post("/accounts/catalog/activate")
          .send({ organizationId: org, catalogAccountIds: [sub, restricted] })
          .expect(201)
      )
    );
    expect(results.reduce((sum, r) => sum + r.body.activated, 0)).toBe(2);
    expect(
      await prisma.account.count({
        where: { organizationId: org, accountNumber: { in: ["1111", "2080"] } }
      })
    ).toBe(2);
    expect(
      await prisma.auditEvent.count({
        where: { organizationId: org, metadata: { path: ["operation"], equals: "BAS_ACTIVATE" } }
      })
    ).toBe(2);
  });
  it("preserves contra normal side on unrelated edits and freezes BAS identity", async () => {
    const a = await prisma.account.findFirstOrThrow({
      where: { organizationId: org, basCatalogAccountId: contra }
    });
    const updated = await owner
      .patch(`/accounts/${a.id}`)
      .send({ accountType: "ASSET", name: "Local contra label", active: true })
      .expect(200);
    expect(updated.body.normalBalance).toBe("CREDIT");
    await owner.patch(`/accounts/${a.id}`).send({ number: "1291" }).expect(409);
    await expect(
      prisma.account.update({ where: { id: a.id }, data: { basCatalogAccountId: null } })
    ).rejects.toThrow();
  });
  it("requires reviewed reconciliation before K3 to K2 downgrade", async () => {
    await owner
      .post("/accounts/catalog/framework")
      .send({ organizationId: org, framework: "K2", confirmation: "Synthetic BAS organization" })
      .expect(409);
    expect(
      (await prisma.organization.findUniqueOrThrow({ where: { id: org } })).accountingFramework
    ).toBe("K3");
  });
  it("keeps reference identity immutable and rejects incomplete catalogs", async () => {
    await expect(
      prisma.basAccountCatalog.update({ where: { id: sub }, data: { officialName: "overwritten" } })
    ).rejects.toThrow();
    await expect(prisma.basAccountCatalog.delete({ where: { id: sub } })).rejects.toThrow();
    await expect(
      prisma.basCatalogVersion.create({
        data: {
          version: `INCOMPLETE-${run}`,
          sourceVersion: "test",
          sourceReference: "synthetic://",
          sourceSha256: "a".repeat(64),
          contentSha256: "b".repeat(64),
          licenseReference: "Synthetic",
          classificationReviewReference: "Test",
          verificationReport: {},
          rowCount: 1
        }
      })
    ).rejects.toThrow();
  });
  it("automatically provisions defaults on new organization creation, but never subaccounts", async () => {
    await prisma.basCatalogVersion.update({ where: { id: catalog }, data: { isDefault: true } });
    try {
      const result = await owner
        .post("/organizations")
        .send({ name: "New synthetic organization", slug: `bas-new-${run}` })
        .expect(201);
      expect(await prisma.account.count({ where: { organizationId: result.body.id } })).toBe(5);
      expect(
        await prisma.account.count({
          where: { organizationId: result.body.id, accountNumber: { in: ["1111", "2080"] } }
        })
      ).toBe(0);
    } finally {
      await prisma.basCatalogVersion.update({ where: { id: catalog }, data: { isDefault: false } });
    }
  });
  it("database denies runtime catalog writes even though activation needs account writes", async () => {
    const role = `bas_readonly_${run.replaceAll("-", "")}`;
    await prisma.$executeRawUnsafe(`CREATE ROLE ${role} NOLOGIN`);
    try {
      await prisma.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO ${role}`);
      await prisma.$executeRawUnsafe(
        `GRANT SELECT ON bas_catalog_versions,bas_account_catalog TO ${role}`
      );
      await expect(
        prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
          await tx.basAccountCatalog.update({
            where: { id: sub },
            data: { officialName: "not allowed" }
          });
        })
      ).rejects.toThrow();
    } finally {
      await prisma.$executeRawUnsafe(`DROP OWNED BY ${role}`);
      await prisma.$executeRawUnsafe(`DROP ROLE ${role}`);
    }
  });
  it("deactivation excludes a BAS account from new drafts, posting and template application", async () => {
    const year = (
      await owner
        .post("/fiscal-years")
        .send({
          organizationId: org,
          name: "Synthetic 2026",
          startDate: "2026-01-01",
          endDate: "2026-12-31"
        })
        .expect(201)
    ).body;
    const series = (
      await owner
        .post(`/organizations/${org}/voucher-series`)
        .send({ fiscalYearId: year.id, code: "A", name: "Synthetic series" })
        .expect(201)
    ).body;
    const asset = await prisma.account.findFirstOrThrow({
      where: { organizationId: org, accountNumber: "1111" }
    });
    const revenue = await prisma.account.findFirstOrThrow({
      where: { organizationId: org, accountNumber: "8000" }
    });
    const lines = [
      { accountId: asset.id, debit: "9.99", credit: "0" },
      { accountId: revenue.id, debit: "0", credit: "9.99" }
    ];
    const input = {
      organizationId: org,
      voucherSeriesId: series.id,
      transactionDate: "2026-01-10",
      description: "Synthetic optional account",
      lines
    };
    const draft = (await owner.post("/journal-entries").send(input).expect(201)).body;
    const template = (
      await owner
        .post(`/organizations/${org}/posting-templates`)
        .send({
          code: "BAS_SYNTHETIC",
          name: "Synthetic template",
          lines: [
            { accountId: asset.id, side: "DEBIT", amount: "9.99" },
            { accountId: revenue.id, side: "CREDIT", amount: "9.99" }
          ]
        })
        .expect(201)
    ).body;
    await owner.patch(`/accounts/${asset.id}`).send({ active: false }).expect(200);
    await owner.post("/journal-entries").send(input).expect(404);
    await owner
      .post(`/journal-entries/${draft.id}/post`)
      .send({ expectedVersion: draft.version })
      .expect(409);
    await owner.post(`/organizations/${org}/posting-templates/${template.id}/apply`).expect(409);
    const choices = await owner
      .get(`/accounts?organizationId=${org}&activeOnly=true&limit=30&q=111`)
      .expect(200);
    expect(choices.body.some((a: { id: string }) => a.id === asset.id)).toBe(false);
    const balances = await owner
      .get(`/organizations/${org}/opening-balances?fiscalYear=${year.id}`)
      .expect(200);
    await owner
      .post(`/organizations/${org}/opening-balances`)
      .send({
        fiscalYearId: year.id,
        expectedFingerprint: balances.body.fingerprint,
        rows: [
          { accountId: asset.id, debit: "100", credit: "0" },
          {
            accountId: (
              await prisma.account.findFirstOrThrow({
                where: { organizationId: org, accountNumber: "2080" }
              })
            ).id,
            debit: "0",
            credit: "100"
          }
        ]
      })
      .expect(400);
    await owner
      .post("/accounts/catalog/activate")
      .send({ organizationId: org, catalogAccountIds: [sub] })
      .expect(201);
    await owner
      .post(`/journal-entries/${draft.id}/post`)
      .send({ expectedVersion: draft.version })
      .expect(201);
    await owner.patch(`/accounts/${asset.id}`).send({ active: false }).expect(200);
    const correction = (
      await owner
        .post(`/journal-entries/${draft.id}/reverse`)
        .send({ voucherSeriesId: series.id, transactionDate: "2026-02-01" })
        .expect(201)
    ).body;
    expect(correction.reversesEntryId).toBe(draft.id);
    await owner
      .patch(`/journal-entries/${draft.id}`)
      .send({
        description: "Forbidden posted edit",
        expectedVersion: (await prisma.journalEntry.findUniqueOrThrow({ where: { id: draft.id } }))
          .version
      })
      .expect(409);
    const ledger = await owner
      .get(
        `/reports/general-ledger?organizationId=${org}&fiscalYear=${year.id}&fromDate=2026-01-01&toDate=2026-12-31`
      )
      .expect(200);
    expect(JSON.stringify(ledger.body)).toContain("9.99");
    const journal = await prisma.journalEntry.findUniqueOrThrow({
      where: { id: draft.id },
      include: { lines: true }
    });
    expect(journal.lines[0]!.accountSnapshot).not.toBeNull();
  });
  it("SIE previews eligible optional activations and requires an extra explicit acknowledgement", async () => {
    const target = (
      await owner
        .post("/organizations")
        .send({ name: "Synthetic SIE", slug: `bas-sie-${run}` })
        .expect(201)
    ).body.id;
    await owner
      .post("/accounts/catalog/provision")
      .send({ organizationId: target, versionId: catalog })
      .expect(201);
    const year = (
      await owner
        .post("/fiscal-years")
        .send({
          organizationId: target,
          name: "Synthetic 2026",
          startDate: "2026-01-01",
          endDate: "2026-12-31"
        })
        .expect(201)
    ).body;
    const content =
      '#SIETYP 4\n#RAR 0 20260101 20261231\n#KONTO 1111 "Synthetic optional"\n#KTYP 1111 T\n#KONTO 8000 "Synthetic revenue"\n#KTYP 8000 I\n#VER A 1 20260110 "Synthetic import"\n{\n#TRANS 1111 {} 10.00\n#TRANS 8000 {} -10.00\n}\n';
    const input = { organizationId: target, fiscalYearId: year.id, content };
    const preview = (await owner.post("/imports/sie").send(input).expect(201)).body;
    expect(preview.validationErrors).toEqual([]);
    expect(preview.accountPlan).toContainEqual(
      expect.objectContaining({ number: "1111", kind: "ACTIVATE_BAS", activationRequired: true })
    );
    expect(
      await prisma.account.count({ where: { organizationId: target, accountNumber: "1111" } })
    ).toBe(0);
    await owner
      .post("/imports/sie")
      .send({ ...input, confirm: true, previewToken: preview.previewToken })
      .expect(409);
    expect(await prisma.journalEntry.count({ where: { organizationId: target } })).toBe(0);
    await owner
      .post("/imports/sie")
      .send({
        ...input,
        confirm: true,
        previewToken: preview.previewToken,
        acknowledgeAccountActivations: true
      })
      .expect(201);
    expect(
      await prisma.account.findFirst({ where: { organizationId: target, accountNumber: "1111" } })
    ).toMatchObject({ basCatalogAccountId: sub, name: "Synthetic 1111", isActive: true });
  });
  it("SIE reports K2 restriction conflicts before any financial writes", async () => {
    const target = (
      await owner
        .post("/organizations")
        .send({ name: "Synthetic K2 SIE", slug: `bas-k2-sie-${run}` })
        .expect(201)
    ).body.id;
    await owner
      .post("/accounts/catalog/provision")
      .send({ organizationId: target, versionId: catalog })
      .expect(201);
    const year = (
      await owner
        .post("/fiscal-years")
        .send({
          organizationId: target,
          name: "Synthetic 2026",
          startDate: "2026-01-01",
          endDate: "2026-12-31"
        })
        .expect(201)
    ).body;
    const content =
      '#SIETYP 4\n#RAR 0 20260101 20261231\n#KONTO 2080 "Restricted synthetic equity"\n#KTYP 2080 S\n#KONTO 1100 "Synthetic asset"\n#KTYP 1100 T\n#IB 0 1100 100\n#IB 0 2080 -100\n';
    const input = { organizationId: target, fiscalYearId: year.id, content };
    const preview = (await owner.post("/imports/sie").send(input).expect(201)).body;
    expect(preview.validationErrors.join(" ")).toContain("K3");
    await owner
      .post("/imports/sie")
      .send({
        ...input,
        confirm: true,
        previewToken: preview.previewToken,
        acknowledgeAccountActivations: true
      })
      .expect(409);
    expect(await prisma.openingBalance.count({ where: { organizationId: target } })).toBe(0);
  });
  it("existing restricted account blocks catalog adoption with a controlled review conflict", async () => {
    const target = (
      await owner
        .post("/organizations")
        .send({ name: "Legacy restricted", slug: `bas-legacy-${run}` })
        .expect(201)
    ).body.id;
    const account = (
      await owner
        .post("/accounts")
        .send({
          organizationId: target,
          number: "2080",
          name: "Preserve legacy customization",
          accountType: "EQUITY"
        })
        .expect(201)
    ).body;
    const before = await prisma.account.findUniqueOrThrow({ where: { id: account.id } });
    const result = await owner
      .post("/accounts/catalog/provision")
      .send({ organizationId: target, versionId: catalog })
      .expect(409);
    expect(result.body.code).toBe("BAS_CATALOG_REVIEW_REQUIRED");
    expect(await prisma.account.findUniqueOrThrow({ where: { id: account.id } })).toEqual(before);
    expect(
      (await prisma.organization.findUniqueOrThrow({ where: { id: target } })).basCatalogVersionId
    ).toBeNull();
  });
});
