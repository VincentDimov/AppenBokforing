import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AccountType, AuditAction, AuditEntityType, Prisma } from "@ledgerapp/db";

import { DatabaseService } from "../database/database.service";
import { normalBalanceForAccountType } from "./account-normal-balance";
import { CreateAccountDto } from "./dto/create-account.dto";
import { ListAccountsQueryDto } from "./dto/list-accounts-query.dto";
import { UpdateAccountDto } from "./dto/update-account.dto";

interface AccountAuditMetadata {
  ipAddress?: string;
  requestId?: string;
}

const vatCodeSelect = {
  id: true,
  code: true,
  name: true,
  rate: true,
  type: true,
  isActive: true
} satisfies Prisma.VatCodeSelect;

@Injectable()
export class AccountsService {
  constructor(private readonly database: DatabaseService) {}

  async list(organizationId: string, query: ListAccountsQueryDto) {
    const search = query.q?.trim();
    const where: Prisma.AccountWhereInput = {
      organizationId,
      ...(search
        ? {
            OR: [
              { accountNumber: { startsWith: search } },
              { name: { contains: search, mode: "insensitive" } }
            ]
          }
        : {})
    };

    const accounts = await this.database.prisma.account.findMany({
      include: { vatCode: { select: vatCodeSelect } },
      orderBy: [{ accountNumber: "asc" }, { name: "asc" }],
      where
    });

    return accounts.map((account) => this.toPublicAccount(account));
  }

  async findOne(organizationId: string, accountId: string) {
    const account = await this.database.prisma.account.findFirst({
      include: { vatCode: { select: vatCodeSelect } },
      where: { id: accountId, organizationId }
    });

    if (!account) {
      throw new NotFoundException("Account not found.");
    }

    return this.toPublicAccount(account);
  }

  async create(
    organizationId: string,
    actorUserId: string,
    dto: CreateAccountDto,
    metadata: AccountAuditMetadata
  ) {
    try {
      const account = await this.database.prisma.$transaction(async (transaction) => {
        const vatCodeId = await this.resolveVatCodeId(transaction, organizationId, dto.vatCode);
        const created = await transaction.account.create({
          data: {
            accountNumber: dto.number,
            description: dto.description ?? null,
            isActive: dto.active ?? true,
            name: dto.name,
            normalBalance: normalBalanceForAccountType(dto.accountType),
            organizationId,
            type: dto.accountType,
            vatCodeId
          },
          include: { vatCode: { select: vatCodeSelect } }
        });

        await transaction.auditEvent.create({
          data: {
            action: AuditAction.CREATE,
            actorUserId,
            afterData: this.toAuditData(created),
            entityId: created.id,
            entityType: AuditEntityType.ACCOUNT,
            ipAddress: metadata.ipAddress,
            metadata: metadata.requestId ? { requestId: metadata.requestId } : undefined,
            organizationId,
            requestId: metadata.requestId
          }
        });

        return created;
      });

      return this.toPublicAccount(account);
    } catch (error) {
      if (this.isUniqueConstraint(error)) {
        throw new ConflictException(
          "An account with that number already exists in this organization."
        );
      }

      throw error;
    }
  }

  async update(
    organizationId: string,
    accountId: string,
    actorUserId: string,
    dto: UpdateAccountDto,
    metadata: AccountAuditMetadata
  ) {
    try {
      const account = await this.database.prisma.$transaction(async (transaction) => {
        const before = await transaction.account.findFirst({
          include: { vatCode: { select: vatCodeSelect } },
          where: { id: accountId, organizationId }
        });

        if (!before) {
          throw new NotFoundException("Account not found.");
        }

        const vatCodeId =
          dto.vatCode === undefined
            ? undefined
            : await this.resolveVatCodeId(transaction, organizationId, dto.vatCode);
        const accountType = dto.accountType ?? before.type;
        const updated = await transaction.account.update({
          data: {
            accountNumber: dto.number,
            description: dto.description,
            isActive: dto.active,
            name: dto.name,
            normalBalance:
              dto.accountType === undefined ? undefined : normalBalanceForAccountType(accountType),
            type: dto.accountType,
            vatCodeId
          },
          include: { vatCode: { select: vatCodeSelect } },
          where: { id: accountId }
        });

        await transaction.auditEvent.create({
          data: {
            action: AuditAction.UPDATE,
            actorUserId,
            afterData: this.toAuditData(updated),
            beforeData: this.toAuditData(before),
            entityId: updated.id,
            entityType: AuditEntityType.ACCOUNT,
            ipAddress: metadata.ipAddress,
            metadata: metadata.requestId ? { requestId: metadata.requestId } : undefined,
            organizationId,
            requestId: metadata.requestId
          }
        });

        return updated;
      });

      return this.toPublicAccount(account);
    } catch (error) {
      if (this.isUniqueConstraint(error)) {
        throw new ConflictException(
          "An account with that number already exists in this organization."
        );
      }

      throw error;
    }
  }

  private async resolveVatCodeId(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    vatCode: string | null | undefined
  ): Promise<string | null | undefined> {
    if (vatCode === undefined || vatCode === null) {
      return vatCode;
    }

    const resolved = await transaction.vatCode.findFirst({
      select: { id: true },
      where: { code: vatCode, isActive: true, organizationId }
    });

    if (!resolved) {
      throw new NotFoundException("VAT code not found.");
    }

    return resolved.id;
  }

  private toPublicAccount(account: {
    accountNumber: string;
    createdAt: Date;
    description: string | null;
    id: string;
    isActive: boolean;
    name: string;
    normalBalance: string;
    organizationId: string;
    type: AccountType;
    updatedAt: Date;
    vatCode: {
      code: string;
      id: string;
      isActive: boolean;
      name: string;
      rate: { toString(): string };
      type: string;
    } | null;
  }) {
    return {
      accountType: account.type,
      active: account.isActive,
      createdAt: account.createdAt,
      description: account.description,
      id: account.id,
      name: account.name,
      normalBalance: account.normalBalance,
      number: account.accountNumber,
      organizationId: account.organizationId,
      updatedAt: account.updatedAt,
      vatCode: account.vatCode
        ? {
            active: account.vatCode.isActive,
            code: account.vatCode.code,
            id: account.vatCode.id,
            name: account.vatCode.name,
            rate: account.vatCode.rate.toString(),
            type: account.vatCode.type
          }
        : null
    };
  }

  private toAuditData(account: {
    accountNumber: string;
    description: string | null;
    isActive: boolean;
    name: string;
    normalBalance: string;
    type: AccountType;
    vatCode: { code: string; id: string } | null;
  }): Prisma.InputJsonValue {
    return {
      accountType: account.type,
      active: account.isActive,
      description: account.description,
      name: account.name,
      normalBalance: account.normalBalance,
      number: account.accountNumber,
      vatCode: account.vatCode
        ? {
            code: account.vatCode.code,
            id: account.vatCode.id
          }
        : null
    };
  }

  private isUniqueConstraint(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
  }
}
