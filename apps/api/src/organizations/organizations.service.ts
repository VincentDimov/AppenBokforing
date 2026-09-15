import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, AuditEntityType, OrganizationMemberRole, Prisma } from "@ledgerapp/db";

import { DatabaseService } from "../database/database.service";
import { CreateOrganizationDto } from "./dto/create-organization.dto";
import { UpdateOrganizationDto } from "./dto/update-organization.dto";

interface OrganizationAuditMetadata {
  ipAddress?: string;
  requestId?: string;
}

@Injectable()
export class OrganizationsService {
  constructor(private readonly database: DatabaseService) {}

  async listForUser(userId: string) {
    const memberships = await this.database.prisma.organizationMember.findMany({
      where: {
        userId,
        organization: { isActive: true }
      },
      include: { organization: true },
      orderBy: { organization: { name: "asc" } }
    });

    return memberships.map(({ organization, role }) => ({
      ...this.toPublicOrganization(organization),
      role
    }));
  }

  async create(userId: string, dto: CreateOrganizationDto, metadata: OrganizationAuditMetadata) {
    try {
      const organization = await this.database.prisma.$transaction(async (transaction) => {
        const created = await transaction.organization.create({
          data: {
            defaultCurrency: dto.defaultCurrency ?? "SEK",
            name: dto.name,
            organizationNumber: dto.organizationNumber,
            slug: dto.slug
          }
        });

        await transaction.organizationMember.create({
          data: {
            organizationId: created.id,
            role: OrganizationMemberRole.OWNER,
            userId
          }
        });

        await transaction.auditEvent.create({
          data: {
            action: AuditAction.CREATE,
            actorUserId: userId,
            afterData: this.toAuditData(created),
            entityId: created.id,
            entityType: AuditEntityType.ORGANIZATION,
            ipAddress: metadata.ipAddress,
            metadata: metadata.requestId ? { requestId: metadata.requestId } : undefined,
            organizationId: created.id,
            requestId: metadata.requestId
          }
        });

        return created;
      });

      return {
        ...this.toPublicOrganization(organization),
        role: OrganizationMemberRole.OWNER
      };
    } catch (error) {
      if (this.isUniqueConstraint(error)) {
        throw new ConflictException(
          "An organization with that slug or organization number already exists."
        );
      }

      throw error;
    }
  }

  async findOne(organizationId: string) {
    const organization = await this.database.prisma.organization.findUnique({
      where: { id: organizationId }
    });

    if (!organization) {
      throw new NotFoundException("Organization not found.");
    }

    return this.toPublicOrganization(organization);
  }

  async update(
    organizationId: string,
    actorUserId: string,
    dto: UpdateOrganizationDto,
    metadata: OrganizationAuditMetadata
  ) {
    try {
      const organization = await this.database.prisma.$transaction(async (transaction) => {
        const before = await transaction.organization.findUnique({
          where: { id: organizationId }
        });

        if (!before) {
          throw new NotFoundException("Organization not found.");
        }

        const updated = await transaction.organization.update({
          where: { id: organizationId },
          data: {
            defaultCurrency: dto.defaultCurrency,
            isActive: dto.isActive,
            name: dto.name,
            organizationNumber: dto.organizationNumber
          }
        });

        await transaction.auditEvent.create({
          data: {
            action: AuditAction.UPDATE,
            actorUserId,
            afterData: this.toAuditData(updated),
            beforeData: this.toAuditData(before),
            entityId: updated.id,
            entityType: AuditEntityType.ORGANIZATION,
            ipAddress: metadata.ipAddress,
            metadata: metadata.requestId ? { requestId: metadata.requestId } : undefined,
            organizationId,
            requestId: metadata.requestId
          }
        });

        return updated;
      });

      return this.toPublicOrganization(organization);
    } catch (error) {
      if (this.isUniqueConstraint(error)) {
        throw new ConflictException(
          "An organization with that organization number already exists."
        );
      }

      throw error;
    }
  }

  private toPublicOrganization(organization: {
    defaultCurrency: string;
    id: string;
    isActive: boolean;
    name: string;
    organizationNumber: string | null;
    slug: string;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      createdAt: organization.createdAt,
      defaultCurrency: organization.defaultCurrency,
      id: organization.id,
      isActive: organization.isActive,
      name: organization.name,
      organizationNumber: organization.organizationNumber,
      slug: organization.slug,
      updatedAt: organization.updatedAt
    };
  }

  private toAuditData(organization: {
    defaultCurrency: string;
    isActive: boolean;
    name: string;
    organizationNumber: string | null;
    slug: string;
  }): Prisma.InputJsonValue {
    return {
      defaultCurrency: organization.defaultCurrency,
      isActive: organization.isActive,
      name: organization.name,
      organizationNumber: organization.organizationNumber,
      slug: organization.slug
    };
  }

  private isUniqueConstraint(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
  }
}
