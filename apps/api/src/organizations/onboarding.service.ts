import { Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { AccountType, BalanceSide } from "@ledgerapp/db";
import { DatabaseService } from "../database/database.service";
import { monthlyPeriods } from "../fiscal-years/fiscal-years.service";
import { OnboardingDto } from "./onboarding.dto";

/** Original starter chart, deliberately not a full BAS dataset or tax setup. */
export const STARTER_ACCOUNTS = [
  {
    accountNumber: "1930",
    name: "Bank",
    type: AccountType.ASSET,
    normalBalance: BalanceSide.DEBIT
  },
  {
    accountNumber: "1510",
    name: "Kundfordringar",
    type: AccountType.ASSET,
    normalBalance: BalanceSide.DEBIT
  },
  {
    accountNumber: "2440",
    name: "Leverantörsskulder",
    type: AccountType.LIABILITY,
    normalBalance: BalanceSide.CREDIT
  },
  {
    accountNumber: "2091",
    name: "Balanserat resultat",
    type: AccountType.EQUITY,
    normalBalance: BalanceSide.CREDIT
  },
  {
    accountNumber: "3000",
    name: "Intäkter",
    type: AccountType.REVENUE,
    normalBalance: BalanceSide.CREDIT
  },
  {
    accountNumber: "4000",
    name: "Kostnader",
    type: AccountType.EXPENSE,
    normalBalance: BalanceSide.DEBIT
  }
] as const;

@Injectable()
export class OnboardingService {
  constructor(private readonly database: DatabaseService) {}
  async create(actor: string, dto: OnboardingDto, requestId?: string) {
    const periods = monthlyPeriods(dto.startDate, dto.endDate);
    return this.database.prisma.$transaction(async (tx) => {
      // Serialize retries without making company numbers tenant identifiers.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${dto.setupKey}, 0))`;
      const existing = await tx.organization.findUnique({ where: { setupKey: dto.setupKey } });
      if (existing) {
        const member = await tx.organizationMember.findUnique({
          where: { organizationId_userId: { organizationId: existing.id, userId: actor } }
        });
        if (!member || member.removedAt || member.role !== "OWNER")
          throw new NotFoundException("Setup not found.");
        return {
          organization: existing,
          fiscalYear: await tx.fiscalYear.findFirstOrThrow({
            where: { organizationId: existing.id },
            orderBy: { startDate: "asc" }
          })
        };
      }
      await tx.$executeRaw`SELECT set_config('ledgerapp.actor_user_id', ${actor}, true), set_config('ledgerapp.request_id', ${requestId ?? randomUUID()}, true)`;
      const organization = await tx.organization.create({
        data: {
          name: dto.name,
          slug: `workspace-${randomUUID()}`,
          setupKey: dto.setupKey,
          organizationNumber: dto.organizationNumber?.replace("-", ""),
          countryCode: dto.countryCode ?? "SE",
          defaultCurrency: "SEK",
          address: dto.address?.trim()
        }
      });
      await tx.organizationMember.create({
        data: { organizationId: organization.id, userId: actor, role: "OWNER" }
      });
      const fiscalYear = await tx.fiscalYear.create({
        data: {
          organizationId: organization.id,
          name: `${dto.startDate} – ${dto.endDate}`,
          startDate: new Date(dto.startDate),
          endDate: new Date(dto.endDate),
          accountingPeriods: { create: periods }
        }
      });
      await tx.voucherSeries.create({
        data: {
          organizationId: organization.id,
          fiscalYearId: fiscalYear.id,
          code: "A",
          name: "Manuella verifikationer"
        }
      });
      await tx.account.createMany({
        data: STARTER_ACCOUNTS.map((account) => ({ ...account, organizationId: organization.id }))
      });
      await tx.auditEvent.create({
        data: {
          organizationId: organization.id,
          actorUserId: actor,
          action: "CREATE",
          entityType: "ORGANIZATION",
          entityId: organization.id,
          requestId,
          metadata: {
            operation: "ONBOARDING",
            fiscalYearId: fiscalYear.id,
            starterAccounts: STARTER_ACCOUNTS.length,
            starterChart: "ledgerapp-original-v1"
          }
        }
      });
      await tx.platformAdminAuditEvent.create({
        data: {
          actorUserId: actor,
          organizationId: organization.id,
          targetType: "ORGANIZATION",
          targetId: organization.id,
          action: "ORGANIZATION_CREATED",
          requestId
        }
      });
      return { organization, fiscalYear };
    });
  }
}
