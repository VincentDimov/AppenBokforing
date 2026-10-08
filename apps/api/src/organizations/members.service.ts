import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { OrganizationMemberRole, Prisma } from "@ledgerapp/db";
import { DatabaseService } from "../database/database.service";
import { InvitationDelivery } from "./invitation-delivery";
import { hasOrganizationPermission } from "./organization-permissions";

const memberSelect = {
  id: true,
  userId: true,
  role: true,
  removedAt: true,
  createdAt: true,
  user: { select: { displayName: true, email: true } }
} satisfies Prisma.OrganizationMemberSelect;
const invitationSelect = {
  id: true,
  email: true,
  role: true,
  expiresAt: true,
  acceptedAt: true,
  revokedAt: true,
  createdAt: true
} satisfies Prisma.OrganizationInvitationSelect;
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

@Injectable()
export class MembersService {
  constructor(
    private readonly db: DatabaseService,
    private readonly delivery: InvitationDelivery
  ) {}
  async list(org: string) {
    const [members, invitations] = await Promise.all([
      this.db.prisma.organizationMember.findMany({
        where: { organizationId: org },
        select: memberSelect,
        orderBy: { createdAt: "asc" }
      }),
      this.db.prisma.organizationInvitation.findMany({
        where: { organizationId: org },
        select: invitationSelect,
        orderBy: { createdAt: "desc" },
        take: 100
      })
    ]);
    return { members, invitations };
  }
  private async lock(tx: Prisma.TransactionClient, org: string, actor: string, requestId?: string) {
    await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${org}::uuid FOR UPDATE`;
    await tx.$executeRaw`SELECT set_config('ledgerapp.actor_user_id', ${actor}, true), set_config('ledgerapp.request_id', ${requestId ?? ""}, true)`;
    const member = await tx.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: org, userId: actor } }
    });
    if (!member || member.removedAt) throw new NotFoundException("Organization not found.");
    if (!hasOrganizationPermission(member.role, "MANAGE_MEMBERS"))
      throw new ForbiddenException("Otillräcklig behörighet.");
    return member;
  }
  private audit(
    tx: Prisma.TransactionClient,
    org: string,
    actor: string,
    entityId: string,
    operation: string,
    requestId?: string,
    entityType: "INVITATION" | "ORGANIZATION_MEMBER" = "INVITATION"
  ) {
    return tx.auditEvent.create({
      data: {
        organizationId: org,
        actorUserId: actor,
        action: "UPDATE",
        entityType,
        entityId,
        requestId,
        metadata: { operation }
      }
    });
  }
  async invite(
    org: string,
    actor: string,
    email: string,
    role: OrganizationMemberRole,
    requestId?: string
  ) {
    if (role === "OWNER")
      throw new BadRequestException("Ägarskap ändras endast genom explicit ägaröverföring.");
    this.delivery.assertAvailable();
    const token = randomBytes(32).toString("base64url");
    const invitation = await this.db.prisma.$transaction(async (tx) => {
      await this.lock(tx, org, actor, requestId);
      const current = await tx.organizationMember.findFirst({
        where: { organizationId: org, removedAt: null, user: { email } }
      });
      if (current)
        throw new ConflictException({
          code: "MEMBER_ALREADY_EXISTS",
          message: "Användaren är redan medlem."
        });
      // A resend always invalidates old tokens; serialization and partial uniqueness
      // prevent two pending invitations for the same recipient/tenant.
      await tx.organizationInvitation.updateMany({
        where: { organizationId: org, email, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() }
      });
      const created = await tx.organizationInvitation.create({
        data: {
          organizationId: org,
          email,
          role,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + 7 * 86400_000),
          invitedByUserId: actor
        },
        select: invitationSelect
      });
      await this.audit(tx, org, actor, created.id, "INVITATION_CREATED", requestId);
      return created;
    });
    const delivery = await this.delivery.deliver({ email, token });
    return { invitation, ...delivery };
  }
  async revoke(org: string, id: string, actor: string, requestId?: string) {
    return this.db.prisma.$transaction(async (tx) => {
      await this.lock(tx, org, actor, requestId);
      const invitation = await tx.organizationInvitation.findFirst({
        where: { id, organizationId: org }
      });
      if (!invitation) throw new NotFoundException("Invitation not found.");
      if (invitation.acceptedAt)
        throw new ConflictException({
          code: "INVITATION_ALREADY_USED",
          message: "Inbjudan är redan accepterad."
        });
      const changed = await tx.organizationInvitation.update({
        where: { id },
        data: { revokedAt: new Date() },
        select: invitationSelect
      });
      await this.audit(tx, org, actor, id, "INVITATION_REVOKED", requestId);
      return changed;
    });
  }
  async accept(actor: string, email: string, token: string, requestId?: string) {
    const initial = await this.db.prisma.organizationInvitation.findUnique({
      where: { tokenHash: hashToken(token) },
      select: { organizationId: true }
    });
    if (!initial) throw new NotFoundException("Invitation not found.");
    return this.db.prisma.$transaction(async (tx) => {
      const org = initial.organizationId;
      await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${org}::uuid AND is_active = true FOR UPDATE`;
      const organization = await tx.organization.findUnique({ where: { id: org } });
      if (!organization?.isActive) throw new NotFoundException("Invitation not found.");
      await tx.$executeRaw`SELECT set_config('ledgerapp.actor_user_id', ${actor}, true), set_config('ledgerapp.request_id', ${requestId ?? ""}, true)`;
      const invite = await tx.organizationInvitation.findUnique({
        where: { tokenHash: hashToken(token) }
      });
      if (!invite || invite.revokedAt)
        throw new ConflictException({
          code: "INVITATION_REVOKED",
          message: "Inbjudan är återkallad."
        });
      if (invite.acceptedAt)
        throw new ConflictException({
          code: "INVITATION_ALREADY_USED",
          message: "Inbjudan är redan använd."
        });
      if (invite.expiresAt <= new Date())
        throw new ConflictException({
          code: "INVITATION_EXPIRED",
          message: "Inbjudan har löpt ut."
        });
      if (invite.email !== email.toLowerCase())
        throw new ForbiddenException({
          code: "INVITATION_EMAIL_MISMATCH",
          message: "Logga in med den inbjudna e-postadressen."
        });
      const existing = await tx.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId: org, userId: actor } }
      });
      if (existing && !existing.removedAt) throw new ConflictException("Du är redan medlem.");
      const member = await tx.organizationMember.upsert({
        where: { organizationId_userId: { organizationId: org, userId: actor } },
        create: { organizationId: org, userId: actor, role: invite.role },
        update: { removedAt: null, role: invite.role },
        select: memberSelect
      });
      await tx.organizationInvitation.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() }
      });
      await this.audit(tx, org, actor, invite.id, "INVITATION_ACCEPTED", requestId);
      return { organizationId: org, member };
    });
  }
  async change(
    org: string,
    id: string,
    actor: string,
    role: OrganizationMemberRole | null,
    requestId?: string
  ) {
    return this.db.prisma.$transaction(async (tx) => {
      const admin = await this.lock(tx, org, actor, requestId);
      const target = await tx.organizationMember.findFirst({
        where: { id, organizationId: org, removedAt: null }
      });
      if (!target) throw new NotFoundException("Member not found.");
      if (role === "OWNER" || (target.role === "OWNER" && admin.role !== "OWNER"))
        throw new ForbiddenException("Ägarändring kräver explicit ägaröverföring av OWNER.");
      if (
        target.role === "OWNER" &&
        (await tx.organizationMember.count({
          where: { organizationId: org, role: "OWNER", removedAt: null }
        })) <= 1
      )
        throw new ConflictException({
          code: "LAST_OWNER_REQUIRED",
          message: "Organisationen måste behålla minst en ägare."
        });
      const changed = await tx.organizationMember.update({
        where: { id },
        data: role ? { role } : { removedAt: new Date() },
        select: memberSelect
      });
      await this.audit(
        tx,
        org,
        actor,
        id,
        role ? "ROLE_CHANGED" : "MEMBER_REMOVED",
        requestId,
        "ORGANIZATION_MEMBER"
      );
      return changed;
    });
  }
  async transfer(org: string, id: string, actor: string, requestId?: string) {
    return this.db.prisma.$transaction(async (tx) => {
      const owner = await this.lock(tx, org, actor, requestId);
      if (owner.role !== "OWNER")
        throw new ForbiddenException("Endast OWNER kan överföra ägarskap.");
      const target = await tx.organizationMember.findFirst({
        where: { id, organizationId: org, removedAt: null }
      });
      if (!target || target.id === owner.id)
        throw new BadRequestException("Välj en annan aktiv medlem.");
      await tx.organizationMember.update({ where: { id: target.id }, data: { role: "OWNER" } });
      await tx.organizationMember.update({ where: { id: owner.id }, data: { role: "ADMIN" } });
      await this.audit(
        tx,
        org,
        actor,
        target.id,
        "OWNERSHIP_TRANSFERRED",
        requestId,
        "ORGANIZATION_MEMBER"
      );
      return { ownerMemberId: target.id };
    });
  }
}
