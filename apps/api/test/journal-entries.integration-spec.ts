import { randomUUID } from "node:crypto";

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
import { configureHttpApp } from "../src/http/app-setup";

interface TestUser {
  id: string;
}

interface TestOrganization {
  id: string;
}

interface CalendarFixture {
  fiscalYearId: string;
  lockedPeriodId: string;
  openPeriodId: string;
  voucherSeriesId: string;
}

interface JournalLinePayload {
  accountId: string;
  credit: string;
  debit: string;
  description?: string;
}

interface JournalEntryResponse {
  accountingPeriod: { id: string };
  id: string;
  lines: Array<{
    account: { id: string };
    credit: string;
    debit: string;
    description: string | null;
    lineNumber: number;
  }>;
  reversesEntryId?: string | null;
  reversedByEntryId?: string | null;
  source?: string;
  status: string;
  totals: { credit: string; debit: string; difference: string };
  transactionDate?: string;
  voucherNumber: number | null;
}

const runId = randomUUID();
const runSuffix = runId.slice(0, 12);
const password = "A-long-integration-test-password-2026!";

jest.setTimeout(30_000);

describe("journal entries and double-entry bookkeeping", () => {
  let app: INestApplication;
  let ownerAgent: ReturnType<typeof request.agent>;
  let otherOwnerAgent: ReturnType<typeof request.agent>;
  let readOnlyAgent: ReturnType<typeof request.agent>;
  let owner: TestUser;
  let organizationA: TestOrganization;
  let organizationB: TestOrganization;
  let calendarA: CalendarFixture;
  let accountA: string;
  let revenueAccountA: string;
  let accountB: string;

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

    owner = await register(ownerAgent, "journals-owner");
    const otherOwner = await register(otherOwnerAgent, "journals-other-owner");
    const readOnly = await register(readOnlyAgent, "journals-read-only");
    organizationA = await createOrganization(ownerAgent, "journals-owner-org");
    organizationB = await createOrganization(otherOwnerAgent, "journals-other-owner-org");
    calendarA = await createCalendar(organizationA.id, "A");
    const calendarB = await createCalendar(organizationB.id, "B");

    await prisma.organizationMember.create({
      data: {
        organizationId: organizationA.id,
        role: OrganizationMemberRole.READ_ONLY,
        userId: readOnly.id
      }
    });

    [accountA, revenueAccountA] = await createAccounts(organizationA.id, "A");
    [accountB] = await createAccounts(organizationB.id, "B");

    // Keep the foreign calendar live so an accidental tenant bypass cannot hide behind
    // an invalid organization fixture.
    expect(calendarB.fiscalYearId).toEqual(expect.any(String));
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it("rejects unauthenticated requests and prevents organization A from reading B", async () => {
    await request(app.getHttpServer())
      .get("/journal-entries")
      .query({ organizationId: organizationA.id })
      .expect(401);

    await otherOwnerAgent
      .get("/journal-entries")
      .query({ organizationId: organizationA.id })
      .expect(404);
  });

  it("accepts a balanced draft and atomically posts it with an immutable audit trail", async () => {
    const created = await createDraft(ownerAgent, balancedLines());

    expect(created).toMatchObject({
      status: "DRAFT",
      totals: { credit: "100.00", debit: "100.00", difference: "0.00" },
      voucherNumber: null
    });

    const posted = await ownerAgent.post(`/journal-entries/${created.id}/post`).expect(201);

    expect(posted.body).toMatchObject({
      id: created.id,
      status: "POSTED",
      totals: { credit: "100.00", debit: "100.00", difference: "0.00" },
      voucherNumber: 1
    });
    await expect(
      prisma.auditEvent.findFirst({
        where: {
          action: AuditAction.POST,
          actorUserId: owner.id,
          entityId: created.id,
          entityType: AuditEntityType.JOURNAL_ENTRY,
          organizationId: organizationA.id
        }
      })
    ).resolves.not.toBeNull();
  });

  it("rejects an unbalanced draft without allocating a voucher number", async () => {
    const created = await createDraft(ownerAgent, [
      { accountId: accountA, credit: "0.00", debit: "100.00" },
      { accountId: revenueAccountA, credit: "99.99", debit: "0.00" }
    ]);

    await ownerAgent.post(`/journal-entries/${created.id}/post`).expect(400);

    const unchanged = await ownerAgent.get(`/journal-entries/${created.id}`).expect(200);
    expect(unchanged.body).toMatchObject({ status: "DRAFT", voucherNumber: null });
  });

  it("rejects posting into a locked accounting period", async () => {
    const created = await createDraft(ownerAgent, balancedLines(), "2026-02-15");

    expect(created.accountingPeriod.id).toBe(calendarA.lockedPeriodId);
    await ownerAgent.post(`/journal-entries/${created.id}/post`).expect(409);
  });

  it("rejects invalid and cross-organization account references", async () => {
    await ownerAgent
      .post("/journal-entries")
      .send({
        ...draftHeader(),
        lines: [
          { accountId: randomUUID(), credit: "0.00", debit: "100.00" },
          { accountId: revenueAccountA, credit: "100.00", debit: "0.00" }
        ]
      })
      .expect(404);

    await ownerAgent
      .post("/journal-entries")
      .send({
        ...draftHeader(),
        lines: [
          { accountId: accountB, credit: "0.00", debit: "100.00" },
          { accountId: revenueAccountA, credit: "100.00", debit: "0.00" }
        ]
      })
      .expect(404);
  });

  it("allocates distinct sequential numbers under concurrent posting", async () => {
    const [first, second] = await Promise.all([
      createDraft(ownerAgent, balancedLines()),
      createDraft(ownerAgent, balancedLines())
    ]);
    const [firstPost, secondPost] = await Promise.all([
      ownerAgent.post(`/journal-entries/${first.id}/post`),
      ownerAgent.post(`/journal-entries/${second.id}/post`)
    ]);

    expect(firstPost.status).toBe(201);
    expect(secondPost.status).toBe(201);
    const voucherNumbers = [firstPost.body.voucherNumber, secondPost.body.voucherNumber].sort(
      (left, right) => left - right
    );

    expect(voucherNumbers).toEqual([2, 3]);
    expect(new Set(voucherNumbers).size).toBe(2);
  });

  it("refuses arbitrary changes after posting and keeps read-only members from writing", async () => {
    const created = await createDraft(ownerAgent, balancedLines());
    await ownerAgent.post(`/journal-entries/${created.id}/post`).expect(201);

    await ownerAgent
      .patch(`/journal-entries/${created.id}`)
      .send({ description: "Tampered description" })
      .expect(409);
    await readOnlyAgent
      .post("/journal-entries")
      .send({ ...draftHeader(), lines: balancedLines() })
      .expect(403);

    await expect(
      prisma.journalEntry.update({
        data: { description: "Direct database tampering" },
        where: { id: created.id }
      })
    ).rejects.toThrow("Posted journal entries are immutable");
    await expect(prisma.journalEntry.delete({ where: { id: created.id } })).rejects.toThrow(
      "Posted journal entries are immutable"
    );

    const postedLine = await prisma.journalLine.findFirstOrThrow({
      where: { journalEntryId: created.id }
    });
    await expect(
      prisma.journalLine.update({
        data: { description: "Direct line tampering" },
        where: { id: postedLine.id }
      })
    ).rejects.toThrow("Lines on posted journal entries are immutable");
  });

  it("creates an auditable posted correction with exactly opposite lines and reciprocal links", async () => {
    const original = await createPosted(ownerAgent);

    const correctionResponse = await ownerAgent
      .post(`/journal-entries/${original.id}/reverse`)
      .send(reversePayload())
      .expect(201);
    const correction = correctionResponse.body as JournalEntryResponse;

    expect(correction).toMatchObject({
      reversesEntryId: original.id,
      source: "REVERSAL",
      status: "POSTED",
      transactionDate: "2026-01-15"
    });
    expect(correction.voucherNumber).toBe((original.voucherNumber ?? 0) + 1);
    expectOppositeLines(original, correction);

    const originalAfter = (await ownerAgent.get(`/journal-entries/${original.id}`).expect(200))
      .body as JournalEntryResponse;
    expect(originalAfter).toMatchObject({
      id: original.id,
      reversedByEntryId: correction.id,
      status: "POSTED"
    });
    expect(originalAfter.lines).toEqual(original.lines);

    await expect(
      prisma.auditEvent.findFirst({
        where: {
          action: AuditAction.CREATE,
          actorUserId: owner.id,
          entityId: correction.id,
          entityType: AuditEntityType.JOURNAL_ENTRY,
          organizationId: organizationA.id
        }
      })
    ).resolves.not.toBeNull();
    await expect(
      prisma.auditEvent.findFirst({
        where: {
          action: AuditAction.POST,
          actorUserId: owner.id,
          entityId: correction.id,
          entityType: AuditEntityType.JOURNAL_ENTRY,
          organizationId: organizationA.id
        }
      })
    ).resolves.not.toBeNull();
    await expect(
      prisma.auditEvent.findFirst({
        where: {
          action: AuditAction.REVERSE,
          actorUserId: owner.id,
          entityId: original.id,
          entityType: AuditEntityType.JOURNAL_ENTRY,
          organizationId: organizationA.id
        }
      })
    ).resolves.not.toBeNull();
  });

  it("rejects a correction into a locked target period without consuming a voucher number", async () => {
    const original = await createPosted(ownerAgent);
    const before = await prisma.voucherSeries.findUniqueOrThrow({
      select: { nextVoucherNumber: true },
      where: { id: calendarA.voucherSeriesId }
    });

    await ownerAgent
      .post(`/journal-entries/${original.id}/reverse`)
      .send(reversePayload("2026-02-15"))
      .expect(409);

    const [after, corrections, originalAfter] = await Promise.all([
      prisma.voucherSeries.findUniqueOrThrow({
        select: { nextVoucherNumber: true },
        where: { id: calendarA.voucherSeriesId }
      }),
      prisma.journalEntry.findMany({
        select: { id: true },
        where: {
          organizationId: organizationA.id,
          reversesEntryId: original.id
        }
      }),
      ownerAgent.get(`/journal-entries/${original.id}`).expect(200)
    ]);

    expect(after.nextVoucherNumber).toBe(before.nextVoucherNumber);
    expect(corrections).toEqual([]);
    expect(originalAfter.body).toMatchObject({
      id: original.id,
      reversedByEntryId: null,
      status: "POSTED"
    });
  });

  it("requires authentication and organization membership to create a correction", async () => {
    await request(app.getHttpServer())
      .post(`/journal-entries/${randomUUID()}/reverse`)
      .send(reversePayload())
      .expect(401);

    const original = await createPosted(ownerAgent);

    await otherOwnerAgent
      .post(`/journal-entries/${original.id}/reverse`)
      .send(reversePayload())
      .expect(404);
  });

  it("prevents read-only members from creating corrections", async () => {
    const original = await createPosted(ownerAgent);

    await readOnlyAgent
      .post(`/journal-entries/${original.id}/reverse`)
      .send(reversePayload())
      .expect(403);
  });

  it("allows exactly one correction when the same posted voucher is reversed concurrently", async () => {
    const original = await createPosted(ownerAgent);

    const responses = await Promise.all([
      ownerAgent.post(`/journal-entries/${original.id}/reverse`).send(reversePayload()),
      ownerAgent.post(`/journal-entries/${original.id}/reverse`).send(reversePayload())
    ]);
    const successfulResponses = responses.filter((response) => response.status === 201);
    const failedResponses = responses.filter((response) => response.status !== 201);

    expect(successfulResponses).toHaveLength(1);
    expect(failedResponses).toHaveLength(1);
    expect(failedResponses[0]?.status).toBe(409);

    const correction = successfulResponses[0]?.body as JournalEntryResponse;
    const corrections = await prisma.journalEntry.findMany({
      select: {
        id: true,
        reversesEntryId: true,
        source: true,
        status: true
      },
      where: {
        organizationId: organizationA.id,
        reversesEntryId: original.id
      }
    });

    expect(corrections).toEqual([
      expect.objectContaining({
        id: correction.id,
        reversesEntryId: original.id,
        source: "REVERSAL",
        status: "POSTED"
      })
    ]);
  });

  it("can correct a historical voucher into a later open period after its source period is locked", async () => {
    const original = await createPosted(ownerAgent);

    await prisma.accountingPeriod.create({
      data: {
        endDate: new Date("2026-03-31T00:00:00.000Z"),
        fiscalYearId: calendarA.fiscalYearId,
        organizationId: organizationA.id,
        periodNumber: 3,
        startDate: new Date("2026-03-01T00:00:00.000Z")
      }
    });
    await prisma.accountingPeriod.update({
      data: { lockedAt: new Date(), status: "LOCKED" },
      where: { id: calendarA.openPeriodId }
    });

    const correction = await ownerAgent
      .post(`/journal-entries/${original.id}/reverse`)
      .send(reversePayload("2026-03-15"))
      .expect(201);

    expect(correction.body).toMatchObject({
      reversesEntryId: original.id,
      status: "POSTED",
      transactionDate: "2026-03-15"
    });
  });

  function draftHeader(transactionDate = "2026-01-15") {
    return {
      description: "Integration journal entry",
      organizationId: organizationA.id,
      transactionDate,
      voucherSeriesId: calendarA.voucherSeriesId
    };
  }

  function balancedLines(): JournalLinePayload[] {
    return [
      { accountId: accountA, credit: "0.00", debit: "100.00", description: "Bank debit" },
      {
        accountId: revenueAccountA,
        credit: "100.00",
        debit: "0.00",
        description: "Revenue credit"
      }
    ];
  }

  function reversePayload(transactionDate = "2026-01-15") {
    return {
      description: "Integration correction",
      transactionDate,
      voucherSeriesId: calendarA.voucherSeriesId
    };
  }

  async function createPosted(
    agent: ReturnType<typeof request.agent>,
    lines: JournalLinePayload[] = balancedLines(),
    transactionDate = "2026-01-15"
  ): Promise<JournalEntryResponse> {
    const draft = await createDraft(agent, lines, transactionDate);
    const response = await agent.post(`/journal-entries/${draft.id}/post`).expect(201);

    return response.body as JournalEntryResponse;
  }

  function expectOppositeLines(original: JournalEntryResponse, correction: JournalEntryResponse) {
    expect(correction.lines).toHaveLength(original.lines.length);

    for (const originalLine of original.lines) {
      const correctionLine = correction.lines.find(
        (line) => line.lineNumber === originalLine.lineNumber
      );

      expect(correctionLine).toMatchObject({
        account: { id: originalLine.account.id },
        credit: originalLine.debit,
        debit: originalLine.credit,
        description: originalLine.description,
        lineNumber: originalLine.lineNumber
      });
    }
  }

  async function createDraft(
    agent: ReturnType<typeof request.agent>,
    lines: JournalLinePayload[],
    transactionDate = "2026-01-15"
  ) {
    const response = await agent
      .post("/journal-entries")
      .send({ ...draftHeader(transactionDate), lines })
      .expect(201);

    return response.body as JournalEntryResponse;
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
      name: `Journal fiscal year ${suffix} ${runSuffix}`,
      organizationId,
      startDate: new Date("2026-01-01T00:00:00.000Z")
    }
  });
  const [openPeriod, lockedPeriod] = await Promise.all([
    prisma.accountingPeriod.create({
      data: {
        endDate: new Date("2026-01-31T00:00:00.000Z"),
        fiscalYearId: fiscalYear.id,
        organizationId,
        periodNumber: 1,
        startDate: new Date("2026-01-01T00:00:00.000Z")
      }
    }),
    prisma.accountingPeriod.create({
      data: {
        endDate: new Date("2026-02-28T00:00:00.000Z"),
        fiscalYearId: fiscalYear.id,
        lockedAt: new Date(),
        organizationId,
        periodNumber: 2,
        startDate: new Date("2026-02-01T00:00:00.000Z"),
        status: "LOCKED"
      }
    })
  ]);
  const voucherSeries = await prisma.voucherSeries.create({
    data: {
      code: "A",
      fiscalYearId: fiscalYear.id,
      name: "Journal series A",
      organizationId
    }
  });

  return {
    fiscalYearId: fiscalYear.id,
    lockedPeriodId: lockedPeriod.id,
    openPeriodId: openPeriod.id,
    voucherSeriesId: voucherSeries.id
  };
}

async function createAccounts(organizationId: string, suffix: string): Promise<[string, string]> {
  const [bank, revenue] = await Promise.all([
    prisma.account.create({
      data: {
        accountNumber: `19${suffix === "A" ? "10" : "11"}`,
        name: `Bank ${suffix}`,
        normalBalance: BalanceSide.DEBIT,
        organizationId,
        type: AccountType.ASSET
      },
      select: { id: true }
    }),
    prisma.account.create({
      data: {
        accountNumber: `30${suffix === "A" ? "01" : "02"}`,
        name: `Revenue ${suffix}`,
        normalBalance: BalanceSide.CREDIT,
        organizationId,
        type: AccountType.REVENUE
      },
      select: { id: true }
    })
  ]);

  return [bank.id, revenue.id];
}
