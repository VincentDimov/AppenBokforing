import { randomUUID } from "node:crypto";

import { AppModule } from "../src/app.module";
import { configureHttpApp } from "../src/http/app-setup";
import { OrganizationMemberRole, prisma, SessionRevocationReason } from "@ledgerapp/db";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import type { Response } from "supertest";

interface TestUser {
  id: string;
}

interface TestOrganization {
  id: string;
}

const runId = randomUUID();
const password = "A-long-integration-test-password-2026!";

jest.setTimeout(30_000);

describe("authentication and organization authorization", () => {
  let app: INestApplication;
  let ownerAgent: ReturnType<typeof request.agent>;
  let otherOwnerAgent: ReturnType<typeof request.agent>;
  let readOnlyAgent: ReturnType<typeof request.agent>;
  let owner: TestUser;
  let readOnlyUser: TestUser;
  let organizationA: TestOrganization;
  let organizationB: TestOrganization;

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

    owner = await register(ownerAgent, "owner");
    await register(otherOwnerAgent, "other-owner");
    readOnlyUser = await register(readOnlyAgent, "read-only");

    organizationA = await createOrganization(ownerAgent, "owner-org");
    organizationB = await createOrganization(otherOwnerAgent, "other-owner-org");

    await prisma.organizationMember.create({
      data: {
        organizationId: organizationA.id,
        role: OrganizationMemberRole.READ_ONLY,
        userId: readOnlyUser.id
      }
    });
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it("rejects unauthenticated requests", async () => {
    await request(app.getHttpServer()).get("/auth/me").expect(401);
    await request(app.getHttpServer()).get("/organizations").expect(401);
  });

  it("does not expose an organization to a user who is not a member", async () => {
    await ownerAgent.get(`/organizations/${organizationB.id}`).expect(404);
  });

  it("allows a read-only member to view but not update an organization", async () => {
    await readOnlyAgent.get(`/organizations/${organizationA.id}`).expect(200);
    await readOnlyAgent
      .patch(`/organizations/${organizationA.id}`)
      .send({ name: "This update must be denied" })
      .expect(403);
  });

  it("allows the owner to manage organization settings and records an audit event", async () => {
    const updatedName = `Owner managed organization ${runId.slice(0, 8)}`;
    const response = await ownerAgent
      .patch(`/organizations/${organizationA.id}`)
      .send({ name: updatedName })
      .expect(200);

    expect(response.body).toMatchObject({
      id: organizationA.id,
      name: updatedName
    });

    await expect(
      prisma.auditEvent.findFirst({
        where: {
          action: "UPDATE",
          actorUserId: owner.id,
          entityId: organizationA.id,
          entityType: "ORGANIZATION",
          organizationId: organizationA.id
        }
      })
    ).resolves.not.toBeNull();
  });

  it("rotates the persisted refresh session", async () => {
    const sessionBeforeRotation = await prisma.session.findFirst({
      where: {
        revokedAt: null,
        userId: owner.id
      },
      orderBy: { createdAt: "desc" }
    });

    if (!sessionBeforeRotation) {
      throw new Error("Expected the registered owner to have an active session.");
    }

    const response = await ownerAgent.post("/auth/refresh").expect(200);

    expect(response.headers["set-cookie"]).toEqual(
      expect.arrayContaining([expect.stringContaining("ledgerapp_refresh=")])
    );

    const rotatedSession = await prisma.session.findUnique({
      where: { id: sessionBeforeRotation.id }
    });

    if (!rotatedSession?.replacedById) {
      throw new Error("Expected refresh rotation to link the replaced session.");
    }

    const replacementSession = await prisma.session.findUnique({
      where: { id: rotatedSession.replacedById }
    });

    expect(rotatedSession).toMatchObject({
      revocationReason: SessionRevocationReason.ROTATED,
      revokedAt: expect.any(Date)
    });
    expect(replacementSession).toMatchObject({
      familyId: sessionBeforeRotation.familyId,
      revokedAt: null,
      userId: owner.id
    });

    await ownerAgent.get("/auth/me").expect(200);
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
  const response: Response = await agent
    .post("/organizations")
    .send({
      name: `Integration ${label}`,
      slug: `${label}-${runId.slice(0, 12)}`
    })
    .expect(201);

  return response.body as TestOrganization;
}
