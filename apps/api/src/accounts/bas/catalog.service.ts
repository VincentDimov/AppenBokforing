import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { Prisma } from "@ledgerapp/db";
import { DatabaseService } from "../../database/database.service";
import { ActivateCatalogDto, CatalogQueryDto, FrameworkDto } from "./catalog.dto";
import { BAS_FRAMEWORK_MESSAGE } from "./eligibility";

@Injectable()
export class BasCatalogService {
  constructor(private readonly db: DatabaseService) {}
  async context(org: string, tx: Prisma.TransactionClient = this.db.prisma) {
    const organization = await tx.organization.findUnique({
      where: { id: org },
      select: { id: true, name: true, accountingFramework: true, basCatalogVersionId: true }
    });
    if (!organization) throw new NotFoundException("Organisationen finns inte.");
    const catalog = organization.basCatalogVersionId
      ? await tx.basCatalogVersion.findUnique({ where: { id: organization.basCatalogVersionId } })
      : await tx.basCatalogVersion.findFirst({ where: { isDefault: true } });
    return { organization, catalog };
  }
  async list(org: string, query: CatalogQueryDto) {
    return this.db.prisma.$transaction(
      async (tx) => {
        const { organization, catalog } = await this.context(org, tx);
        const local = query.tab === "active" || query.tab === "custom";
        const filter = [Prisma.sql`TRUE`];
        const name = local ? Prisma.sql`a.name` : Prisma.sql`b.official_name`;
        const number = local ? Prisma.sql`a.account_number` : Prisma.sql`b.account_number`;
        if (query.q)
          filter.push(
            Prisma.sql`(${number} LIKE ${query.q + "%"} OR ${name} ILIKE ${"%" + query.q + "%"} OR b.group_name ILIKE ${"%" + query.q + "%"})`
          );
        if (query.accountClass) filter.push(Prisma.sql`left(${number},1)=${query.accountClass}`);
        if (query.group) filter.push(Prisma.sql`left(${number},2)=${query.group}`);
        if (query.category)
          filter.push(Prisma.sql`b.category=${query.category}::"BasAccountCategory"`);
        if (query.status)
          filter.push(
            query.status === "active"
              ? Prisma.sql`a.is_active=true`
              : Prisma.sql`COALESCE(a.is_active,false)=false`
          );
        if (query.compatibility)
          filter.push(
            Prisma.sql`COALESCE(b.is_k2_restricted,false)=${query.compatibility === "restricted"}`
          );
        if (query.tab === "available") filter.push(Prisma.sql`COALESCE(a.is_active,false)=false`);
        if (query.tab === "active")
          filter.push(
            Prisma.sql`a.is_active AND bas_account_eligible(a.organization_id,a.account_number,a.bas_catalog_account_id)`
          );
        if (query.tab === "custom") filter.push(Prisma.sql`a.bas_catalog_account_id IS NULL`);
        const join = local
          ? Prisma.sql`accounts a LEFT JOIN bas_account_catalog b ON b.id=a.bas_catalog_account_id OR (a.bas_catalog_account_id IS NULL AND b.catalog_version_id=${catalog?.id ?? null}::uuid AND b.account_number=a.account_number) LEFT JOIN vat_codes v ON v.id=a.vat_code_id AND v.organization_id=a.organization_id WHERE a.organization_id=${org}::uuid AND ${Prisma.join(filter, " AND ")}`
          : Prisma.sql`bas_account_catalog b LEFT JOIN accounts a ON a.account_number=b.account_number AND a.organization_id=${org}::uuid LEFT JOIN vat_codes v ON v.id=a.vat_code_id AND v.organization_id=a.organization_id WHERE b.catalog_version_id=${catalog?.id ?? null}::uuid AND ${Prisma.join(filter, " AND ")}`;
        const order =
          query.sort === "name-asc"
            ? Prisma.sql`${name} COLLATE ledgerapp_admin_sv ASC,${number} ASC`
            : query.sort === "name-desc"
              ? Prisma.sql`${name} COLLATE ledgerapp_admin_sv DESC,${number} ASC`
              : Prisma.sql`CASE WHEN ${number} ~ '^[0-9]+$' THEN ${number}::numeric END ASC,${number} ASC`;
        const items = await tx.$queryRaw<
          Record<string, unknown>[]
        >`SELECT a.id AS "accountId",b.id AS "catalogAccountId",${number} AS number,COALESCE(a.name,b.official_name) AS name,b.official_name AS "officialName",COALESCE(a.type,b.type) AS "accountType",COALESCE(a.normal_balance,b.normal_balance) AS "normalBalance",b.category,b.account_class AS "accountClass",b.account_group AS "accountGroup",b.class_name AS "className",b.group_name AS "groupName",b.parent_account_number AS "parentAccountNumber",COALESCE(b.is_k2_restricted,false) AS "isK2Restricted",COALESCE(b.is_bookable,true) AS "isBookable",(b.id IS NOT NULL AND b.is_bookable AND (NOT b.is_k2_restricted OR ${organization.accountingFramework}::"AccountingFramework"='K3') AND (a.id IS NULL OR (a.type=b.type AND a.normal_balance=b.normal_balance))) AS "activationEligible",COALESCE(a.is_active,false) AS active,a.bas_catalog_account_id AS "provenanceId",a.description,v.code AS "vatCode" FROM ${join} ORDER BY ${order} LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`;
        const totals = await tx.$queryRaw<
          { total: number }[]
        >`SELECT count(*)::int AS total FROM ${join}`;
        const counts = await tx.$queryRaw<
          { active: number; available: number; main: number; sub: number }[]
        >`SELECT (SELECT count(*)::int FROM accounts a WHERE organization_id=${org}::uuid AND is_active AND bas_account_eligible(organization_id,account_number,bas_catalog_account_id)) AS active,(SELECT count(*)::int FROM bas_account_catalog b WHERE catalog_version_id=${catalog?.id ?? null}::uuid AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.organization_id=${org}::uuid AND a.account_number=b.account_number AND a.is_active)) AS available,(SELECT count(*)::int FROM bas_account_catalog WHERE catalog_version_id=${catalog?.id ?? null}::uuid AND category IN ('MAIN_ACCOUNT','GROUP_ACCOUNT')) AS main,(SELECT count(*)::int FROM bas_account_catalog WHERE catalog_version_id=${catalog?.id ?? null}::uuid AND category='SUBACCOUNT') AS sub`;
        return {
          framework: organization.accountingFramework,
          catalog: catalog
            ? {
                id: catalog.id,
                version: catalog.version,
                sourceVersion: catalog.sourceVersion,
                totalAccounts: catalog.rowCount
              }
            : null,
          blockedReason: catalog
            ? null
            : "Ingen licensierad och klassificeringsgranskad BAS-katalog är importerad.",
          items,
          total: totals[0]?.total ?? 0,
          page: query.page,
          pageSize: query.pageSize,
          counts: counts[0]
        };
      },
      { isolationLevel: "RepeatableRead" }
    );
  }
  async provision(
    org: string,
    actor?: string,
    requestId?: string,
    versionId?: string,
    tx?: Prisma.TransactionClient
  ): Promise<{ configured: boolean; inserted: number; preserved: number; conflicts: string[] }> {
    if (!tx)
      return this.db.prisma.$transaction(
        (t) => this.provision(org, actor, requestId, versionId, t),
        { timeout: 30000 }
      );
    await tx.$queryRaw`SELECT id FROM organizations WHERE id=${org}::uuid FOR UPDATE`;
    const { organization, catalog: current } = await this.context(org, tx);
    const catalog = versionId
      ? await tx.basCatalogVersion.findUnique({ where: { id: versionId } })
      : current;
    if (!catalog)
      return { configured: false, inserted: 0, preserved: 0, conflicts: [] as string[] };
    if (organization.basCatalogVersionId && organization.basCatalogVersionId !== catalog.id)
      throw new ConflictException(
        "Versionsbyte kräver separat granskning; befintliga konton ersätts aldrig."
      );
    if (
      organization.basCatalogVersionId !== catalog.id &&
      organization.accountingFramework !== "K3"
    ) {
      const conflicts = await tx.$queryRaw<{ present: boolean }[]>`SELECT EXISTS(
        SELECT 1 FROM accounts a JOIN bas_account_catalog b ON b.account_number=a.account_number
        AND (b.id=a.bas_catalog_account_id OR b.catalog_version_id=${catalog.id}::uuid)
        WHERE a.organization_id=${org}::uuid AND b.is_k2_restricted AND
        (a.is_active OR EXISTS(SELECT 1 FROM opening_balances ib WHERE ib.account_id=a.id)
        OR EXISTS(SELECT 1 FROM journal_lines l JOIN journal_entries j ON j.id=l.journal_entry_id
          WHERE l.account_id=a.id AND j.status='POSTED'))) AS present`;
      if (conflicts[0]?.present)
        throw new ConflictException({
          code: "BAS_CATALOG_REVIEW_REQUIRED",
          message:
            "Befintliga begränsade konton kräver granskad avstämning före BAS-provisionering. Historiken ändras inte."
        });
    }
    const entries = await tx.basAccountCatalog.findMany({
      where: { catalogVersionId: catalog.id, isDefaultActive: true },
      orderBy: { accountNumber: "asc" }
    });
    const existing = await tx.account.findMany({
      where: { organizationId: org },
      select: {
        id: true,
        accountNumber: true,
        name: true,
        type: true,
        normalBalance: true,
        isActive: true,
        vatCodeId: true
      }
    });
    const numbers = new Map(existing.map((a) => [a.accountNumber, a]));
    const missing = entries.filter((e) => !numbers.has(e.accountNumber));
    const conflicts = entries
      .filter((e) => {
        const a = numbers.get(e.accountNumber);
        return a && (a.type !== e.type || a.normalBalance !== e.normalBalance);
      })
      .map((e) => e.accountNumber);
    await tx.organization.update({ where: { id: org }, data: { basCatalogVersionId: catalog.id } });
    await tx.account.createMany({
      data: missing.map((e) => ({
        organizationId: org,
        accountNumber: e.accountNumber,
        name: e.officialName,
        type: e.type,
        normalBalance: e.normalBalance,
        isActive: true,
        basCatalogAccountId: e.id
      })),
      skipDuplicates: true
    });
    if (missing.length)
      await tx.auditEvent.create({
        data: {
          organizationId: org,
          actorUserId: actor,
          requestId,
          action: "IMPORT",
          entityType: "ACCOUNT",
          entityId: catalog.id,
          metadata: {
            operation: "BAS_PROVISION",
            version: catalog.version,
            inserted: missing.length,
            preserved: entries.length - missing.length,
            classificationConflicts: conflicts
          }
        }
      });
    return {
      configured: true,
      inserted: missing.length,
      preserved: entries.length - missing.length,
      conflicts
    };
  }
  async activationPreview(
    org: string,
    dto: ActivateCatalogDto,
    tx: Prisma.TransactionClient = this.db.prisma
  ) {
    const { organization, catalog } = await this.context(org, tx);
    if (!catalog) throw new ConflictException("BAS-katalogen är inte konfigurerad.");
    const entries = await tx.basAccountCatalog.findMany({
      where: { catalogVersionId: catalog.id, id: { in: dto.catalogAccountIds } },
      orderBy: { accountNumber: "asc" }
    });
    if (entries.length !== dto.catalogAccountIds.length)
      throw new NotFoundException("Alla markerade konton måste tillhöra företagets BAS-version.");
    const accounts = await tx.account.findMany({
      where: { organizationId: org, accountNumber: { in: entries.map((e) => e.accountNumber) } }
    });
    const existing = new Map(accounts.map((a) => [a.accountNumber, a]));
    const rows = entries.map((e) => {
      const a = existing.get(e.accountNumber);
      const reason = !e.isBookable
        ? "Kontot är inte bokföringsbart."
        : e.isK2Restricted && organization.accountingFramework !== "K3"
          ? BAS_FRAMEWORK_MESSAGE
          : a &&
              (a.type !== e.type ||
                a.normalBalance !== e.normalBalance ||
                (a.basCatalogAccountId && a.basCatalogAccountId !== e.id))
            ? "Befintlig lokal klassificering/proveniens kräver granskning."
            : null;
      return {
        id: e.id,
        number: e.accountNumber,
        name: e.officialName,
        alreadyActive: !!a?.isActive,
        allowed: !reason,
        reason
      };
    });
    return {
      selected: rows.length,
      alreadyActive: rows.filter((r) => r.alreadyActive).length,
      canAdd: rows.filter((r) => r.allowed && !r.alreadyActive).length,
      notAllowed: rows.filter((r) => !r.allowed).length,
      rows
    };
  }
  async activate(org: string, actor: string, dto: ActivateCatalogDto, requestId?: string) {
    return this.db.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM organizations WHERE id=${org}::uuid FOR UPDATE`;
        const preview = await this.activationPreview(org, dto, tx);
        if (preview.notAllowed)
          throw new BadRequestException({
            code: "BAS_ACTIVATION_REJECTED",
            message: "Inga konton lades till. Alla markerade konton måste vara tillåtna.",
            preview
          });
        const { catalog } = await this.context(org, tx);
        if (!catalog) throw new ConflictException("BAS-katalogen är inte konfigurerad.");
        if (!(await tx.organization.findUniqueOrThrow({ where: { id: org } })).basCatalogVersionId)
          await tx.organization.update({
            where: { id: org },
            data: { basCatalogVersionId: catalog.id }
          });
        for (const row of preview.rows.filter((r) => !r.alreadyActive)) {
          const entry = await tx.basAccountCatalog.findUniqueOrThrow({ where: { id: row.id } });
          const before = await tx.account.findUnique({
            where: {
              organizationId_accountNumber: { organizationId: org, accountNumber: row.number }
            }
          });
          const a = before
            ? await tx.account.update({ where: { id: before.id }, data: { isActive: true } })
            : await tx.account.create({
                data: {
                  organizationId: org,
                  accountNumber: row.number,
                  name: entry.officialName,
                  type: entry.type,
                  normalBalance: entry.normalBalance,
                  basCatalogAccountId: entry.id,
                  isActive: true
                }
              });
          await tx.auditEvent.create({
            data: {
              organizationId: org,
              actorUserId: actor,
              requestId,
              action: before ? "UPDATE" : "CREATE",
              entityType: "ACCOUNT",
              entityId: a.id,
              metadata: {
                operation: "BAS_ACTIVATE",
                catalogAccountId: entry.id,
                number: row.number,
                version: catalog.version,
                preservedLocalMetadata: !!before
              }
            }
          });
        }
        return { ...preview, activated: preview.canAdd };
      },
      { timeout: 30000 }
    );
  }
  async setFramework(org: string, actor: string, dto: FrameworkDto, requestId?: string) {
    try {
      return await this.db.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM organizations WHERE id=${org}::uuid FOR UPDATE`;
        const before = await tx.organization.findUniqueOrThrow({ where: { id: org } });
        if (dto.confirmation !== before.name)
          throw new BadRequestException("Bekräfta med företagets exakta namn.");
        if (dto.framework !== "K3") {
          const restricted = await tx.$queryRaw<
            { present: boolean }[]
          >`SELECT EXISTS(SELECT 1 FROM accounts a JOIN bas_account_catalog b ON b.account_number=a.account_number AND (b.id=a.bas_catalog_account_id OR b.catalog_version_id=COALESCE(${before.basCatalogVersionId}::uuid,(SELECT id FROM bas_catalog_versions WHERE is_default))) WHERE a.organization_id=${org}::uuid AND b.is_k2_restricted AND (a.is_active OR EXISTS(SELECT 1 FROM opening_balances ib WHERE ib.account_id=a.id) OR EXISTS(SELECT 1 FROM journal_lines l JOIN journal_entries j ON j.id=l.journal_entry_id WHERE l.account_id=a.id AND j.status='POSTED'))) AS present`;
          if (restricted[0]?.present && dto.framework !== before.accountingFramework)
            throw new ConflictException({
              code: "FRAMEWORK_REVIEW_REQUIRED",
              message:
                "Aktiva eller historiskt använda begränsade konton kräver granskad avstämning innan K-regelverket kan ändras."
            });
        }
        const updated = await tx.organization.update({
          where: { id: org },
          data: { accountingFramework: dto.framework }
        });
        await tx.auditEvent.create({
          data: {
            organizationId: org,
            actorUserId: actor,
            requestId,
            action: "UPDATE",
            entityType: "ORGANIZATION",
            entityId: org,
            beforeData: { accountingFramework: before.accountingFramework },
            afterData: { accountingFramework: updated.accountingFramework },
            metadata: { operation: "ACCOUNTING_FRAMEWORK_CHANGED" }
          }
        });
        return { framework: updated.accountingFramework };
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && ["P2004", "P2010"].includes(e.code))
        throw new ConflictException({
          code: "FRAMEWORK_REVIEW_REQUIRED",
          message:
            "K-regelverket kan inte ändras med aktiva eller historiskt använda begränsade konton. Granskad avstämning krävs; historiken ändras inte."
        });
      throw e;
    }
  }
}
