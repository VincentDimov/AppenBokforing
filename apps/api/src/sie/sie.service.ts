import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import {
  AccountType,
  BalanceSide,
  JournalEntrySource,
  JournalEntryStatus,
  Prisma
} from "@ledgerapp/db";
import {
  encodeSieBytes,
  exportSie4,
  parseSie4,
  type SieDocument,
  type SieExportData
} from "@ledgerapp/sie";
import { DatabaseService } from "../database/database.service";
import { dimensionLabel } from "../organizations/dimension-snapshot";
import { requireOpenCalendar } from "../fiscal-years/accounting-calendar";
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { readAccountingContext } from "../reports/accounting-report-data";
import { zeroBalance, rawBalance } from "../accounting/accounting-balances";

import { assertSieInputSize } from "./sie-input-boundary";

@Injectable()
export class SieService {
  private readonly previewKey = process.env.JWT_ACCESS_SECRET || randomBytes(32).toString("hex");
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
    requestId?: string,
    options: {
      previewToken?: string;
      fiscalYearId?: string;
      bytes?: Uint8Array;
      fileName?: string;
    } = {}
  ) {
    if (!options.bytes) assertSieInputSize(content);
    const bytes = options.bytes ?? Buffer.from(content, "utf8");
    if (bytes.length > 131072) assertSieInputSize("x".repeat(bytes.length));
    const document = parseSie4(options.bytes ?? content);
    const preview = this.previewResult(document);
    const fingerprint = createHash("sha256")
      .update(bytes)
      .update(
        JSON.stringify({
          organizationId,
          actorUserId,
          fiscalYearId: options.fiscalYearId ?? null,
          yearIndex: "0"
        })
      )
      .digest("hex");
    if (!confirm) {
      if (options.fiscalYearId && !document.errors.length) {
        const review = await this.reviewMapping(
          this.database.prisma,
          document,
          organizationId,
          options.fiscalYearId
        );
        preview.warnings.push(...review.warnings);
        preview.validationErrors.push(...review.conflicts);
      }
      return {
        mode: "PREVIEW",
        ...preview,
        fingerprint,
        previewToken: this.signPreview(fingerprint)
      };
    }
    if (!options.fiscalYearId || !this.validPreview(options.previewToken, fingerprint))
      throw new ConflictException({
        code: "SIE_PREVIEW_CONFLICT",
        message:
          "Preview must match the same user, organization, bytes and explicit fiscal-year mapping."
      });
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
        id: options.fiscalYearId,
        startDate: new Date(`${document.fiscalYear.start}T00:00:00.000Z`),
        endDate: new Date(`${document.fiscalYear.end}T00:00:00.000Z`)
      }
    });
    if (!fiscalYear)
      throw new NotFoundException("Skapa motsvarande räkenskapsår innan import bekräftas.");
    const importId = randomUUID();
    let accountsCreated = 0;
    await this.database.prisma.$transaction(
      async (tx) => {
        await requireOpenCalendar(tx, organizationId, fiscalYear.id);
        const review = await this.reviewMapping(tx, document, organizationId, fiscalYear.id);
        if (review.conflicts.length)
          throw new ConflictException({
            code: "SIE_MAPPING_CONFLICT",
            message: "Import mapping changed or conflicts with existing accounting data.",
            validationErrors: review.conflicts
          });
        preview.warnings.push(...review.warnings);
        const accounts = new Map(
          (
            await tx.account.findMany({
              where: { organizationId },
              select: { accountNumber: true, id: true }
            })
          ).map((account) => [account.accountNumber, account.id])
        );
        await tx.sieImport.create({
          data: {
            id: importId,
            organizationId,
            fiscalYearId: fiscalYear.id,
            importedById: actorUserId,
            status: "PROCESSING",
            startedAt: new Date(),
            sourceFileName: options.fileName ?? null,
            sourceSha256: createHash("sha256").update(bytes).digest("hex")
          }
        });
        for (const account of document.accounts)
          if (!accounts.has(account.number)) {
            const created = await tx.account.create({
              data: {
                organizationId,
                accountNumber: account.number,
                name: account.name,
                type:
                  account.type === "T"
                    ? AccountType.ASSET
                    : account.type === "S"
                      ? inferAccountType(account.number)
                      : account.type === "I"
                        ? AccountType.REVENUE
                        : account.type === "K"
                          ? AccountType.EXPENSE
                          : inferAccountType(account.number),
                normalBalance: normalBalance(
                  account.type === "T"
                    ? AccountType.ASSET
                    : account.type === "I"
                      ? AccountType.REVENUE
                      : account.type === "K"
                        ? AccountType.EXPENSE
                        : inferAccountType(account.number)
                )
              }
            });
            accounts.set(account.number, created.id);
            accountsCreated++;
          }
        const projects = new Map<string, string>();
        const costCenters = new Map<string, string>();
        for (const object of document.objects) {
          const where = { organizationId, code: object.id };
          const existing =
            object.dimension === "6"
              ? await tx.project.findFirst({ where })
              : await tx.costCenter.findFirst({ where });
          if (existing && existing.name !== object.name)
            throw new ConflictException("SIE object metadata conflicts with an existing object.");
          const data = { organizationId, code: object.id, name: object.name };
          const item =
            existing ??
            (object.dimension === "6"
              ? await tx.project.create({ data })
              : await tx.costCenter.create({ data }));
          (object.dimension === "6" ? projects : costCenters).set(object.id, item.id);
        }
        // Never overwrite reviewed IB or add balances to an already-used year.
        if (
          document.openingBalances.length &&
          ((await tx.openingBalance.count({
            where: { organizationId, fiscalYearId: fiscalYear.id }
          })) ||
            (await tx.journalEntry.count({
              where: { organizationId, fiscalYearId: fiscalYear.id, status: "POSTED" }
            })))
        )
          throw new ConflictException(
            "Opening balances can only be imported into an empty accounting year."
          );
        for (const balance of document.openingBalances) {
          // SIE permits explicit zero #IB records; our accounting model stores
          // only single-sided, non-zero opening balances.
          const amount = new Prisma.Decimal(balance.amount);
          if (amount.isZero()) continue;
          const accountId = accounts.get(balance.account);
          if (!accountId) throw new BadRequestException("Opening balance account is missing.");
          const account = await tx.account.findFirstOrThrow({
            where: { organizationId, id: accountId }
          });
          if (
            [AccountType.REVENUE, AccountType.EXPENSE].includes(
              account.type as "REVENUE" | "EXPENSE"
            )
          )
            throw new BadRequestException("Opening balances on result accounts are forbidden.");
          await tx.openingBalance.create({
            data: {
              organizationId,
              fiscalYearId: fiscalYear.id,
              accountId,
              createdById: actorUserId,
              debitAmount: amount.isPositive() ? amount : 0,
              creditAmount: amount.isNegative() ? amount.abs() : 0
            }
          });
        }
        await readAccountingContext(tx, organizationId, fiscalYear.id);
        const periods = await tx.accountingPeriod.findMany({
          where: { organizationId, fiscalYearId: fiscalYear.id }
        });
        for (const voucher of document.vouchers) {
          const period = periods.find(
            (candidate) =>
              candidate.startDate <= new Date(`${voucher.date}T00:00:00.000Z`) &&
              candidate.endDate >= new Date(`${voucher.date}T00:00:00.000Z`)
          );
          if (!period)
            throw new BadRequestException(`Ingen redovisningsperiod för ${voucher.date}.`);
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
            update: {}
          });
          await tx.$executeRaw`UPDATE voucher_series SET next_voucher_number = GREATEST(next_voucher_number, ${Number(voucher.number) + 1}, COALESCE((SELECT MAX(voucher_number) + 1 FROM journal_entries WHERE organization_id = ${organizationId}::uuid AND fiscal_year_id = ${fiscalYear.id}::uuid AND voucher_series_id = ${series.id}::uuid), 1)) WHERE id = ${series.id}::uuid AND organization_id = ${organizationId}::uuid`;
          for (const line of voucher.transactions) {
            if (line.date) {
              const date = new Date(`${line.date}T00:00:00Z`);
              const linePeriod = periods.find((p) => p.startDate <= date && p.endDate >= date);
              if (!linePeriod) throw new BadRequestException("Line date has no accounting period.");
              await requireOpenCalendar(tx, organizationId, fiscalYear.id, linePeriod.id);
            }
          }
          const importedEntry = await tx.journalEntry.create({
            data: {
              organizationId,
              fiscalYearId: fiscalYear.id,
              accountingPeriodId: period.id,
              voucherSeriesId: series.id,
              status: JournalEntryStatus.DRAFT,
              source: JournalEntrySource.SIE_IMPORT,
              sieImportId: importId,
              entryDate: new Date(`${voucher.date}T00:00:00.000Z`),
              description: voucher.text || "SIE-import",
              createdById: actorUserId,
              lines: {
                create: voucher.transactions.map((line, index) => {
                  const amount = new Prisma.Decimal(line.amount);
                  const accountId = accounts.get(line.account);
                  if (!accountId) throw new BadRequestException(`Konto ${line.account} saknas.`);
                  return {
                    accountId,
                    lineNumber: index + 1,
                    description: line.text ?? null,
                    transactionDate: line.date ? new Date(`${line.date}T00:00:00Z`) : null,
                    projectId: projects.get(
                      line.objects.find((o) => o.dimension === "6")?.object ?? ""
                    ),
                    costCenterId: costCenters.get(
                      line.objects.find((o) => o.dimension === "1")?.object ?? ""
                    ),
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
              version: { increment: 1 },
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
        await tx.sieImport.update({
          where: { id: importId },
          data: {
            status: "COMPLETED",
            completedAt: new Date(),
            importedEntryCount: document.vouchers.length,
            summary: {
              accountsCreated,
              accountsReused: document.accounts.length - accountsCreated,
              openingBalances: document.openingBalances.length,
              dimensions: document.objects.length,
              warnings: preview.warnings
            }
          }
        });
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
              sha256: createHash("sha256").update(bytes).digest("hex"),
              fingerprint,
              openingBalances: document.openingBalances.length
            }
          }
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 30000 }
    );
    return {
      mode: "CONFIRMED",
      ...preview,
      importId,
      accountsCreated,
      accountsReused: document.accounts.length - accountsCreated
    };
  }
  async export(
    organizationId: string,
    fiscalYearId: string,
    actorUserId?: string,
    requestId?: string
  ) {
    return this.database.prisma.$transaction(
      async (snapshot) => {
        await readAccountingContext(snapshot, organizationId, fiscalYearId);
        const fiscalYear = await snapshot.fiscalYear.findFirst({
          include: { organization: true },
          where: { id: fiscalYearId, organizationId }
        });
        if (!fiscalYear) throw new NotFoundException("Fiscal year not found.");
        const [accounts, opening, entries, projects, costCenters] = await Promise.all([
          snapshot.account.findMany({
            where: { organizationId },
            orderBy: { accountNumber: "asc" }
          }),
          snapshot.openingBalance.findMany({ where: { organizationId, fiscalYearId } }),
          snapshot.journalEntry.findMany({
            include: {
              lines: {
                include: { account: true, project: true, costCenter: true },
                orderBy: { lineNumber: "asc" }
              },
              voucherSeries: true
            },
            where: { organizationId, fiscalYearId, status: JournalEntryStatus.POSTED },
            orderBy: [{ entryDate: "asc" }, { voucherNumber: "asc" }, { id: "asc" }]
          }),
          snapshot.project.findMany({ where: { organizationId } }),
          snapshot.costCenter.findMany({ where: { organizationId } })
        ]);
        const balances = new Map(
          accounts.map((account) => [
            account.id,
            {
              account: account.accountNumber,
              opening: zeroBalance(),
              closing: zeroBalance()
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
        // SIE has one name per object code, not versioned object labels. Prefer
        // the first historical snapshot in this deterministic export interval.
        const objects = new Map<string, { dimension: string; id: string; name: string }>([
          ...projects.map(
            (p) => [`6:${p.code}`, { dimension: "6", id: p.code, name: p.name }] as const
          ),
          ...costCenters.map(
            (c) => [`1:${c.code}`, { dimension: "1", id: c.code, name: c.name }] as const
          )
        ]);
        const historicalObjects = new Set<string>();
        for (const entry of entries)
          for (const line of entry.lines) {
            for (const [dimension, label] of [
              ["6", dimensionLabel(line.projectSnapshot, line.project)],
              ["1", dimensionLabel(line.costCenterSnapshot, line.costCenter)]
            ] as const) {
              if (!label) continue;
              const key = `${dimension}:${label.code}`;
              if (!historicalObjects.has(key)) {
                objects.set(key, { dimension, id: label.code, name: label.name });
                historicalObjects.add(key);
              }
            }
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
          accounts: accounts.map((a) => ({
            number: a.accountNumber,
            name: a.name,
            type:
              a.type === "ASSET"
                ? "T"
                : a.type === "REVENUE"
                  ? "I"
                  : a.type === "EXPENSE"
                    ? "K"
                    : "S"
          })),
          balances: [...balances.values()].map((b) => ({
            account: b.account,
            opening: b.opening.toFixed(2),
            closing: b.closing.toFixed(2)
          })),
          objects: [...objects.values()].sort(
            (a, b) => a.dimension.localeCompare(b.dimension) || a.id.localeCompare(b.id)
          ),
          vouchers: entries.map((entry) => ({
            series: entry.voucherSeries?.code ?? "",
            number: String(entry.voucherNumber ?? 0),
            date: entry.entryDate.toISOString().slice(0, 10),
            text: entry.description,
            transactions: entry.lines.map((line) => ({
              account: line.account.accountNumber,
              amount: rawBalance(line.debitAmount, line.creditAmount).toFixed(2),
              date: line.transactionDate?.toISOString().slice(0, 10),
              text: line.description ?? entry.description,
              objects: [
                ...(line.project ? [{ dimension: "6", object: line.project.code }] : []),
                ...(line.costCenter ? [{ dimension: "1", object: line.costCenter.code }] : [])
              ]
            }))
          }))
        };
        let content: Uint8Array;
        try {
          content = encodeSieBytes(exportSie4(data));
        } catch (error) {
          throw new BadRequestException({
            code: "SIE_EXPORT_UNSUPPORTED",
            message: (error as Error).message
          });
        }
        const tx = snapshot;
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
              dimensionLabelPolicy: "first-posted-snapshot-per-code",
              dimensionLabelVersioning: "SIE4-single-label-loss-boundary",
              sha256: createHash("sha256").update(content).digest("hex")
            }
          }
        });
        return content;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30000 }
    );
  }
  private async reviewMapping(
    tx: Prisma.TransactionClient,
    document: SieDocument,
    organizationId: string,
    fiscalYearId: string
  ) {
    const warnings: string[] = [],
      conflicts: string[] = [];
    if (document.accounts.length || document.vouchers.length) {
      const existing = await tx.account.findMany({ where: { organizationId } });
      const mapped = new Map(existing.map((account) => [account.accountNumber, account]));
      const used = new Set(
        document.vouchers.flatMap((v) => v.transactions.map((line) => line.account))
      );
      for (const incoming of document.accounts) {
        const account = mapped.get(incoming.number);
        if (!account) continue;
        if (account.name !== incoming.name)
          warnings.push(
            `Account ${incoming.number}: existing name retained; imported name differs.`
          );
        const matches =
          !incoming.type ||
          (incoming.type === "T" && account.type === "ASSET") ||
          (incoming.type === "I" && account.type === "REVENUE") ||
          (incoming.type === "K" && account.type === "EXPENSE") ||
          (incoming.type === "S" && ["EQUITY", "LIABILITY"].includes(account.type));
        if (!matches)
          conflicts.push(`Account ${incoming.number}: existing type conflicts with #KTYP.`);
      }
      for (const number of used)
        if (mapped.get(number)?.isActive === false)
          conflicts.push(`Account ${number} is inactive.`);
    }
    if (
      document.openingBalances.length &&
      ((await tx.openingBalance.count({ where: { organizationId, fiscalYearId } })) ||
        (await tx.journalEntry.count({
          where: { organizationId, fiscalYearId, status: "POSTED" }
        })))
    )
      conflicts.push(
        "Opening balances require an empty accounting year; existing IB/history cannot be overwritten."
      );
    if (document.vouchers.length) {
      const identities = await tx.journalEntry.findMany({
        where: { organizationId, fiscalYearId, voucherNumber: { not: null } },
        select: { voucherNumber: true, voucherSeries: { select: { code: true } } }
      });
      const occupied = new Set(
        identities.map((entry) => `${entry.voucherSeries?.code}:${entry.voucherNumber}`)
      );
      for (const voucher of document.vouchers)
        if (occupied.has(`${voucher.series}:${voucher.number}`))
          conflicts.push(`Voucher ${voucher.series}${voucher.number} already exists.`);
    }
    for (const object of document.objects) {
      const where = { organizationId, code: object.id };
      const existing =
        object.dimension === "6"
          ? await tx.project.findFirst({ where })
          : await tx.costCenter.findFirst({ where });
      if (existing && existing.name !== object.name)
        conflicts.push(`Object ${object.dimension}/${object.id} has conflicting metadata.`);
    }
    return { warnings, conflicts };
  }
  private signPreview(fingerprint: string) {
    const payload = `${Date.now() + 15 * 60 * 1000}.${fingerprint}`;
    return `${payload}.${createHmac("sha256", this.previewKey).update(payload).digest("hex")}`;
  }
  private validPreview(token: string | undefined, fingerprint: string): boolean {
    if (!token || !/^\d{13}\.[a-f0-9]{64}\.[a-f0-9]{64}$/.test(token)) return false;
    const [expires, hash, signature] = token.split(".");
    if (Number(expires) < Date.now() || hash !== fingerprint) return false;
    const expected = createHmac("sha256", this.previewKey).update(`${expires}.${hash}`).digest();
    return timingSafeEqual(Buffer.from(signature!, "hex"), expected);
  }
  private previewResult(document: SieDocument) {
    return {
      organization: document.organization ?? null,
      accounts: document.accounts,
      openingBalances: document.openingBalances,
      dimensions: document.objects,
      fiscalYear: document.fiscalYear ?? null,
      fiscalYears: document.fiscalYears,
      openingBalancesFound: document.openingBalances.length,
      objectsFound: document.objects.length,
      accountsFound: document.accounts.length,
      vouchersFound: document.vouchers.length,
      warnings: [
        ...document.warnings,
        ...(document.vouchers.length
          ? ["Imported VAT roles are unclassified and require manual review."]
          : [])
      ],
      validationErrors: document.errors
    };
  }
}
function inferAccountType(number: string) {
  return number.startsWith("1")
    ? AccountType.ASSET
    : number.startsWith("2")
      ? /^2[01]/.test(number)
        ? AccountType.EQUITY
        : AccountType.LIABILITY
      : number.startsWith("3")
        ? AccountType.REVENUE
        : AccountType.EXPENSE;
}
function normalBalance(type: AccountType) {
  return type === AccountType.ASSET || type === AccountType.EXPENSE
    ? BalanceSide.DEBIT
    : BalanceSide.CREDIT;
}
