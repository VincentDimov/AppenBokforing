import { randomUUID } from "node:crypto";

import {
  AccountType,
  AuditAction,
  AuditEntityType,
  OrganizationMemberRole,
  Prisma,
  prisma,
  VatCodeType
} from "@ledgerapp/db";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { configureHttpApp } from "../src/http/app-setup";

interface TestUser {
  id: string;
}

interface TestOrganization {
  id: string;
}

interface TestAccount {
  id: string;
}

const runId = randomUUID();
const runSuffix = runId.slice(0, 12);
const password = "A-long-integration-test-password-2026!";

jest.setTimeout(30_000);

describe("account management", () => {
  let app: INestApplication;
  let ownerAgent: ReturnType<typeof request.agent>;
  let otherOwnerAgent: ReturnType<typeof request.agent>;
  let readOnlyAgent: ReturnType<typeof request.agent>;
  let owner: TestUser;
  let organizationA: TestOrganization;
  let organizationB: TestOrganization;
  let accountA: TestAccount;
  let accountB: TestAccount;
  let vatCodeA: string;
  let vatCodeB: string;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleFixture.createNestApplication();
    configureHttpApp(app);
    await app.init();

    const server = app.getHttpServer();
    ownerAgent = request.agent(server);
    otherOwnerAgent = request.agent(server);
    readOnlyAgent = request.agent(server);

    owner = await register(ownerAgent, "accounts-owner");
    const otherOwner = await register(otherOwnerAgent, "accounts-other-owner");
    const readOnly = await register(readOnlyAgent, "accounts-read-only");

    organizationA = await createOrganization(ownerAgent, "accounts-owner-org");
    organizationB = await createOrganization(otherOwnerAgent, "accounts-other-owner-org");

    await prisma.organizationMember.create({
      data: {
        organizationId: organizationA.id,
        role: OrganizationMemberRole.READ_ONLY,
        userId: readOnly.id
      }
    });

    vatCodeA = `VAT-A-${runSuffix}`.toUpperCase();
    vatCodeB = `VAT-B-${runSuffix}`.toUpperCase();
    await prisma.vatCode.createMany({
      data: [
        {
          code: vatCodeA,
          name: "VAT in organization A",
          organizationId: organizationA.id,
          rate: new Prisma.Decimal("25.00"),
          type: VatCodeType.OUTPUT
        },
        {
          code: vatCodeB,
          name: "VAT in organization B",
          organizationId: organizationB.id,
          rate: new Prisma.Decimal("25.00"),
          type: VatCodeType.OUTPUT
        }
      ]
    });

    accountA = await prisma.account.create({
      data: {
        accountNumber: "1910",
        description: "Read-only fixture",
        name: "Cash account",
        normalBalance: "DEBIT",
        organizationId: organizationA.id,
        type: AccountType.ASSET
      },
      select: { id: true }
    });
    accountB = await prisma.account.create({
      data: {
        accountNumber: "1910",
        name: "Foreign cash account",
        normalBalance: "DEBIT",
        organizationId: organizationB.id,
        type: AccountType.ASSET
      },
      select: { id: true }
    });
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it("rejects unauthenticated requests and hides a foreign organization", async () => {
    await request(app.getHttpServer())
      .get("/accounts")
      .query({ organizationId: organizationA.id })
      .expect(401);

    await otherOwnerAgent.get("/accounts").query({ organizationId: organizationA.id }).expect(404);
    await ownerAgent.get(`/accounts/${accountB.id}`).expect(404);
  });

  it("lets an owner create an account, resolves an organization-local VAT code, and audits it", async () => {
    const response = await ownerAgent
      .post("/accounts")
      .send({
        accountType: "ASSET",
        active: true,
        description: "Primary operating account",
        name: "Bank account",
        number: "1930",
        organizationId: organizationA.id,
        vatCode: vatCodeA.toLowerCase()
      })
      .expect(201);

    expect(response.body).toMatchObject({
      accountType: "ASSET",
      active: true,
      description: "Primary operating account",
      name: "Bank account",
      normalBalance: "DEBIT",
      number: "1930",
      organizationId: organizationA.id,
      vatCode: expect.objectContaining({ code: vatCodeA })
    });

    await expect(
      prisma.auditEvent.findFirst({
        where: {
          action: AuditAction.CREATE,
          actorUserId: owner.id,
          entityId: response.body.id,
          entityType: AuditEntityType.ACCOUNT,
          organizationId: organizationA.id
        }
      })
    ).resolves.not.toBeNull();
  });

  it("searches account number prefixes and account names within the active organization", async () => {
    await prisma.account.createMany({
      data: [
        {
          accountNumber: "3001",
          name: "Consulting revenue",
          normalBalance: "CREDIT",
          organizationId: organizationA.id,
          type: AccountType.REVENUE
        },
        {
          accountNumber: "5010",
          name: "Office supplies",
          normalBalance: "DEBIT",
          organizationId: organizationA.id,
          type: AccountType.EXPENSE
        }
      ]
    });

    const numberSearch = await ownerAgent
      .get("/accounts")
      .query({ organizationId: organizationA.id, q: "300" })
      .expect(200);
    expect(numberSearch.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ number: "3001", name: "Consulting revenue" })
      ])
    );

    const nameSearch = await ownerAgent
      .get("/accounts")
      .query({ organizationId: organizationA.id, q: "SUPPLIES" })
      .expect(200);
    expect(nameSearch.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ number: "5010", name: "Office supplies" })])
    );
  });

  it("allows read-only members to read accounts but never write them", async () => {
    await readOnlyAgent.get("/accounts").query({ organizationId: organizationA.id }).expect(200);
    await readOnlyAgent.get(`/accounts/${accountA.id}`).expect(200);

    await readOnlyAgent
      .post("/accounts")
      .send({
        accountType: "ASSET",
        name: "Denied account",
        number: "1940",
        organizationId: organizationA.id
      })
      .expect(403);
    await readOnlyAgent
      .patch(`/accounts/${accountA.id}`)
      .send({ name: "Denied update" })
      .expect(403);
  });

  it("lets an owner update an account and preserves a derived normal balance", async () => {
    const created = await ownerAgent
      .post("/accounts")
      .send({
        accountType: "ASSET",
        name: "Temporary account",
        number: "2641",
        organizationId: organizationA.id
      })
      .expect(201);

    const response = await ownerAgent
      .patch(`/accounts/${created.body.id}`)
      .send({
        accountType: "REVENUE",
        active: false,
        description: "Updated account description",
        name: "Updated sales account",
        vatCode: null
      })
      .expect(200);

    expect(response.body).toMatchObject({
      accountType: "REVENUE",
      active: false,
      description: "Updated account description",
      name: "Updated sales account",
      normalBalance: "CREDIT",
      vatCode: null
    });
    await expect(
      prisma.auditEvent.findFirst({
        where: {
          action: AuditAction.UPDATE,
          actorUserId: owner.id,
          entityId: created.body.id,
          entityType: AuditEntityType.ACCOUNT,
          organizationId: organizationA.id
        }
      })
    ).resolves.not.toBeNull();
  });

  it("keeps account numbers and VAT codes isolated by organization", async () => {
    const payload = {
      accountType: "ASSET",
      name: "Organization-scoped account",
      number: "1510"
    };

    await ownerAgent
      .post("/accounts")
      .send({ ...payload, organizationId: organizationA.id })
      .expect(201);
    await ownerAgent
      .post("/accounts")
      .send({ ...payload, organizationId: organizationA.id })
      .expect(409);
    await otherOwnerAgent
      .post("/accounts")
      .send({ ...payload, organizationId: organizationB.id })
      .expect(201);

    await ownerAgent
      .post("/accounts")
      .send({
        ...payload,
        name: "Wrong VAT tenant",
        number: "1520",
        organizationId: organizationA.id,
        vatCode: vatCodeB
      })
      .expect(404);
  });

  it("has no account deletion endpoint and the database restricts deletion after posting activity", async () => {
    const transactionAccount = await prisma.account.create({
      data: {
        accountNumber: "1941",
        name: "Transaction-protected account",
        normalBalance: "DEBIT",
        organizationId: organizationA.id,
        type: AccountType.ASSET
      }
    });
    const fiscalYear = await prisma.fiscalYear.create({
      data: {
        endDate: new Date("2026-12-31"),
        name: `Account test fiscal year ${runSuffix}`,
        organizationId: organizationA.id,
        startDate: new Date("2026-01-01")
      }
    });
    const accountingPeriod = await prisma.accountingPeriod.create({
      data: {
        endDate: new Date("2026-01-31"),
        fiscalYearId: fiscalYear.id,
        organizationId: organizationA.id,
        periodNumber: 1,
        startDate: new Date("2026-01-01")
      }
    });
    const journalEntry = await prisma.journalEntry.create({
      data: {
        accountingPeriodId: accountingPeriod.id,
        description: "Account protection test",
        entryDate: new Date("2026-01-01"),
        fiscalYearId: fiscalYear.id,
        organizationId: organizationA.id
      }
    });

    await prisma.journalLine.create({
      data: {
        accountId: transactionAccount.id,
        creditAmount: new Prisma.Decimal("0.00"),
        debitAmount: new Prisma.Decimal("1.00"),
        journalEntryId: journalEntry.id,
        lineNumber: 1,
        organizationId: organizationA.id
      }
    });

    await ownerAgent.delete(`/accounts/${transactionAccount.id}`).expect(404);
    await expect(
      prisma.account.delete({ where: { id: transactionAccount.id } })
    ).rejects.toMatchObject({
      code: "P2003"
    });
  });
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
