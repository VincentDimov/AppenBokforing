import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException
} from "@nestjs/common";
import { Prisma, type OrganizationMemberRole } from "@ledgerapp/db";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../database/database.service";
import { AuthSettingsService } from "../auth/auth-settings.service";
import { PlatformAdminSecurityService, type AdminContext } from "./platform-admin-security.service";
import type { PlatformPermission } from "./platform-admin.permissions";
import { hashPassword, validPrivilegedPassword } from "./password-policy";
import type {
  AdminListDto,
  AdminUserUpdateDto,
  AdminOrganizationUpdateDto,
  AdminMembershipUpdateDto,
  AdminGrantDto,
  AdminCreateUserDto,
  AdminCreateOrganizationDto
} from "./platform-admin.dto";

const organizationSelect = {
  id: true,
  name: true,
  slug: true,
  organizationNumber: true,
  address: true,
  countryCode: true,
  defaultCurrency: true,
  isActive: true,
  createdAt: true,
  updatedAt: true
} satisfies Prisma.OrganizationSelect;
const membershipSelect = {
  id: true,
  userId: true,
  organizationId: true,
  role: true,
  removedAt: true,
  createdAt: true,
  organization: { select: { id: true, name: true } },
  user: { select: { id: true, displayName: true, email: true } }
} satisfies Prisma.OrganizationMemberSelect;
const userSelect = {
  id: true,
  email: true,
  displayName: true,
  accountStatus: true,
  isActive: true,
  mustChangePassword: true,
  createdAt: true,
  updatedAt: true,
  lastLoginAt: true,
  platformAdministrator: {
    select: { id: true, role: true, isActive: true, revokedAt: true, mfaRequired: true }
  },
  organizationMemberships: {
    where: { removedAt: null },
    select: membershipSelect,
    take: 10,
    orderBy: { organization: { name: "asc" } }
  },
  _count: { select: { organizationMemberships: { where: { removedAt: null } } } }
} satisfies Prisma.UserSelect;
const sessionSelect = {
  id: true,
  createdAt: true,
  lastSeenAt: true,
  expiresAt: true,
  revokedAt: true,
  revocationReason: true,
  ipAddress: true,
  userAgent: true,
  userId: true
} satisfies Prisma.SessionSelect;
const auditSelect = {
  id: true,
  actorUserId: true,
  action: true,
  targetType: true,
  targetId: true,
  organizationId: true,
  result: true,
  timestamp: true,
  requestId: true,
  ipMetadata: true,
  beforeMetadata: true,
  afterMetadata: true,
  actor: { select: { displayName: true } }
} satisfies Prisma.PlatformAdminAuditEventSelect;
const invitationSelect = {
  id: true,
  organizationId: true,
  email: true,
  role: true,
  createdAt: true,
  expiresAt: true,
  acceptedAt: true,
  revokedAt: true,
  organization: { select: { id: true, name: true } },
  invitedBy: { select: { id: true, displayName: true } }
} satisfies Prisma.OrganizationInvitationSelect;

export function userSort(sort: string): Prisma.Sql {
  const orders: Record<string, string> = {
    name_asc: "u.display_name COLLATE ledgerapp_admin_sv ASC",
    name_desc: "u.display_name COLLATE ledgerapp_admin_sv DESC",
    oldest: "u.created_at ASC",
    newest: "u.created_at DESC",
    last_login: "u.last_login_at DESC NULLS LAST",
    company:
      "(SELECT min(o.name COLLATE ledgerapp_admin_sv) FROM organization_members m JOIN organizations o ON o.id=m.organization_id WHERE m.user_id=u.id AND m.removed_at IS NULL) COLLATE ledgerapp_admin_sv ASC NULLS LAST"
  };
  if (!orders[sort]) throw new BadRequestException("Ogiltig användarsortering.");
  return Prisma.raw(orders[sort] + ", u.id ASC");
}
export function organizationSort(sort: string): Prisma.Sql {
  const count =
    "(SELECT count(*) FROM organization_members m WHERE m.organization_id=o.id AND m.removed_at IS NULL)";
  const orders: Record<string, string> = {
    name_asc: "o.name COLLATE ledgerapp_admin_sv ASC",
    name_desc: "o.name COLLATE ledgerapp_admin_sv DESC",
    oldest: "o.created_at ASC",
    newest: "o.created_at DESC",
    updated: "o.updated_at DESC",
    members_desc: count + " DESC",
    members_asc: count + " ASC"
  };
  if (!orders[sort]) throw new BadRequestException("Ogiltig företagssortering.");
  return Prisma.raw(orders[sort] + ", o.id ASC");
}
function dateRange(from?: string, to?: string) {
  const start = from ? new Date(from) : undefined,
    end = to ? new Date(to) : undefined;
  if (start && end && start > end)
    throw new BadRequestException("Startdatum måste föregå slutdatum.");
  return { gte: start, lte: end };
}
const maskIp = (ip: string | null) =>
  ip?.includes(":") ? "IPv6 (maskerad)" : (ip?.replace(/\.\d+$/, ".0/24") ?? null);

