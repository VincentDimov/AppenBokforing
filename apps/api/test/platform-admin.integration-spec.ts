import { randomUUID, randomBytes } from "node:crypto";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import request from "supertest";
import { prisma, type PlatformAdminRole } from "@ledgerapp/db";
import { AppModule } from "../src/app.module";
import { configureHttpApp } from "../src/http/app-setup";
import { bootstrapPlatformAdmin } from "../src/platform-admin/bootstrap";
import { AuthSettingsService } from "../src/auth/auth-settings.service";
import {
  PlatformAdminSecurityService,
  type AdminContext
} from "../src/platform-admin/platform-admin-security.service";
import { hashPassword } from "../src/platform-admin/password-policy";
import { encryptMfaSecret } from "../src/platform-admin/mfa-crypto";

type Agent = ReturnType<typeof request.agent>;
const initial = "Synthetic-bootstrap-fixture-2026!",
  updated = "Changed-bootstrap-fixture-2026!",
  ordinaryPassword = "Ordinary-fixture-password-2026!";
describe("FAS 36 real PostgreSQL platform administration", () => {
  let app: INestApplication,
    admin: Agent,
    owner: Agent,
    regular: Agent,
    viewer: Agent,
    support: Agent,
    platform: Agent;
  let id: string,
    ownerId: string,
    targetId: string,
    org: string,
    targetEmail: string,
    orgName: string;
  let security: PlatformAdminSecurityService, ctx: AdminContext, bootstrapStatus: string;
  const policy = new AuthSettingsService(new ConfigService(process.env));
  const suffix = randomUUID();
  const key = randomBytes(32);
  const bootstrapEmail = "admin@admin.com";
  const email = `master-fas36-${suffix}@example.test`;
  beforeAll(async () => {
    const marker = await prisma.platformAdminBootstrap.findUnique({ where: { id: 1 } });
    if (marker) {
      const existing = await prisma.user.findUniqueOrThrow({ where: { id: marker.userId } });
      if (existing.email !== bootstrapEmail)
        throw new Error("Bootstrap marker belongs to another test fixture; use a fresh test DB.");
    }
    const env = {
      MASTER_ADMIN_BOOTSTRAP_ENABLED: "true",
      MASTER_ADMIN_BOOTSTRAP_EMAIL: bootstrapEmail,
      MASTER_ADMIN_BOOTSTRAP_PASSWORD: initial
    };
    bootstrapStatus = (await bootstrapPlatformAdmin(prisma, env, true, policy)).status;
    // Fresh per-run security principal. Do not erase immutable audit evidence
    // or reset the persisted attempt limit to make repeated tests pass.
    const hash = await hashPassword(initial, policy);
    id = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(36036,1)`;
      const user = await tx.user.create({
        data: {
          email,
          displayName: "Master Admin test fixture",
          passwordHash: hash,
          mustChangePassword: true
        }
      });
      await tx.platformAdministrator.create({
        data: { userId: user.id, role: "SUPER_ADMIN", mustChangePassword: true }
      });
      await tx.platformAdministrator.updateMany({
        where: {
          role: "SUPER_ADMIN",
          userId: { not: user.id },
          user: {
            OR: [
              { email: bootstrapEmail },
              { email: { startsWith: "master-fas36-", endsWith: "@example.test" } }
            ]
          }
        },
        data: { isActive: false, revokedAt: new Date() }
      });
      return user.id;
    });
    app = (
      await Test.createTestingModule({ imports: [AppModule] }).compile()
    ).createNestApplication({ logger: false });
    configureHttpApp(app);
    await app.init();
    admin = request.agent(app.getHttpServer());
    owner = request.agent(app.getHttpServer());
    regular = request.agent(app.getHttpServer());
    ownerId = (
      await owner
        .post("/auth/register")
        .send({
          email: `owner-${suffix}@example.test`,
          displayName: "Owner fixture",
          password: ordinaryPassword
        })
        .expect(201)
    ).body.user.id;
    targetEmail = `target-${suffix}@example.test`;
    targetId = (
      await regular
        .post("/auth/register")
        .send({ email: targetEmail, displayName: "Target fixture", password: ordinaryPassword })
        .expect(201)
    ).body.user.id;
    orgName = `Platform fixture ${suffix}`;
    org = (
      await owner
        .post("/onboarding")
        .send({
          setupKey: randomUUID(),
          name: orgName,
          startDate: "2026-01-01",
          endDate: "2026-12-31"
        })
        .expect(201)
    ).body.organization.id;
    await prisma.organizationMember.create({
      data: { organizationId: org, userId: targetId, role: "ADMIN" }
    });
    await admin.post("/auth/login").send({ email, password: initial }).expect(200);
    security = app.get(PlatformAdminSecurityService);
  }, 45000);
  afterAll(async () => {
    await app?.close();
  });
  async function loginFixture(email: string, password: string): Promise<Agent> {
    // Fixture setup uses the real login service/session/cookies; HTTP login rate
    // limiting remains unchanged and is tested by the authentication suite.
    const auth = app.get((await import("../src/auth/auth.service")).AuthService);
    const login = await auth.login({ email, password }, {});
    const cookies: string[] = [];
    auth.setAuthCookies(
      {
        cookie: (name: string, value: string) => {
          cookies.push(`${name}=${value}`);
        },
        clearCookie: () => {}
      } as unknown as Parameters<typeof auth.setAuthCookies>[0],
      login.tokens
    );
    const agent = request.agent(app.getHttpServer());
    agent.set("Cookie", cookies.join("; "));
    return agent;
  }
  async function secureFixture(role: PlatformAdminRole): Promise<Agent> {
    const email = `${role.toLowerCase()}-${suffix}@example.test`;
    const user = await prisma.user.create({
      data: { email, displayName: role, passwordHash: await hashPassword(ordinaryPassword, policy) }
    });
    await prisma.platformAdministrator.create({
      data: { userId: user.id, role, mustChangePassword: false }
    });
    return loginFixture(email, ordinaryPassword);
  }
  it("bootstrap is explicit, never creates memberships and never resets on rerun", async () => {
    expect(["CREATED", "ALREADY_COMPLETED"]).toContain(bootstrapStatus);
    expect(await prisma.organizationMember.count({ where: { userId: id } })).toBe(0);
    const before = await prisma.user.findUniqueOrThrow({ where: { email: bootstrapEmail } });
    await expect(
      bootstrapPlatformAdmin(prisma, { MASTER_ADMIN_BOOTSTRAP_ENABLED: "false" }, true, policy)
    ).rejects.toThrow();
    await expect(
      bootstrapPlatformAdmin(prisma, { MASTER_ADMIN_BOOTSTRAP_ENABLED: "true" }, false, policy)
    ).rejects.toThrow();
    expect(
      await bootstrapPlatformAdmin(
        prisma,
        {
          MASTER_ADMIN_BOOTSTRAP_ENABLED: "true",
          MASTER_ADMIN_BOOTSTRAP_EMAIL: bootstrapEmail,
          MASTER_ADMIN_BOOTSTRAP_PASSWORD: "Different-fixture-password-2026!"
        },
        true,
        policy
      )
    ).toEqual({ status: "ALREADY_COMPLETED" });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: before.id } })).passwordHash).toBe(
      before.passwordHash
    );
    expect(before.passwordHash).toMatch(/^\$argon2id\$/);
  });
  it("requires first password change before every tenant/admin protected endpoint", async () => {
    const me = (await admin.get("/auth/me").expect(200)).body.user;
    expect(me.mustChangePassword).toBe(true);
    expect(me.canAccessPlatformAdmin).toBe(true);
    await admin.get("/platform-admin/users").expect(403);
    await admin.get("/organizations").expect(403);
    await admin
      .post("/auth/password")
      .send({ currentPassword: initial, newPassword: updated })
      .expect(200);
    await admin.get("/auth/me").expect(401);
    await admin.post("/auth/login").send({ email, password: updated }).expect(200);
  });
  it("admits password-ready administrators without MFA and retires all MFA routes", async () => {
    const session = await prisma.session.findFirstOrThrow({
      where: { userId: id, revokedAt: null },
      orderBy: { createdAt: "desc" }
    });
    ctx = {
      user: { id, email, displayName: "Master Admin", sessionId: session.id },
      requestId: randomUUID()
    };
    expect(session.adminMfaVerifiedAt).toBeNull();
    expect(await prisma.platformAdminMfaCredential.count({ where: { userId: id } })).toBe(0);
    expect(
      (await prisma.platformAdministrator.findUniqueOrThrow({ where: { userId: id } })).mfaRequired
    ).toBe(false);
    const me = (await admin.get("/auth/me").expect(200)).body.user;
    expect(me.requiresAdminSecuritySetup).toBe(false);
    expect((await admin.get("/platform-admin/security-setup/status").expect(200)).body).toEqual({
      role: "SUPER_ADMIN",
      mustChangePassword: false,
      notificationDeliveryConfigured: false
    });
    await admin.get("/platform-admin/users").expect(200);
    for (const path of ["enroll", "verify", "recover"]) {
      await admin.post(`/platform-admin/security-setup/${path}`).send({}).expect(404);
    }
    // Existing encrypted data is retained, but never consulted for authorization.
    const legacy = await prisma.platformAdminMfaCredential.create({
      data: {
        userId: id,
        keyId: "legacy-test",
        encryptedSecret: encryptMfaSecret("LEGACY", key, id, "legacy-test"),
        pendingExpiresAt: new Date(0)
      }
    });
    await admin.get("/platform-admin/users").expect(200);
    expect(await prisma.platformAdminMfaCredential.findUnique({ where: { userId: id } })).toEqual(
      legacy
    );
  });
  it("authorized dashboard and monitoring use real bounded PostgreSQL results", async () => {
    const dashboard = (await admin.get("/platform-admin/dashboard").expect(200)).body;
    expect(dashboard.kpis.users).toBe(await prisma.user.count());
    expect(dashboard.kpis.organizations).toBe(await prisma.organization.count());
    expect(dashboard.registrations.length).toBeGreaterThan(0);
    expect(dashboard.registrations.length).toBeLessThanOrEqual(367);
    for (const day of dashboard.registrations) {
      expect(day.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isInteger(day.users)).toBe(true);
      expect(Number.isInteger(day.organizations)).toBe(true);
    }
    const system = (await admin.get("/platform-admin/system").expect(200)).body;
    expect(system.databaseReady).toBe(true);
    expect(system.migrationCompatible).toBe(true);
    for (const path of ["security", "usage", "jobs"]) {
      const response = (await admin.get(`/platform-admin/${path}`).expect(200)).body;
      expect(JSON.stringify(response)).not.toMatch(
        /passwordHash|encryptedSecret|codeHash|refreshToken|storageKey|sourceText/
      );
    }
    await admin.get("/platform-admin/dashboard?fromDate=2020-01-01&toDate=2026-01-01").expect(400);
  });
  it.each([
    "dashboard",
    "users",
    "organizations",
    "administrators",
    "invitations",
    "sessions",
    "audit",
    "security",
    "usage",
    "system",
    "jobs"
  ])("rejects unauthenticated and company ADMIN from %s", async (path) => {
    await request(app.getHttpServer()).get(`/platform-admin/${path}`).expect(401);
    await regular.get(`/platform-admin/${path}`).expect(403);
  });
  it("viewer and support are read-only, PLATFORM_ADMIN cannot grant global roles", async () => {
    viewer = await secureFixture("PLATFORM_VIEWER");
    support = await secureFixture("SUPPORT_ADMIN");
    platform = await secureFixture("PLATFORM_ADMIN");
    for (const agent of [viewer, support]) {
      await agent.get("/platform-admin/users").expect(200);
      await agent
        .patch(`/platform-admin/users/${targetId}`)
        .send({ displayName: "Forbidden" })
        .expect(403);
    }
    await platform
      .post("/platform-admin/administrators")
      .send({ userId: targetId, role: "SUPER_ADMIN", isActive: true, confirmation: targetEmail })
      .expect(403);
  });
  it("global grants never confer journal, report or organization tenant access", async () => {
    await admin.get(`/organizations/${org}`).expect(404);
    await admin.get(`/accounts?organizationId=${org}`).expect(404);
    await admin.get(`/journal-entries?organizationId=${org}`).expect(404);
    await admin.get(`/reports/trial-balance?organizationId=${org}`).expect(404);
    const metadata = (await admin.get(`/platform-admin/organizations/${org}`).expect(200)).body;
    expect(metadata.id).toBe(org);
    expect(JSON.stringify(metadata)).not.toMatch(/debitAmount|creditAmount|storageKey|sourceText/);
    expect(
      await prisma.organizationMember.count({ where: { organizationId: org, userId: id } })
    ).toBe(0);
  });
  it("refresh rotates sessions without copying legacy MFA approval", async () => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: `platform_admin-${suffix}@example.test` }
    });
    const before = await prisma.session.findFirstOrThrow({
      where: { userId: user.id, revokedAt: null }
    });
    await prisma.session.update({
      where: { id: before.id },
      data: { adminMfaVerifiedAt: new Date() }
    });
    await platform.post("/auth/refresh").expect(200);
    const after = await prisma.session.findFirstOrThrow({
      where: { userId: user.id, revokedAt: null }
    });
    expect(after.id).not.toBe(before.id);
    expect(after.adminMfaVerifiedAt).toBeNull();
    await platform.get("/platform-admin/users").expect(200);
  });
  it("server-side Swedish A–Ö/Ö–A order is stable and safely paginated", async () => {
    const prefix = `sv-${suffix} `;
    for (const displayName of ["Östen", "Äsa", "Åke", "Zara", "Anna"]) {
      await prisma.user.create({
        data: { displayName: prefix + displayName, email: `sort-${randomUUID()}@example.test` }
      });
    }
    const asc = (
      await admin
        .get("/platform-admin/users")
        .query({ search: prefix, sort: "name_asc", pageSize: 10 })
        .expect(200)
    ).body;
    expect(
      asc.items.map((row: { displayName: string }) => row.displayName.slice(prefix.length))
    ).toEqual(["Anna", "Zara", "Åke", "Äsa", "Östen"]);
    const desc = (
      await admin
        .get("/platform-admin/users")
        .query({ search: prefix, sort: "name_desc", pageSize: 10 })
        .expect(200)
    ).body;
    expect(desc.items.map((row: { id: string }) => row.id)).toEqual(
      [...asc.items].reverse().map((row: { id: string }) => row.id)
    );
    const orgPrefix = `svorg-${suffix} `;
    for (const name of ["Öbolag", "Äbolag", "Åbolag", "Zbolag", "Abolag"])
      await prisma.organization.create({ data: { name: orgPrefix + name, slug: randomUUID() } });
    const orgs = (
      await admin
        .get("/platform-admin/organizations")
        .query({ search: orgPrefix, sort: "name_asc", pageSize: 10 })
        .expect(200)
    ).body;
    expect(orgs.items.map((row: { name: string }) => row.name.slice(orgPrefix.length))).toEqual([
      "Abolag",
      "Zbolag",
      "Åbolag",
      "Äbolag",
      "Öbolag"
    ]);
  });
  it("validates identifiers, filtering, wildcard escaping and strict write DTOs", async () => {
    const result = (
      await admin
        .get("/platform-admin/users")
        .query({ search: targetEmail, hasCompany: "yes", organizationId: org, role: "ADMIN" })
        .expect(200)
    ).body;
    expect(result.items.map((row: { id: string }) => row.id)).toEqual([targetId]);
    await admin
      .get("/platform-admin/users")
      .query({ sort: "name;DROP", pageSize: 9999 })
      .expect(400);
    await admin.get("/platform-admin/users").query({ role: "OWNER" }).expect(400);
    await admin.get("/platform-admin/users/not-uuid").expect(400);
    await admin
      .patch(`/platform-admin/users/${targetId}`)
      .send({ platformRole: "SUPER_ADMIN", passwordHash: "bad" })
      .expect(400);
    expect(
      (await admin.get("/platform-admin/users").query({ search: "%_not-a-wildcard" }).expect(200))
        .body.total
    ).toBe(0);
  });
  it("safely persists user edits without credential or MFA secret disclosure", async () => {
    await admin
      .patch(`/platform-admin/users/${targetId}`)
      .send({ displayName: "Edited target", adminNotes: "Internal only" })
      .expect(200);
    const result = (await admin.get(`/platform-admin/users/${targetId}`).expect(200)).body;
    expect(result).toMatchObject({ displayName: "Edited target", adminNotes: "Internal only" });
    expect(JSON.stringify(result)).not.toMatch(
      /passwordHash|codeHash|encryptedSecret|refreshTokenHash/
    );
    await admin
      .patch(`/platform-admin/users/${targetId}`)
      .send({ email: "unverified@example.test" })
      .expect(503);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: targetId } })).email).toBe(
      targetEmail
    );
  });
  it("retains typed confirmation while allowing writes without MFA step-up", async () => {
    await admin
      .post(`/platform-admin/users/${targetId}/suspend`)
      .send({ confirmation: "wrong" })
      .expect(400);
    await prisma.session.update({
      where: { id: ctx.user.sessionId },
      data: { adminMfaVerifiedAt: new Date(0) }
    });
    await admin.get("/platform-admin/users").expect(200);
    await admin
      .patch(`/platform-admin/users/${targetId}`)
      .send({ displayName: "No MFA needed" })
      .expect(200);
  });
  it("does not fake reset email and gives temporary credentials mandatory change + revoked sessions", async () => {
    await admin
      .post(`/platform-admin/users/${targetId}/password-reset`)
      .send({ confirmation: targetEmail })
      .expect(503);
    const result = (
      await admin
        .post(`/platform-admin/users/${targetId}/temporary-password`)
        .send({ confirmation: targetEmail, password: "Temporary-fixture-password-2026!" })
        .expect(201)
    ).body;
    expect(result).toEqual({ mustChangePassword: true, notificationSent: false });
    await regular.get("/auth/me").expect(401);
    await regular.post("/auth/refresh").expect(401);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: targetId } })).passwordHash).toMatch(
      /^\$argon2id\$/
    );
    await admin
      .post(`/platform-admin/users/${id}/temporary-password`)
      .send({ confirmation: email, password: "Other-fixture-password-2026!" })
      .expect(409);
  });
  it("suspension revokes sessions and prevents authentication or session creation", async () => {
    await admin
      .post(`/platform-admin/users/${targetId}/suspend`)
      .send({ confirmation: targetEmail })
      .expect(201);
    await regular
      .post("/auth/login")
      .send({ email: targetEmail, password: "Temporary-fixture-password-2026!" })
      .expect(401);
    expect(await prisma.session.count({ where: { userId: targetId, revokedAt: null } })).toBe(0);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: targetId } })).isActive).toBe(false);
    await admin
      .post(`/platform-admin/users/${targetId}/reactivate`)
      .send({ confirmation: targetEmail })
      .expect(201);
  });
  it("last active SUPER_ADMIN cannot be suspended or revoked, even by direct SQL", async () => {
    await admin
      .post(`/platform-admin/users/${id}/suspend`)
      .send({ confirmation: email })
      .expect(409);
    await admin
      .post("/platform-admin/administrators")
      .send({ userId: id, role: "PLATFORM_VIEWER", isActive: true, confirmation: email })
      .expect(409);
    await expect(
      prisma.platformAdministrator.update({ where: { userId: id }, data: { isActive: false } })
    ).rejects.toThrow();
    expect(
      (await prisma.platformAdministrator.findUniqueOrThrow({ where: { userId: id } })).role
    ).toBe("SUPER_ADMIN");
  });
  it("ordinary mandatory password change works locally without granting platform access", async () => {
    await regular
      .post("/auth/login")
      .send({ email: targetEmail, password: "Temporary-fixture-password-2026!" })
      .expect(200);
    await regular.get(`/organizations/${org}`).expect(403);
    await regular
      .post("/auth/password")
      .send({
        currentPassword: "Temporary-fixture-password-2026!",
        newPassword: "Ordinary-changed-fixture-2026!"
      })
      .expect(200);
    await regular.get("/auth/me").expect(401);
    await regular
      .post("/auth/login")
      .send({ email: targetEmail, password: "Ordinary-changed-fixture-2026!" })
      .expect(200);
    expect((await regular.get("/auth/me").expect(200)).body.user.canAccessPlatformAdmin).toBe(
      false
    );
    await regular.get(`/organizations/${org}`).expect(200);
    await regular.get("/platform-admin/users").expect(403);
  });
  it("company deactivation blocks tenant access and SQL writes while preserving rows", async () => {
    const before = await prisma.account.count({ where: { organizationId: org } });
    await admin
      .post(`/platform-admin/organizations/${org}/deactivate`)
      .send({ confirmation: orgName })
      .expect(201);
    await owner.get(`/organizations/${org}`).expect(404);
    await owner.get(`/accounts?organizationId=${org}`).expect(404);
    await owner.get(`/fiscal-years?organizationId=${org}`).expect(404);
    await expect(
      prisma.account.create({
        data: {
          organizationId: org,
          accountNumber: "1999",
          name: "Forbidden",
          type: "ASSET",
          normalBalance: "DEBIT"
        }
      })
    ).rejects.toThrow();
    expect(await prisma.account.count({ where: { organizationId: org } })).toBe(before);
    await admin
      .post(`/platform-admin/organizations/${org}/reactivate`)
      .send({ confirmation: orgName })
      .expect(201);
    await owner.get(`/organizations/${org}`).expect(200);
  });
  it("changes memberships safely, preserves last owner and explicit transfer", async () => {
    const member = await prisma.organizationMember.findUniqueOrThrow({
      where: { organizationId_userId: { organizationId: org, userId: targetId } }
    });
    const ownerMember = await prisma.organizationMember.findUniqueOrThrow({
      where: { organizationId_userId: { organizationId: org, userId: ownerId } }
    });
    await admin
      .patch(`/platform-admin/users/${targetId}/memberships/${member.id}`)
      .send({ role: "READ_ONLY", confirmation: targetEmail })
      .expect(200);
    const ownerEmail = (await prisma.user.findUniqueOrThrow({ where: { id: ownerId } })).email;
    await admin
      .delete(`/platform-admin/users/${ownerId}/memberships/${ownerMember.id}`)
      .send({ confirmation: ownerEmail })
      .expect(409);
    await admin
      .post(`/platform-admin/organizations/${org}/transfer-owner`)
      .send({ fromUserId: ownerId, toUserId: targetId, confirmation: orgName })
      .expect(201);
    expect(
      (await prisma.organizationMember.findUniqueOrThrow({ where: { id: member.id } })).role
    ).toBe("OWNER");
  });
  it("admin evidence and bootstrap markers are immutable and cannot be updated through APIs", async () => {
    const event = await prisma.platformAdminAuditEvent.findFirstOrThrow({
      where: { actorUserId: id }
    });
    await expect(
      prisma.platformAdminAuditEvent.update({ where: { id: event.id }, data: { action: "tamper" } })
    ).rejects.toThrow();
    await expect(
      prisma.platformAdminAuditEvent.delete({ where: { id: event.id } })
    ).rejects.toThrow();
    await expect(prisma.$executeRaw`TRUNCATE platform_admin_audit_events`).rejects.toThrow();
    await expect(prisma.platformAdminBootstrap.delete({ where: { id: 1 } })).rejects.toThrow();
    await admin.patch(`/platform-admin/audit/${event.id}`).send({ action: "tamper" }).expect(404);
    const audit = (await admin.get("/platform-admin/audit").query({ actorUserId: id }).expect(200))
      .body;
    expect(audit.total).toBeGreaterThan(0);
    expect(JSON.stringify(audit)).not.toMatch(
      /encryptedSecret|passwordHash|refreshTokenHash|codeHash/
    );
  });
  it("fresh grants are checked on each request and role changes invalidate all sessions", async () => {
    const viewerRow = await prisma.user.findUniqueOrThrow({
      where: { email: `platform_viewer-${suffix}@example.test` }
    });
    await admin
      .post("/platform-admin/administrators")
      .send({
        userId: viewerRow.id,
        role: "PLATFORM_VIEWER",
        isActive: false,
        confirmation: viewerRow.email
      })
      .expect(201);
    await viewer.get("/platform-admin/users").expect(401);
    await viewer.post("/auth/refresh").expect(401);
  });
  it("rejects missing, expired and foreign sessions even without MFA", async () => {
    await expect(
      security.assertAccess({ ...ctx, user: { ...ctx.user, sessionId: randomUUID() } }, "READ")
    ).rejects.toThrow("Sessionen");
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: `support_admin-${suffix}@example.test` }
    });
    const foreign = await prisma.session.findFirstOrThrow({
      where: { userId: user.id, revokedAt: null }
    });
    await expect(
      security.assertAccess({ ...ctx, user: { ...ctx.user, sessionId: foreign.id } }, "READ")
    ).rejects.toThrow("Sessionen");
    await prisma.session.update({
      where: { id: ctx.user.sessionId },
      data: { expiresAt: new Date(0), absoluteExpiresAt: new Date(0) }
    });
    await expect(security.assertAccess(ctx, "WRITE")).rejects.toThrow("Sessionen");
    await admin.get("/platform-admin/users").expect(401);
    admin = await loginFixture(email, updated);
    const session = await prisma.session.findFirstOrThrow({
      where: { userId: id, revokedAt: null, absoluteExpiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" }
    });
    ctx.user.sessionId = session.id;
  });
  it("password change still verifies the current password, revokes all sessions and records immutable evidence", async () => {
    const next = "Another-fixture-password-2026!";
    const before = await prisma.platformAdminMfaCredential.findUnique({ where: { userId: id } });
    await expect(security.changePassword(ctx, "wrong", next)).rejects.toThrow();
    await admin.get("/platform-admin/users").expect(200);
    expect(await security.changePassword(ctx, updated, next)).toEqual({ reloginRequired: true });
    await admin.get("/auth/me").expect(401);
    await admin.post("/auth/refresh").expect(401);
    expect(await prisma.session.count({ where: { userId: id, revokedAt: null } })).toBe(0);
    expect(await prisma.platformAdminMfaCredential.findUnique({ where: { userId: id } })).toEqual(
      before
    );
    expect(
      await prisma.platformAdminAuditEvent.count({
        where: { actorUserId: id, action: "PASSWORD_CHANGED" }
      })
    ).toBe(2);
    admin = await loginFixture(email, next);
    expect((await admin.get("/auth/me").expect(200)).body.user.requiresAdminSecuritySetup).toBe(
      false
    );
    await admin.get("/platform-admin/users").expect(200);
  });
  it("concurrent SQL revocations cannot remove both remaining SUPER_ADMIN grants", async () => {
    const second = await prisma.user.create({
      data: { email: `concurrency-${suffix}@example.test`, displayName: "Concurrent super fixture" }
    });
    await prisma.platformAdministrator.create({ data: { userId: second.id, role: "SUPER_ADMIN" } });
    const result = await Promise.allSettled(
      [id, second.id].map((userId) =>
        prisma.platformAdministrator.update({
          where: { userId },
          data: { isActive: false, revokedAt: new Date() }
        })
      )
    );
    expect(result.filter((value) => value.status === "fulfilled")).toHaveLength(1);
    expect(result.filter((value) => value.status === "rejected")).toHaveLength(1);
    expect(
      await prisma.platformAdministrator.count({
        where: { role: "SUPER_ADMIN", isActive: true, revokedAt: null, user: { isActive: true } }
      })
    ).toBe(1);
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(36036,1)`;
      await tx.platformAdministrator.update({
        where: { userId: id },
        data: { isActive: true, revokedAt: null }
      });
      await tx.platformAdministrator.update({
        where: { userId: second.id },
        data: { isActive: false, revokedAt: new Date() }
      });
    });
  });
});
