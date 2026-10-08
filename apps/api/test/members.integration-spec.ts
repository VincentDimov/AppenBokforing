import { randomUUID } from "node:crypto";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { OrganizationMemberRole, prisma } from "@ledgerapp/db";
import { AppModule } from "../src/app.module";
import { configureHttpApp } from "../src/http/app-setup";
type Agent = ReturnType<typeof request.agent>;
describe("membership security and concurrency", () => {
  let app: INestApplication;
  let owner: Agent;
  let recipient: Agent;
  let stranger: Agent;
  let org: string;
  let email: string;
  let ownerId: string;
  let recipientId: string;
  beforeAll(async () => {
    app = (
      await Test.createTestingModule({ imports: [AppModule] }).compile()
    ).createNestApplication();
    configureHttpApp(app);
    await app.init();
    owner = request.agent(app.getHttpServer());
    recipient = request.agent(app.getHttpServer());
    stranger = request.agent(app.getHttpServer());
    for (const client of [owner, recipient, stranger]) {
      const address = `${randomUUID()}@example.test`;
      const user = (
        await client
          .post("/auth/register")
          .send({ email: address, displayName: "Medlem", password: "A-long-test-password-2026!" })
          .expect(201)
      ).body.user;
      if (client === owner) ownerId = user.id;
      if (client === recipient) {
        recipientId = user.id;
        email = address;
      }
    }
    org = (
      await owner
        .post("/onboarding")
        .send({
          setupKey: randomUUID(),
          name: "Members",
          startDate: "2026-01-01",
          endDate: "2026-12-31"
        })
        .expect(201)
    ).body.organization.id;
  });
  afterAll(async () => {
    await app?.close();
  });
  async function invite(address = email, role: OrganizationMemberRole = "READ_ONLY") {
    const result = (
      await owner
        .post(`/organizations/${org}/invitations`)
        .send({ email: address, role })
        .expect(201)
    ).body;
    return { ...result, token: new URL(result.developmentInvitationUrl).hash.slice(1) };
  }
  it("requires auth and tenant membership, hides authentication metadata", async () => {
    await request(app.getHttpServer()).get(`/organizations/${org}/members`).expect(401);
    await stranger.get(`/organizations/${org}/members`).expect(404);
    const result = await owner.get(`/organizations/${org}/members`).expect(200);
    expect(JSON.stringify(result.body)).not.toMatch(/password|tokenHash|refreshToken/);
  });
  it("hashes token, binds email, and accepts once under two concurrent requests", async () => {
    const result = await invite();
    const stored = await prisma.organizationInvitation.findUniqueOrThrow({
      where: { id: result.invitation.id }
    });
    expect(stored.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.tokenHash).not.toBe(result.token);
    await stranger.post("/invitations/accept").send({ token: result.token }).expect(403);
    const accepted = await Promise.all([
      recipient.post("/invitations/accept").send({ token: result.token }),
      recipient.post("/invitations/accept").send({ token: result.token })
    ]);
    expect(accepted.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(
      await prisma.organizationMember.count({ where: { organizationId: org, userId: recipientId } })
    ).toBe(1);
  });
  it("READ_ONLY cannot change roles or invite and removal denies all future tenant access without deleting user", async () => {
    const member = await prisma.organizationMember.findUniqueOrThrow({
      where: { organizationId_userId: { organizationId: org, userId: recipientId } }
    });
    await recipient
      .patch(`/organizations/${org}/members/${member.id}`)
      .send({ role: "ADMIN" })
      .expect(403);
    await recipient
      .post(`/organizations/${org}/invitations`)
      .send({ email: "someone@example.test", role: "ADMIN" })
      .expect(403);
    await owner.delete(`/organizations/${org}/members/${member.id}`).expect(200);
    await recipient.get(`/organizations/${org}`).expect(404);
    await recipient.get(`/accounts?organizationId=${org}`).expect(404);
    await recipient.get(`/reports/trial-balance?organizationId=${org}`).expect(404);
    expect(await prisma.user.findUnique({ where: { id: recipientId } })).not.toBeNull();
  });
  it("resend invalidates old token and same-recipient races leave one pending invitation", async () => {
    const old = await invite();
    const next = await invite();
    expect(old.token).not.toBe(next.token);
    await recipient.post("/invitations/accept").send({ token: old.token }).expect(409);
    const results = await Promise.all([invite(), invite()]);
    expect(results[0].token).not.toBe(results[1].token);
    expect(
      await prisma.organizationInvitation.count({
        where: { organizationId: org, email, acceptedAt: null, revokedAt: null }
      })
    ).toBe(1);
  });
  it("accept vs revoke cannot create membership from a revoked token", async () => {
    const invitation = await invite();
    const results = await Promise.all([
      recipient.post("/invitations/accept").send({ token: invitation.token }),
      owner.delete(`/organizations/${org}/invitations/${invitation.invitation.id}`)
    ]);
    expect([
      [201, 409],
      [409, 200]
    ]).toContainEqual(results.map((value) => value.status));
    const stored = await prisma.organizationInvitation.findUniqueOrThrow({
      where: { id: invitation.invitation.id }
    });
    expect(Boolean(stored.acceptedAt)).not.toBe(Boolean(stored.revokedAt));
  });
  it("expired token and last-owner removal are rejected", async () => {
    const expired = await invite(`${randomUUID()}@example.test`);
    await prisma.organizationInvitation.update({
      where: { id: expired.invitation.id },
      data: { expiresAt: new Date(0) }
    });
    await recipient.post("/invitations/accept").send({ token: expired.token }).expect(409);
    const member = await prisma.organizationMember.findUniqueOrThrow({
      where: { organizationId_userId: { organizationId: org, userId: ownerId } }
    });
    const result = await owner.delete(`/organizations/${org}/members/${member.id}`).expect(409);
    expect(result.body.code).toBe("LAST_OWNER_REQUIRED");
  });
  it("database deferred invariant rejects direct last-owner demotion", async () => {
    await expect(
      prisma.organizationMember.update({
        where: { organizationId_userId: { organizationId: org, userId: ownerId } },
        data: { role: "ADMIN" }
      })
    ).rejects.toThrow();
    expect(
      await prisma.organizationMember.count({
        where: { organizationId: org, role: "OWNER", removedAt: null }
      })
    ).toBe(1);
  });
  it("concurrent owner demotions retain one OWNER", async () => {
    await prisma.organizationMember.upsert({
      where: { organizationId_userId: { organizationId: org, userId: recipientId } },
      create: { organizationId: org, userId: recipientId, role: "OWNER" },
      update: { role: "OWNER", removedAt: null }
    });
    const members = await prisma.organizationMember.findMany({
      where: { organizationId: org, role: "OWNER" }
    });
    const results = await Promise.all(
      members.map((member) =>
        owner.patch(`/organizations/${org}/members/${member.id}`).send({ role: "ADMIN" })
      )
    );
    expect(results.filter((result) => result.status === 200)).toHaveLength(1);
    expect(
      await prisma.organizationMember.count({
        where: { organizationId: org, role: "OWNER", removedAt: null }
      })
    ).toBe(1);
  });
  it("explicit ownership transfer is atomic and ADMIN cannot manage OWNER", async () => {
    const company = (
      await owner
        .post("/onboarding")
        .send({
          setupKey: randomUUID(),
          name: "Ownership transfer",
          startDate: "2026-01-01",
          endDate: "2026-12-31"
        })
        .expect(201)
    ).body.organization.id;
    const target = await prisma.organizationMember.create({
      data: { organizationId: company, userId: recipientId, role: "READ_ONLY" }
    });
    await recipient
      .post(`/organizations/${company}/transfer-ownership`)
      .send({ memberId: target.id })
      .expect(403);
    await owner
      .patch(`/organizations/${company}/members/${target.id}`)
      .send({ role: "OWNER" })
      .expect(403);
    await owner
      .post(`/organizations/${company}/transfer-ownership`)
      .send({ memberId: target.id })
      .expect(201);
    expect(
      (await prisma.organizationMember.findUniqueOrThrow({ where: { id: target.id } })).role
    ).toBe("OWNER");
    expect(
      (
        await prisma.organizationMember.findUniqueOrThrow({
          where: { organizationId_userId: { organizationId: company, userId: ownerId } }
        })
      ).role
    ).toBe("ADMIN");
    await owner
      .patch(`/organizations/${company}/members/${target.id}`)
      .send({ role: "MEMBER" })
      .expect(403);
    await owner.delete(`/organizations/${company}/members/${target.id}`).expect(403);
    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: {
        organizationId: company,
        entityId: target.id,
        metadata: { path: ["operation"], equals: "OWNERSHIP_TRANSFERRED" }
      }
    });
    expect(audit.actorUserId).toBe(ownerId);
  });
});