@Injectable()
export class PlatformAdminService {
  constructor(
    private readonly db: DatabaseService,
    private readonly security: PlatformAdminSecurityService,
    private readonly settings: AuthSettingsService
  ) {}
  private confirm(actual: string, confirmation: string) {
    if (actual !== confirmation)
      throw new BadRequestException("Bekräftelsen matchar inte målidentifieraren.");
  }
  private async mutate<T>(
    ctx: AdminContext,
    permission: PlatformPermission,
    operation: (tx: Prisma.TransactionClient) => Promise<T>
  ) {
    try {
      return await this.db.prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(36036,1)`;
          await tx.$queryRaw`SELECT id FROM sessions WHERE id=${ctx.user.sessionId}::uuid FOR UPDATE`;
          await this.security.assertAccess(ctx, permission, tx);
          return operation(tx);
        },
        { maxWait: 10000, timeout: 15000 }
      );
    } catch (error) {
      await this.security.denied(ctx, "PLATFORM_MUTATION_FAILED");
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") throw new ConflictException("Identifieraren används redan.");
        if (error.code === "P2004" || error.code === "P2010" || error.code === "P2034")
          throw new ConflictException(
            "Databasens integritets-/ägarskydd stoppade åtgärden. Ingen del sparades."
          );
      }
      throw error;
    }
  }
  async users(dto: AdminListDto) {
    dateRange(dto.fromDate, dto.toDate);
    dateRange(dto.loginFrom, dto.loginTo);
    const clauses: Prisma.Sql[] = [Prisma.sql`true`];
    if (dto.search) {
      const s = "%" + dto.search.replace(/[\\%_]/g, "\\$&") + "%";
      clauses.push(
        Prisma.sql`(u.display_name ILIKE ${s} OR u.email ILIKE ${s} OR EXISTS(SELECT 1 FROM organization_members m JOIN organizations o ON o.id=m.organization_id WHERE m.user_id=u.id AND m.removed_at IS NULL AND (o.name ILIKE ${s} OR o.organization_number ILIKE ${s})))`
      );
    }
    if (dto.status) clauses.push(Prisma.sql`u.account_status=${dto.status}::"UserAccountStatus"`);
    if (dto.hasCompany)
      clauses.push(
        Prisma.sql`EXISTS(SELECT 1 FROM organization_members m WHERE m.user_id=u.id AND m.removed_at IS NULL)=${dto.hasCompany === "yes"}`
      );
    if (dto.platformAdmin)
      clauses.push(
        Prisma.sql`EXISTS(SELECT 1 FROM platform_administrators p WHERE p.user_id=u.id AND p.is_active=true AND p.revoked_at IS NULL)=${dto.platformAdmin === "yes"}`
      );
    if (dto.organizationId || dto.role) {
      if (dto.role && !dto.organizationId)
        throw new BadRequestException("Rollfilter kräver valt företag.");
      clauses.push(
        Prisma.sql`EXISTS(SELECT 1 FROM organization_members m WHERE m.user_id=u.id AND m.removed_at IS NULL AND m.organization_id=${dto.organizationId}::uuid ${dto.role ? Prisma.sql`AND m.role=${dto.role}::"OrganizationMemberRole"` : Prisma.empty})`
      );
    }
    if (dto.fromDate) clauses.push(Prisma.sql`u.created_at>=${new Date(dto.fromDate)}`);
    if (dto.toDate) clauses.push(Prisma.sql`u.created_at<=${new Date(dto.toDate)}`);
    if (dto.loginFrom) clauses.push(Prisma.sql`u.last_login_at>=${new Date(dto.loginFrom)}`);
    if (dto.loginTo) clauses.push(Prisma.sql`u.last_login_at<=${new Date(dto.loginTo)}`);
    const where = Prisma.join(clauses, " AND ");
    return this.db.prisma.$transaction(
      async (tx) => {
        const count = await tx.$queryRaw<
          { total: number }[]
        >`SELECT count(*)::int total FROM users u WHERE ${where}`;
        const ids = await tx.$queryRaw<
          { id: string }[]
        >`SELECT u.id FROM users u WHERE ${where} ORDER BY ${userSort(dto.sort)} LIMIT ${dto.pageSize} OFFSET ${(dto.page - 1) * dto.pageSize}`;
        const rows = await tx.user.findMany({
          where: { id: { in: ids.map((row) => row.id) } },
          select: userSelect
        });
        const byId = new Map(rows.map((row) => [row.id, row]));
        return {
          items: ids.map((row) => byId.get(row.id)),
          total: count[0].total,
          page: dto.page,
          pageSize: dto.pageSize
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
    );
  }
  async user(id: string) {
    const user = await this.db.prisma.user.findUnique({
      where: { id },
      select: { ...userSelect, adminNotes: true }
    });
    if (!user) throw new NotFoundException("Användaren finns inte.");
    return user;
  }
  async sessions(dto: AdminListDto) {
    const where: Prisma.SessionWhereInput = { userId: dto.userId };
    const [items, total] = await this.db.prisma.$transaction([
      this.db.prisma.session.findMany({
        where,
        select: { ...sessionSelect, user: { select: { displayName: true } } },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: dto.pageSize,
        skip: (dto.page - 1) * dto.pageSize
      }),
      this.db.prisma.session.count({ where })
    ]);
    return {
      items: items.map((item) => ({ ...item, ipAddress: maskIp(item.ipAddress) })),
      total,
      page: dto.page,
      pageSize: dto.pageSize
    };
  }
  async memberships(userId: string, dto: AdminListDto) {
    const where = { userId };
    const [items, total] = await this.db.prisma.$transaction([
      this.db.prisma.organizationMember.findMany({
        where,
        select: membershipSelect,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: dto.pageSize,
        skip: (dto.page - 1) * dto.pageSize
      }),
      this.db.prisma.organizationMember.count({ where })
    ]);
    return { items, total, page: dto.page, pageSize: dto.pageSize };
  }
  async createUser(ctx: AdminContext, dto: AdminCreateUserDto) {
    if (!validPrivilegedPassword(dto.password))
      throw new BadRequestException(
        "Tillfälligt lösenord måste ha 14–128 tecken och stora/små bokstäver samt siffror."
      );
    const passwordHash = await hashPassword(dto.password, this.settings);
    return this.mutate(ctx, "WRITE", async (tx) => {
      const user = await tx.user.create({
        data: {
          displayName: dto.displayName,
          email: dto.email,
          passwordHash,
          mustChangePassword: true
        },
        select: { id: true, displayName: true, email: true, mustChangePassword: true }
      });
      await this.security.audit(tx, ctx, "USER_CREATED", "USER", user.id, {
        after: { mustChangePassword: true }
      });
      return user;
    });
  }
  async updateUser(ctx: AdminContext, id: string, dto: AdminUserUpdateDto) {
    return this.mutate(ctx, "WRITE", async (tx) => {
      const before = await tx.user.findUnique({
        where: { id },
        select: { id: true, email: true, displayName: true, adminNotes: true }
      });
      if (!before) throw new NotFoundException("Användaren finns inte.");
      // Do not change invitation-bound login identity without verified ownership.
      if (dto.email && dto.email !== before.email)
        throw new ServiceUnavailableException({
          code: "EMAIL_VERIFICATION_NOT_CONFIGURED",
          message:
            "E-postbyte kräver verifierad leverans och ägarskapskontroll, som ännu inte är konfigurerade."
        });
      const after = await tx.user.update({
        where: { id },
        data: { displayName: dto.displayName, adminNotes: dto.adminNotes },
        select: { id: true, displayName: true, email: true, adminNotes: true }
      });
      await this.security.audit(tx, ctx, "USER_UPDATED", "USER", id, {
        before: { displayName: before.displayName },
        after: { displayName: after.displayName, notesChanged: dto.adminNotes !== undefined }
      });
      return after;
    });
  }
  async setUserStatus(
    ctx: AdminContext,
    id: string,
    status: "ACTIVE" | "SUSPENDED" | "DEACTIVATED",
    confirmation: string
  ) {
    return this.mutate(ctx, "WRITE", async (tx) => {
      const user = await tx.user.findUnique({
        where: { id },
        select: { email: true, accountStatus: true }
      });
      if (!user) throw new NotFoundException("Användaren finns inte.");
      this.confirm(user.email, confirmation);
      if (status !== "ACTIVE") {
        const grant = await tx.platformAdministrator.findUnique({
          where: { userId: id },
          select: { role: true, isActive: true, revokedAt: true }
        });
        if (
          grant?.role === "SUPER_ADMIN" &&
          grant.isActive &&
          !grant.revokedAt &&
          (await tx.platformAdministrator.count({
            where: {
              role: "SUPER_ADMIN",
              isActive: true,
              revokedAt: null,
              user: { isActive: true }
            }
          })) <= 1
        )
          throw new ConflictException("Sista aktiva SUPER_ADMIN kan inte stängas av.");
      }
      const after = await tx.user.update({
        where: { id },
        data: { accountStatus: status },
        select: { id: true, accountStatus: true, isActive: true }
      });
      await this.security.audit(tx, ctx, "USER_STATUS_CHANGED", "USER", id, {
        before: { status: user.accountStatus },
        after: { status }
      });
      return after;
    });
  }
  async revokeSessions(ctx: AdminContext, id: string, confirmation: string, sessionId?: string) {
    return this.mutate(ctx, "WRITE", async (tx) => {
      const user = await tx.user.findUnique({ where: { id }, select: { email: true } });
      if (!user) throw new NotFoundException();
      this.confirm(user.email, confirmation);
      const result = await tx.session.updateMany({
        where: { userId: id, id: sessionId, revokedAt: null },
        data: { revokedAt: new Date(), revocationReason: "ADMIN_REVOKED" }
      });
      await this.security.audit(tx, ctx, "USER_SESSIONS_REVOKED", "USER", id, {
        after: { count: result.count }
      });
      return { revoked: result.count };
    });
  }
  async temporaryPassword(
    ctx: AdminContext,
    id: string,
    password: string,
    confirmation: string,
    requireOnly = false
  ) {
    if (!requireOnly && !validPrivilegedPassword(password))
      throw new BadRequestException("Lösenordspolicyn är inte uppfylld.");
    const passwordHash = requireOnly ? undefined : await hashPassword(password, this.settings);
    return this.mutate(ctx, "WRITE", async (tx) => {
      const user = await tx.user.findUnique({
        where: { id },
        select: { email: true, platformAdministrator: { select: { id: true } } }
      });
      if (!user) throw new NotFoundException();
      this.confirm(user.email, confirmation);
      if (user.platformAdministrator)
        throw new ConflictException(
          "Administratörers credentials återställs endast genom den separata säkra återställningsprocessen."
        );
      await tx.user.update({ where: { id }, data: { passwordHash, mustChangePassword: true } });
      await tx.session.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date(), revocationReason: "PASSWORD_CHANGED" }
      });
      await this.security.audit(
        tx,
        ctx,
        requireOnly ? "PASSWORD_CHANGE_REQUIRED" : "TEMPORARY_PASSWORD_SET",
        "USER",
        id,
        { after: { mustChangePassword: true } }
      );
      return { mustChangePassword: true, notificationSent: false };
    });
  }
  async passwordReset(ctx: AdminContext, id: string, confirmation: string) {
    return this.mutate(ctx, "WRITE", async (tx) => {
      const user = await tx.user.findUnique({ where: { id }, select: { email: true } });
      if (!user) throw new NotFoundException();
      this.confirm(user.email, confirmation);
      throw new ServiceUnavailableException({
        code: "PASSWORD_RESET_DELIVERY_NOT_CONFIGURED",
        message:
          "Ingen säker lösenordsåterställningsleverans är konfigurerad. Inget meddelande har skickats."
      });
    });
  }
  async organizations(dto: AdminListDto) {
    if (dto.role && !dto.userId)
      throw new BadRequestException("Välj användare innan företagsrollen filtreras.");
    dateRange(dto.fromDate, dto.toDate);
    const clauses: Prisma.Sql[] = [Prisma.sql`true`];
    if (dto.search) {
      const s = "%" + dto.search.replace(/[\\%_]/g, "\\$&") + "%";
      clauses.push(
        Prisma.sql`(o.name ILIKE ${s} OR o.organization_number ILIKE ${s} OR o.address ILIKE ${s} OR o.country_code ILIKE ${s} OR o.slug ILIKE ${s})`
      );
    }
    if (dto.organizationStatus)
      clauses.push(Prisma.sql`o.is_active=${dto.organizationStatus === "active"}`);
    if (dto.country) clauses.push(Prisma.sql`o.country_code=${dto.country}`);
    if (dto.hasCompany)
      clauses.push(
        Prisma.sql`EXISTS(SELECT 1 FROM organization_members m JOIN users u ON u.id=m.user_id WHERE m.organization_id=o.id AND m.removed_at IS NULL AND u.is_active=true)=${dto.hasCompany === "yes"}`
      );
    if (dto.userId)
      clauses.push(
        Prisma.sql`EXISTS(SELECT 1 FROM organization_members m WHERE m.organization_id=o.id AND m.removed_at IS NULL AND m.user_id=${dto.userId}::uuid ${dto.role ? Prisma.sql`AND m.role=${dto.role}::"OrganizationMemberRole"` : Prisma.empty})`
      );
    if (dto.fromDate) clauses.push(Prisma.sql`o.created_at>=${new Date(dto.fromDate)}`);
    if (dto.toDate) clauses.push(Prisma.sql`o.created_at<=${new Date(dto.toDate)}`);
    const where = Prisma.join(clauses, " AND ");
    return this.db.prisma.$transaction(
      async (tx) => {
        const count = await tx.$queryRaw<
          { total: number }[]
        >`SELECT count(*)::int total FROM organizations o WHERE ${where}`;
        const ids = await tx.$queryRaw<
          { id: string }[]
        >`SELECT o.id FROM organizations o WHERE ${where} ORDER BY ${organizationSort(dto.sort)} LIMIT ${dto.pageSize} OFFSET ${(dto.page - 1) * dto.pageSize}`;
        const rows = await tx.organization.findMany({
          where: { id: { in: ids.map((row) => row.id) } },
          select: {
            ...organizationSelect,
            _count: { select: { members: { where: { removedAt: null } } } }
          }
        });
        const byId = new Map(rows.map((row) => [row.id, row]));
        return {
          items: ids.map((row) => byId.get(row.id)),
          total: count[0].total,
          page: dto.page,
          pageSize: dto.pageSize
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
    );
  }
  async organization(id: string) {
    const org = await this.db.prisma.organization.findUnique({
      where: { id },
      select: {
        ...organizationSelect,
        _count: {
          select: {
            members: true,
            fiscalYears: true,
            journalEntries: true,
            attachments: true,
            sieImports: true
          }
        }
      }
    });
    if (!org) throw new NotFoundException("Företaget finns inte.");
    const [fiscalYears, voucherSeries, statuses] = await Promise.all([
      this.db.prisma.fiscalYear.findMany({
        where: { organizationId: id },
        select: {
          id: true,
          name: true,
          startDate: true,
          endDate: true,
          status: true,
          _count: { select: { accountingPeriods: { where: { status: "LOCKED" } } } }
        },
        orderBy: [{ startDate: "desc" }, { id: "asc" }],
        take: 25
      }),
      this.db.prisma.voucherSeries.findMany({
        where: { organizationId: id },
        select: { id: true, code: true, name: true, isActive: true, fiscalYearId: true },
        orderBy: [{ code: "asc" }, { id: "asc" }],
        take: 100
      }),
      this.db.prisma.journalEntry.groupBy({
        by: ["status"],
        where: { organizationId: id },
        _count: { _all: true }
      })
    ]);
    return {
      ...org,
      fiscalYears,
      voucherSeries,
      voucherCounts: statuses.map((row) => ({ status: row.status, count: row._count._all }))
    };
  }
  async organizationMembers(id: string, dto: AdminListDto) {
    const where = { organizationId: id };
    const [items, total] = await this.db.prisma.$transaction([
      this.db.prisma.organizationMember.findMany({
        where,
        select: membershipSelect,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: dto.pageSize,
        skip: (dto.page - 1) * dto.pageSize
      }),
      this.db.prisma.organizationMember.count({ where })
    ]);
    return { items, total, page: dto.page, pageSize: dto.pageSize };
  }
  async createOrganization(ctx: AdminContext, dto: AdminCreateOrganizationDto) {
    return this.mutate(ctx, "WRITE", async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: dto.ownerUserId },
        select: { isActive: true }
      });
      if (!user?.isActive) throw new BadRequestException("Välj en aktiv ägare.");
      const org = await tx.organization.create({
        data: {
          name: dto.name,
          address: dto.address,
          countryCode: dto.countryCode ?? "SE",
          organizationNumber: dto.organizationNumber,
          slug: "organization-" + randomUUID()
        },
        select: organizationSelect
      });
      await tx.organizationMember.create({
        data: { organizationId: org.id, userId: dto.ownerUserId, role: "OWNER" }
      });
      await this.security.audit(tx, ctx, "ORGANIZATION_CREATED", "ORGANIZATION", org.id, {
        organizationId: org.id,
        after: { ownerUserId: dto.ownerUserId }
      });
      await tx.auditEvent.create({
        data: {
          organizationId: org.id,
          actorUserId: ctx.user.id,
          action: "CREATE",
          entityType: "ORGANIZATION",
          entityId: org.id,
          requestId: ctx.requestId,
          metadata: { operation: "PLATFORM_ORGANIZATION_CREATED" }
        }
      });
      return org;
    });
  }
  async updateOrganization(ctx: AdminContext, id: string, dto: AdminOrganizationUpdateDto) {
    return this.mutate(ctx, "WRITE", async (tx) => {
      await tx.$queryRaw`SELECT id FROM organizations WHERE id=${id}::uuid FOR UPDATE`;
      const before = await tx.organization.findUnique({
        where: { id },
        select: organizationSelect
      });
      if (!before) throw new NotFoundException();
      await tx.$queryRaw`SELECT id FROM fiscal_years WHERE organization_id=${id}::uuid ORDER BY id FOR UPDATE`;
      const identityChanged =
        (dto.organizationNumber !== undefined &&
          dto.organizationNumber.replace("-", "") !==
            before.organizationNumber?.replace("-", "")) ||
        (dto.countryCode !== undefined && dto.countryCode !== before.countryCode);
      if (
        identityChanged &&
        ((await tx.journalEntry.count({
          where: { organizationId: id, status: { in: ["POSTED", "REVERSED"] } }
        })) ||
          (await tx.openingBalance.count({ where: { organizationId: id } })))
      )
        throw new ConflictException("Företagsidentiteten är låst efter bokföringsstart.");
      const after = await tx.organization.update({
        where: { id },
        data: {
          name: dto.name,
          address: dto.address,
          organizationNumber: dto.organizationNumber,
          countryCode: dto.countryCode
        },
        select: organizationSelect
      });
      await this.security.audit(tx, ctx, "ORGANIZATION_UPDATED", "ORGANIZATION", id, {
        organizationId: id,
        before: { name: before.name },
        after: { name: after.name }
      });
      await tx.auditEvent.create({
        data: {
          organizationId: id,
          actorUserId: ctx.user.id,
          action: "UPDATE",
          entityType: "ORGANIZATION",
          entityId: id,
          requestId: ctx.requestId,
          metadata: { operation: "PLATFORM_ORGANIZATION_UPDATED" }
        }
      });
      return after;
    });
  }
  async organizationStatus(ctx: AdminContext, id: string, isActive: boolean, confirmation: string) {
    return this.mutate(ctx, "WRITE", async (tx) => {
      await tx.$queryRaw`SELECT id FROM organizations WHERE id=${id}::uuid FOR UPDATE`;
      const org = await tx.organization.findUnique({
        where: { id },
        select: { name: true, isActive: true }
      });
      if (!org) throw new NotFoundException();
      this.confirm(org.name, confirmation);
      const after = await tx.organization.update({
        where: { id },
        data: { isActive },
        select: organizationSelect
      });
      await this.security.audit(
        tx,
        ctx,
        isActive ? "ORGANIZATION_REACTIVATED" : "ORGANIZATION_DEACTIVATED",
        "ORGANIZATION",
        id,
        { organizationId: id, before: { isActive: org.isActive }, after: { isActive } }
      );
      await tx.auditEvent.create({
        data: {
          organizationId: id,
          actorUserId: ctx.user.id,
          action: "UPDATE",
          entityType: "ORGANIZATION",
          entityId: id,
          requestId: ctx.requestId,
          metadata: {
            operation: isActive
              ? "PLATFORM_ORGANIZATION_REACTIVATED"
              : "PLATFORM_ORGANIZATION_DEACTIVATED"
          }
        }
      });
      return after;
    });
  }
  private async tenantAudit(
    tx: Prisma.TransactionClient,
    ctx: AdminContext,
    org: string,
    id: string,
    operation: string
  ) {
    await tx.$executeRaw`SELECT set_config('ledgerapp.actor_user_id',${ctx.user.id},true),set_config('ledgerapp.request_id',${ctx.requestId ?? ""},true)`;
    await tx.auditEvent.create({
      data: {
        organizationId: org,
        actorUserId: ctx.user.id,
        entityType: "ORGANIZATION_MEMBER",
        entityId: id,
        action: "UPDATE",
        requestId: ctx.requestId,
        metadata: { operation }
      }
    });
  }
  async addMembership(
    ctx: AdminContext,
    userId: string,
    organizationId: string,
    role: OrganizationMemberRole,
    confirmation: string
  ) {
    if (role === "OWNER")
      throw new BadRequestException("Ägarskap ändras genom explicit ägaröverföring.");
    return this.mutate(ctx, "WRITE", async (tx) => {
      await tx.$queryRaw`SELECT id FROM organizations WHERE id=${organizationId}::uuid FOR UPDATE`;
      const [org, user] = await Promise.all([
        tx.organization.findUnique({ where: { id: organizationId }, select: { isActive: true } }),
        tx.user.findUnique({ where: { id: userId }, select: { email: true, isActive: true } })
      ]);
      if (!org?.isActive || !user?.isActive)
        throw new BadRequestException("Aktivt företag och aktiv användare krävs.");
      this.confirm(user.email, confirmation);
      const existing = await tx.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId, userId } },
        select: { removedAt: true }
      });
      if (existing && !existing.removedAt) throw new ConflictException("Medlemskapet finns redan.");
      const member = await tx.organizationMember.upsert({
        where: { organizationId_userId: { organizationId, userId } },
        create: { organizationId, userId, role },
        update: { role, removedAt: null },
        select: membershipSelect
      });
      await this.tenantAudit(tx, ctx, organizationId, member.id, "PLATFORM_MEMBERSHIP_ADDED");
      await this.security.audit(tx, ctx, "MEMBERSHIP_ADDED", "ORGANIZATION_MEMBER", member.id, {
        organizationId,
        after: { userId, role }
      });
      return member;
    });
  }
  async changeMembership(
    ctx: AdminContext,
    userId: string,
    id: string,
    dto: AdminMembershipUpdateDto
  ) {
    return this.mutate(ctx, "WRITE", async (tx) => {
      const initial = await tx.organizationMember.findFirst({
        where: { id, userId },
        select: { organizationId: true }
      });
      if (!initial) throw new NotFoundException();
      await tx.$queryRaw`SELECT id FROM organizations WHERE id=${initial.organizationId}::uuid FOR UPDATE`;
      const member = await tx.organizationMember.findUnique({
        where: { id },
        select: membershipSelect
      });
      if (!member) throw new NotFoundException();
      this.confirm(member.user.email, dto.confirmation);
      if (dto.role === "OWNER") throw new BadRequestException("Använd explicit ägaröverföring.");
      if (dto.removed === false && member.removedAt) {
        if (member.role === "OWNER")
          throw new ConflictException("Borttaget ägarskap kräver explicit ägaröverföring.");
        const [user, org] = await Promise.all([
          tx.user.findUnique({ where: { id: userId }, select: { isActive: true } }),
          tx.organization.findUnique({
            where: { id: member.organizationId },
            select: { isActive: true }
          })
        ]);
        if (!user?.isActive || !org?.isActive)
          throw new ConflictException("Återställning kräver aktiv användare och aktivt företag.");
      }
      if (member.role === "OWNER" && (dto.role !== undefined || dto.removed === true)) {
        if (
          (await tx.organizationMember.count({
            where: { organizationId: member.organizationId, role: "OWNER", removedAt: null }
          })) <= 1
        )
          throw new ConflictException("Sista ägaren kan inte tas bort.");
      }
      const after = await tx.organizationMember.update({
        where: { id },
        data: {
          role: dto.role,
          removedAt: dto.removed === undefined ? undefined : dto.removed ? new Date() : null
        },
        select: membershipSelect
      });
      await this.tenantAudit(tx, ctx, member.organizationId, id, "PLATFORM_MEMBERSHIP_CHANGED");
      await this.security.audit(tx, ctx, "MEMBERSHIP_CHANGED", "ORGANIZATION_MEMBER", id, {
        organizationId: member.organizationId,
        before: { role: member.role, removed: Boolean(member.removedAt) },
        after: { role: after.role, removed: Boolean(after.removedAt) }
      });
      return after;
    });
  }
  async transferOwner(
    ctx: AdminContext,
    org: string,
    fromUserId: string,
    toUserId: string,
    confirmation: string
  ) {
    return this.mutate(ctx, "WRITE", async (tx) => {
      await tx.$queryRaw`SELECT id FROM organizations WHERE id=${org}::uuid FOR UPDATE`;
      const organization = await tx.organization.findUnique({
        where: { id: org },
        select: { name: true, isActive: true }
      });
      if (!organization) throw new NotFoundException();
      if (!organization.isActive)
        throw new ConflictException("Återaktivera företaget innan ägarskap överförs.");
      this.confirm(organization.name, confirmation);
      const [from, to] = await Promise.all([
        tx.organizationMember.findUnique({
          where: { organizationId_userId: { organizationId: org, userId: fromUserId } }
        }),
        tx.organizationMember.findUnique({
          where: { organizationId_userId: { organizationId: org, userId: toUserId } },
          select: { id: true, removedAt: true, user: { select: { isActive: true } } }
        })
      ]);
      if (
        !from ||
        from.removedAt ||
        from.role !== "OWNER" ||
        !to ||
        to.removedAt ||
        !to.user.isActive ||
        from.id === to.id
      )
        throw new BadRequestException("Två olika aktiva medlemmar och en befintlig ägare krävs.");
      await tx.organizationMember.update({ where: { id: to.id }, data: { role: "OWNER" } });
      await tx.organizationMember.update({ where: { id: from.id }, data: { role: "ADMIN" } });
      await this.tenantAudit(tx, ctx, org, to.id, "PLATFORM_OWNERSHIP_TRANSFERRED");
      await this.security.audit(tx, ctx, "OWNERSHIP_TRANSFERRED", "ORGANIZATION", org, {
        organizationId: org,
        after: { fromUserId, toUserId }
      });
      return { ownerUserId: toUserId };
    });
  }
  async administrators(dto: AdminListDto) {
    const [items, total] = await this.db.prisma.$transaction([
      this.db.prisma.platformAdministrator.findMany({
        select: {
          id: true,
          userId: true,
          role: true,
          isActive: true,
          mustChangePassword: true,
          mfaRequired: true,
          grantedAt: true,
          revokedAt: true,
          user: {
            select: {
              displayName: true,
              email: true,
              isActive: true,
              lastLoginAt: true,
              platformMfaCredential: { select: { verifiedAt: true } }
            }
          },
          grantedBy: { select: { displayName: true } }
        },
        orderBy: [{ grantedAt: "desc" }, { id: "asc" }],
        take: dto.pageSize,
        skip: (dto.page - 1) * dto.pageSize
      }),
      this.db.prisma.platformAdministrator.count()
    ]);
    return { items, total, page: dto.page, pageSize: dto.pageSize };
  }
  async grant(ctx: AdminContext, dto: AdminGrantDto) {
    return this.mutate(ctx, "GRANTS", async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: dto.userId },
        select: { email: true, isActive: true }
      });
      if (!user?.isActive) throw new BadRequestException("Välj en aktiv användare.");
      this.confirm(user.email, dto.confirmation);
      const before = await tx.platformAdministrator.findUnique({
        where: { userId: dto.userId },
        select: { role: true, isActive: true, revokedAt: true }
      });
      if (
        before?.role === "SUPER_ADMIN" &&
        before.isActive &&
        !before.revokedAt &&
        (dto.role !== "SUPER_ADMIN" || !dto.isActive) &&
        (await tx.platformAdministrator.count({
          where: { role: "SUPER_ADMIN", isActive: true, revokedAt: null, user: { isActive: true } }
        })) <= 1
      )
        throw new ConflictException("Sista aktiva SUPER_ADMIN kan inte tas bort eller degraderas.");
      const roleChanged = before?.role !== dto.role;
      const data = {
        role: dto.role,
        isActive: dto.isActive,
        revokedAt: dto.isActive ? null : new Date(),
        revokedById: dto.isActive ? null : ctx.user.id
      };
      const after = await tx.platformAdministrator.upsert({
        where: { userId: dto.userId },
        create: { userId: dto.userId, ...data, grantedById: ctx.user.id, mustChangePassword: true },
        update: {
          ...data,
          ...(!before?.isActive && dto.isActive
            ? { grantedById: ctx.user.id, grantedAt: new Date(), mustChangePassword: true }
            : {})
        },
        select: { id: true, userId: true, role: true, isActive: true, revokedAt: true }
      });
      if (dto.isActive && (!before || !before.isActive))
        await tx.user.update({ where: { id: dto.userId }, data: { mustChangePassword: true } });
      await tx.session.updateMany({
        where: { userId: dto.userId, revokedAt: null },
        data: { revokedAt: new Date(), revocationReason: "ADMIN_REVOKED" }
      });
      await this.security.audit(
        tx,
        ctx,
        "PLATFORM_GRANT_CHANGED",
        "PLATFORM_ADMINISTRATOR",
        after.id,
        {
          before: before ? { role: before.role, isActive: before.isActive } : {},
          after: { role: after.role, isActive: after.isActive, roleChanged }
        }
      );
      return after;
    });
  }
  async invitations(dto: AdminListDto) {
    const where: Prisma.OrganizationInvitationWhereInput = {
      organizationId: dto.organizationId,
      email: dto.search ? { contains: dto.search, mode: "insensitive" } : undefined
    };
    const [items, total] = await this.db.prisma.$transaction([
      this.db.prisma.organizationInvitation.findMany({
        where,
        select: invitationSelect,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: dto.pageSize,
        skip: (dto.page - 1) * dto.pageSize
      }),
      this.db.prisma.organizationInvitation.count({ where })
    ]);
    return { items, total, page: dto.page, pageSize: dto.pageSize, deliveryConfigured: false };
  }
  async revokeInvitation(ctx: AdminContext, id: string, confirmation: string) {
    return this.mutate(ctx, "WRITE", async (tx) => {
      const initial = await tx.organizationInvitation.findUnique({
        where: { id },
        select: { organizationId: true }
      });
      if (!initial) throw new NotFoundException();
      await tx.$queryRaw`SELECT id FROM organizations WHERE id=${initial.organizationId}::uuid FOR UPDATE`;
      const invitation = await tx.organizationInvitation.findUnique({
        where: { id },
        select: invitationSelect
      });
      if (!invitation) throw new NotFoundException();
      this.confirm(invitation.email, confirmation);
      if (invitation.acceptedAt)
        throw new ConflictException("En accepterad inbjudan kan inte återkallas.");
      const after = await tx.organizationInvitation.update({
        where: { id },
        data: { revokedAt: new Date() },
        select: invitationSelect
      });
      await this.security.audit(tx, ctx, "INVITATION_REVOKED", "INVITATION", id, {
        organizationId: invitation.organizationId
      });
      await tx.auditEvent.create({
        data: {
          organizationId: invitation.organizationId,
          actorUserId: ctx.user.id,
          entityType: "INVITATION",
          entityId: id,
          action: "UPDATE",
          requestId: ctx.requestId,
          metadata: { operation: "PLATFORM_INVITATION_REVOKED" }
        }
      });
      return after;
    });
  }
  async audit(dto: AdminListDto) {
    const where: Prisma.PlatformAdminAuditEventWhereInput = {
      actorUserId: dto.actorUserId,
      organizationId: dto.organizationId,
      action: dto.action,
      result: dto.result,
      targetType: dto.targetType,
      targetId: dto.userId,
      timestamp: dateRange(dto.fromDate, dto.toDate)
    };
    const [items, total] = await this.db.prisma.$transaction([
      this.db.prisma.platformAdminAuditEvent.findMany({
        where,
        select: auditSelect,
        orderBy: [{ timestamp: "desc" }, { id: "asc" }],
        take: dto.pageSize,
        skip: (dto.page - 1) * dto.pageSize
      }),
      this.db.prisma.platformAdminAuditEvent.count({ where })
    ]);
    return { items, total, page: dto.page, pageSize: dto.pageSize };
  }
  async usage() {
    const [users, organizations, vouchers, attachments, storage, imports, exports] =
      await this.db.prisma.$transaction([
        this.db.prisma.user.count(),
        this.db.prisma.organization.count(),
        this.db.prisma.journalEntry.count(),
        this.db.prisma.attachment.count(),
        this.db.prisma.attachment.aggregate({ _sum: { size: true } }),
        this.db.prisma.sieImport.count(),
        this.db.prisma.sieExport.count()
      ]);
    return {
      users,
      organizations,
      vouchers,
      attachments,
      attachmentBytes: storage._sum.size?.toString() ?? "0",
      imports,
      exports,
      storageSource: "Persisted attachment metadata; not an object-store inventory"
    };
  }
  async dashboard(dto: AdminListDto) {
    const to = dto.toDate ? new Date(dto.toDate) : new Date();
    const from = dto.fromDate ? new Date(dto.fromDate) : new Date(to.getTime() - 30 * 86400000);
    if (from > to || to.getTime() - from.getTime() > 366 * 86400000)
      throw new BadRequestException("Diagramintervallet måste vara högst 366 dagar.");
    return this.db.prisma.$transaction(
      async (tx) => {
        const [
          users,
          activeUsers,
          suspendedUsers,
          newUsers,
          organizations,
          activeOrganizations,
          memberships,
          pendingInvitations,
          administrators,
          securityEvents,
          failedImports
        ] = await Promise.all([
          tx.user.count(),
          tx.user.count({ where: { accountStatus: "ACTIVE" } }),
          tx.user.count({ where: { accountStatus: "SUSPENDED" } }),
          tx.user.count({ where: { createdAt: { gte: from, lte: to } } }),
          tx.organization.count(),
          tx.organization.count({ where: { isActive: true } }),
          tx.organizationMember.count({ where: { removedAt: null } }),
          tx.organizationInvitation.count({
            where: { acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }
          }),
          tx.platformAdministrator.count({
            where: { isActive: true, revokedAt: null, user: { isActive: true } }
          }),
          tx.platformAdminAuditEvent.count({
            where: { result: "DENIED", timestamp: { gte: from, lte: to } }
          }),
          tx.sieImport.count({ where: { status: "FAILED", createdAt: { gte: from, lte: to } } })
        ]);
        const registrations = await tx.$queryRaw<
          { day: string; users: number; organizations: number }[]
        >`SELECT to_char(d.registration_day,'YYYY-MM-DD') AS "day",(SELECT count(*)::int FROM users u WHERE u.created_at>=d.registration_day AND u.created_at<d.registration_day+interval '1 day') AS users,(SELECT count(*)::int FROM organizations o WHERE o.created_at>=d.registration_day AND o.created_at<d.registration_day+interval '1 day') AS organizations FROM generate_series(date_trunc('day',${from}::timestamptz),date_trunc('day',${to}::timestamptz),interval '1 day') AS d(registration_day)`;
        const [countries, roles, imports, exports, recent] = await Promise.all([
          tx.organization.groupBy({ by: ["countryCode"], _count: { _all: true } }),
          tx.organizationMember.groupBy({
            by: ["role"],
            where: { removedAt: null },
            _count: { _all: true }
          }),
          tx.sieImport.groupBy({
            by: ["status"],
            where: { createdAt: { gte: from, lte: to } },
            _count: { _all: true }
          }),
          tx.sieExport.groupBy({
            by: ["status"],
            where: { createdAt: { gte: from, lte: to } },
            _count: { _all: true }
          }),
          tx.platformAdminAuditEvent.findMany({
            select: auditSelect,
            orderBy: [{ timestamp: "desc" }, { id: "asc" }],
            take: 10
          })
        ]);
        return {
          from,
          to,
          kpis: {
            users,
            activeUsers,
            suspendedUsers,
            inactiveUsers: users - activeUsers,
            newUsers,
            organizations,
            activeOrganizations,
            inactiveOrganizations: organizations - activeOrganizations,
            memberships,
            pendingInvitations,
            administrators,
            securityEvents,
            failedImports
          },
          registrations,
          countries: countries.map((c) => ({ country: c.countryCode, count: c._count._all })),
          roles: roles.map((r) => ({ role: r.role, count: r._count._all })),
          jobs: {
            imports: imports.map((i) => ({ status: i.status, count: i._count._all })),
            exports: exports.map((i) => ({ status: i.status, count: i._count._all }))
          },
          recent
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
    );
  }
  async jobs(dto: AdminListDto) {
    const where = { organizationId: dto.organizationId };
    const select = {
      id: true,
      organizationId: true,
      status: true,
      createdAt: true,
      organization: { select: { name: true } }
    };
    const [imports, exports, importCount, exportCount] = await this.db.prisma.$transaction([
      this.db.prisma.sieImport.findMany({
        where,
        select: { ...select, importedById: true },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: dto.pageSize,
        skip: (dto.page - 1) * dto.pageSize
      }),
      this.db.prisma.sieExport.findMany({
        where,
        select: { ...select, exportedById: true },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: dto.pageSize,
        skip: (dto.page - 1) * dto.pageSize
      }),
      this.db.prisma.sieImport.count({ where }),
      this.db.prisma.sieExport.count({ where })
    ]);
    return {
      imports: imports.map(({ importedById, ...job }) => ({
        ...job,
        initiatedByUserId: importedById
      })),
      exports: exports.map(({ exportedById, ...job }) => ({
        ...job,
        initiatedByUserId: exportedById
      })),
      importCount,
      exportCount,
      page: dto.page,
      pageSize: dto.pageSize
    };
  }
  async system() {
    let databaseReady = false;
    try {
      await this.db.prisma.$queryRaw`SELECT 1`;
      databaseReady = true;
    } catch {
      /* No credential/error disclosure. */
    }
    const migrations = databaseReady
      ? await this.db.prisma.$queryRaw<
          { applied: number; failed: number }[]
        >`SELECT count(*) FILTER(WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)::int applied,count(*) FILTER(WHERE finished_at IS NULL AND rolled_back_at IS NULL)::int failed FROM _prisma_migrations`
      : [];
    const compatible =
      databaseReady &&
      Boolean(
        (
          await this.db.prisma.$queryRaw<
            { count: number }[]
          >`SELECT count(*)::int count FROM _prisma_migrations WHERE migration_name='20261008200000_platform_administration' AND finished_at IS NOT NULL AND rolled_back_at IS NULL`
        )[0]?.count
      ) &&
      migrations[0]?.failed === 0;
    return {
      apiAvailable: true,
      databaseReady,
      applicationVersion: "0.1.0",
      migrationState: migrations[0] ?? null,
      migrationCompatible: compatible,
      mfaEncryptionConfigured: this.security.encryptionConfigured(),
      notificationDeliveryConfigured: false,
      externalMetricsAvailable: false,
      storageReadiness: "Not probed by this endpoint; use authorized deployment readiness checks"
    };
  }
  async securityCenter() {
    const [
      suspendedUsers,
      inactiveGrants,
      pendingMfa,
      revokedSessions,
      deniedLast24h,
      recent,
      activeAdministrators,
      recentChanges
    ] = await this.db.prisma.$transaction([
      this.db.prisma.user.count({ where: { accountStatus: "SUSPENDED" } }),
      this.db.prisma.platformAdministrator.count({
        where: {
          OR: [{ isActive: false }, { revokedAt: { not: null } }, { user: { isActive: false } }]
        }
      }),
      this.db.prisma.platformAdministrator.count({
        where: {
          isActive: true,
          revokedAt: null,
          OR: [
            { user: { platformMfaCredential: null } },
            { user: { platformMfaCredential: { verifiedAt: null } } }
          ]
        }
      }),
      this.db.prisma.session.count({ where: { revokedAt: { not: null } } }),
      this.db.prisma.platformAdminAuditEvent.count({
        where: { result: "DENIED", timestamp: { gte: new Date(Date.now() - 86400000) } }
      }),
      this.db.prisma.platformAdminAuditEvent.findMany({
        where: { result: "DENIED" },
        select: auditSelect,
        orderBy: [{ timestamp: "desc" }, { id: "asc" }],
        take: 20
      }),
      this.db.prisma.platformAdministrator.count({
        where: {
          isActive: true,
          revokedAt: null,
          user: { isActive: true, accountStatus: "ACTIVE" }
        }
      }),
      this.db.prisma.platformAdminAuditEvent.findMany({
        where: {
          action: {
            in: [
              "PLATFORM_GRANT_CHANGED",
              "TEMPORARY_PASSWORD_SET",
              "PASSWORD_CHANGE_REQUIRED",
              "PASSWORD_CHANGED",
              "ADMIN_MFA_RECOVERED",
              "ADMIN_MFA_ENABLED"
            ]
          }
        },
        select: auditSelect,
        orderBy: [{ timestamp: "desc" }, { id: "asc" }],
        take: 20
      })
    ]);
    return {
      suspendedUsers,
      inactiveGrants,
      pendingMfa,
      revokedSessions,
      deniedLast24h,
      recent,
      activeAdministrators,
      recentChanges,
      mfaEncryptionConfigured: this.security.encryptionConfigured(),
      notificationDeliveryConfigured: false
    };
  }
}
