import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  AccountType,
  BalanceSide,
  JournalEntrySource,
  JournalEntryStatus,
  Prisma
} from "@ledgerapp/db";
import { exportSie4, parseSie4, type SieDocument, type SieExportData } from "@ledgerapp/sie";
import { DatabaseService } from "../database/database.service";
import { requireOpenCalendar } from "../fiscal-years/accounting-calendar";
import { createHash, randomUUID } from "node:crypto";

import { assertSieInputSize } from "./sie-input-boundary";

@Injectable()
export class SieService {
  constructor(private readonly database: DatabaseService) {}
  preview(content: string) {
    assertSieInputSize(content);
    return this.previewResult(parseSie4(content));
  }
  async import(
    organizationId: string,
    content: string,
    confirm: boolean,
    actorUserId?: string,
    requestId?: string
  ) {
    assertSieInputSize(content);
    const document = parseSie4(content);
    const preview = this.previewResult(document);
    if (!confirm) return { mode: "PREVIEW", ...preview };
    if (document.errors.length)
      throw new BadRequestException({
        message: "SIE-filen innehåller valideringsfel.",
        ...preview
      });
    if (!document.fiscalYear) throw new BadRequestException("SIE-filen saknar räkenskapsår.");
    if (document.vouchers.some((voucher) => !/^\d+$/.test(voucher.number)))
      throw new BadRequestException("Endast numeriska verifikationsnummer kan importeras.");
    const fiscalYear = await this.database.prisma.fiscalYear.findFirst({
      where: {
        organizationId,
        startDate: new Date(`${document.fiscalYear.start}T00:00:00.000Z`),
        endDate: new Date(`${document.fiscalYear.end}T00:00:00.000Z`)
      }
    });
    if (!fiscalYear)
      throw new NotFoundException("Skapa motsvarande räkenskapsår innan import bekräftas.");
    const importId = randomUUID();
    await this.database.prisma.$transaction(async (tx) => {
      await requireOpenCalendar(tx, organizationId, fiscalYear.id);
      const accounts = new Map(
        (
          await tx.account.findMany({
            where: { organizationId },
            select: { accountNumber: true, id: true }
          })
        ).map((account) => [account.accountNumber, account.id])
      );
      for (const account of document.accounts)
        if (!accounts.has(account.number)) {
          const created = await tx.account.create({
            data: {
              organizationId,
              accountNumber: account.number,
              name: account.name,
              type: inferAccountType(account.number),
              normalBalance: normalBalance(account.number)
            }
          });
          accounts.set(account.number, created.id);
        }
      const periods = await tx.accountingPeriod.findMany({
        where: { organizationId, fiscalYearId: fiscalYear.id }
      });
      for (const voucher of document.vouchers) {
        const period = periods.find(
          (candidate) =>
            candidate.startDate <= new Date(`${voucher.date}T00:00:00.000Z`) &&
            candidate.endDate >= new Date(`${voucher.date}T00:00:00.000Z`)
        );
        if (!period) throw new BadRequestException(`Ingen redovisningsperiod för ${voucher.date}.`);
        await requireOpenCalendar(tx, organizationId, fiscalYear.id, period.id);
        const series = await tx.voucherSeries.upsert({
          where: {
            organizationId_fiscalYearId_code: {
              organizationId,
              fiscalYearId: fiscalYear.id,
              code: voucher.series
            }
          },
          create: {
            organizationId,
            fiscalYearId: fiscalYear.id,
            code: voucher.series,
            name: `Importerad serie ${voucher.series}`,
            nextVoucherNumber: Number(voucher.number) + 1
          },
          update: { nextVoucherNumber: { set: Number(voucher.number) + 1 } }
        });
        const importedEntry = await tx.journalEntry.create({
          data: {
            organizationId,
            fiscalYearId: fiscalYear.id,
            accountingPeriodId: period.id,
            voucherSeriesId: series.id,
            status: JournalEntryStatus.DRAFT,
            source: JournalEntrySource.SIE_IMPORT,
            entryDate: new Date(`${voucher.date}T00:00:00.000Z`),
            description: voucher.text || "SIE-import",
            createdById: actorUserId,
            lines: {
              create: voucher.transactions.map((line, index) => {
                const amount = new Prisma.Decimal(line.amount);
                const accountId = accounts.get(line.account);
                if (!accountId) throw new BadRequestException(`Konto ${line.account} saknas.`);
                return {
                  organizationId,
                  accountId,
                  lineNumber: index + 1,
                  description: line.text ?? null,
                  debitAmount: amount.isPositive() ? amount : new Prisma.Decimal(0),
                  creditAmount: amount.isNegative() ? amount.abs() : new Prisma.Decimal(0)
                };
              })
            }
          }
        });
        await tx.journalEntry.update({
          where: { id: importedEntry.id },
          data: {
            status: JournalEntryStatus.POSTED,
            voucherNumber: Number(voucher.number),
            postedAt: new Date(),
            postedById: actorUserId
          }
        });
        await tx.auditEvent.create({
          data: {
            organizationId,
            actorUserId,
            requestId,
            action: "CREATE",
            entityType: "JOURNAL_ENTRY",
            entityId: importedEntry.id,
            metadata: { source: "SIE_IMPORT", importId }
          }
        });
        await tx.auditEvent.create({
          data: {
            organizationId,
            actorUserId,
            requestId,
            action: "POST",
            entityType: "JOURNAL_ENTRY",
            entityId: importedEntry.id,
            metadata: { source: "SIE_IMPORT", importId, voucherNumber: Number(voucher.number) }
          }
        });
      }
      await tx.auditEvent.create({
        data: {
          organizationId,
          actorUserId,
          requestId,
          action: "IMPORT",
          entityType: "SIE_IMPORT",
          entityId: importId,
          metadata: {
            fiscalYearId: fiscalYear.id,
            vouchers: document.vouchers.length,
            sha256: createHash("sha256").update(content).digest("hex")
          }
        }
      });
    });
    return { mode: "CONFIRMED", ...preview };
  }
  async export(
    organizationId: string,
    fiscalYearId: string,
    actorUserId?: string,
    requestId?: string
  ) {
    const fiscalYear = await this.database.prisma.fiscalYear.findFirst({
      include: { organization: true },
      where: { id: fiscalYearId, organizationId }
    });
    if (!fiscalYear) throw new NotFoundException("Fiscal year not found.");
    const [accounts, opening, entries, projects, costCenters] = await Promise.all([
      this.database.prisma.account.findMany({
        where: { organizationId },
        orderBy: { accountNumber: "asc" }
      }),
      this.database.prisma.openingBalance.findMany({ where: { organizationId, fiscalYearId } }),
      this.database.prisma.journalEntry.findMany({
        include: {
          lines: { include: { account: true, project: true, costCenter: true } },
          voucherSeries: true
        },
        where: { organizationId, fiscalYearId, status: JournalEntryStatus.POSTED },
        orderBy: [{ entryDate: "asc" }, { voucherNumber: "asc" }]
      }),
      this.database.prisma.project.findMany({ where: { organizationId } }),
      this.database.prisma.costCenter.findMany({ where: { organizationId } })
    ]);
    const balances = new Map(
      accounts.map((account) => [
        account.id,
        {
          account: account.accountNumber,
          opening: new Prisma.Decimal(0),
          closing: new Prisma.Decimal(0)
        }
      ])
    );
    for (const item of opening) {
      const b = balances.get(item.accountId);
      if (b) {
        b.opening = b.opening.plus(item.debitAmount).minus(item.creditAmount);
        b.closing = b.closing.plus(item.debitAmount).minus(item.creditAmount);
      }
    }
    for (const entry of entries)
      for (const line of entry.lines) {
        const b = balances.get(line.accountId);
        if (b) b.closing = b.closing.plus(line.debitAmount).minus(line.creditAmount);
      }
    const data: SieExportData = {
      organization: {
        name: fiscalYear.organization.name,
        number: fiscalYear.organization.organizationNumber ?? undefined
      },
      fiscalYear: {
        start: fiscalYear.startDate.toISOString().slice(0, 10),
        end: fiscalYear.endDate.toISOString().slice(0, 10)
      },
      accounts: accounts.map((a) => ({ number: a.accountNumber, name: a.name })),
      balances: [...balances.values()].map((b) => ({
        account: b.account,
        opening: b.opening.toFixed(2),
        closing: b.closing.toFixed(2)
      })),
      objects: [
        ...projects.map((p) => ({ dimension: "6", id: p.code, name: p.name })),
        ...costCenters.map((c) => ({ dimension: "7", id: c.code, name: c.name }))
      ],
      vouchers: entries.map((entry) => ({
        series: entry.voucherSeries?.code ?? "",
        number: String(entry.voucherNumber ?? 0),
        date: entry.entryDate.toISOString().slice(0, 10),
        text: entry.description,
        transactions: entry.lines.map((line) => ({
          account: line.account.accountNumber,
          amount: line.debitAmount.minus(line.creditAmount).toFixed(2),
          date: entry.entryDate.toISOString().slice(0, 10),
          text: line.description ?? entry.description,
          objects: [
            ...(line.project ? [{ dimension: "6", object: line.project.code }] : []),
            ...(line.costCenter ? [{ dimension: "7", object: line.costCenter.code }] : [])
          ]
        }))
      }))
    };
    const content = exportSie4(data);
    await this.database.prisma.$transaction(async (tx) => {
      const job = await tx.sieExport.create({
        data: {
          organizationId,
          fiscalYearId,
          exportedById: actorUserId,
          status: "COMPLETED",
          startedAt: new Date(),
          completedAt: new Date(),
          exportedEntryCount: entries.length
        }
      });
      await tx.auditEvent.create({
        data: {
          organizationId,
          actorUserId,
          requestId,
          action: "EXPORT",
          entityType: "SIE_EXPORT",
          entityId: job.id,
          metadata: {
            fiscalYearId,
            vouchers: entries.length,
            sha256: createHash("sha256").update(content).digest("hex")
          }
        }
      });
    });
    return content;
  }
  private previewResult(document: SieDocument) {
    return {
      fiscalYear: document.fiscalYear ?? null,
      accountsFound: document.accounts.length,
      vouchersFound: document.vouchers.length,
      warnings: document.warnings,
      validationErrors: document.errors
    };
  }
}
function inferAccountType(number: string) {
  return number.startsWith("1")
    ? AccountType.ASSET
    : number.startsWith("2")
      ? AccountType.EQUITY
      : number.startsWith("3")
        ? AccountType.REVENUE
        : AccountType.EXPENSE;
}
function normalBalance(number: string) {
  return number.startsWith("1") ||
    number.startsWith("4") ||
    number.startsWith("5") ||
    number.startsWith("6") ||
    number.startsWith("7")
    ? BalanceSide.DEBIT
    : BalanceSide.CREDIT;
}
