import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@ledgerapp/db";
import { DatabaseService } from "../database/database.service";
import { SaveTemplateDto, TemplateLineDto, TemplateQueryDto } from "./posting-templates.dto";

const include = {
  lines: {
    orderBy: { lineNumber: "asc" as const },
    include: {
      account: { select: { id: true, accountNumber: true, name: true, isActive: true } },
      project: { select: { id: true, code: true, name: true, isActive: true } },
      costCenter: { select: { id: true, code: true, name: true, isActive: true } }
    }
  }
} satisfies Prisma.PostingTemplateInclude;

@Injectable()
export class PostingTemplatesService {
  constructor(private readonly db: DatabaseService) {}
  list(org: string, query: TemplateQueryDto) {
    return this.db.prisma.postingTemplate.findMany({
      where: {
        organizationId: org,
        ...(query.activeOnly === "true" ? { isActive: true } : {}),
        ...(query.search
          ? {
              OR: [
                { name: { contains: query.search, mode: "insensitive" as const } },
                { code: { contains: query.search, mode: "insensitive" as const } }
              ]
            }
          : {})
      },
      include,
      take: 200,
      orderBy: [{ name: "asc" }, { id: "asc" }]
    });
  }
  async find(org: string, id: string, tx: Prisma.TransactionClient = this.db.prisma) {
    const template = await tx.postingTemplate.findFirst({
      where: { organizationId: org, id },
      include
    });
    if (!template)
      throw new NotFoundException({
        code: "POSTING_TEMPLATE_NOT_FOUND",
        message: "Konteringsmallen finns inte."
      });
    return template;
  }
  private async validate(
    tx: Prisma.TransactionClient,
    org: string,
    lines: Pick<TemplateLineDto, "accountId" | "projectId" | "costCenterId">[],
    requireActive = true
  ) {
    // Locks keep reference validation consistent with concurrent deactivation.
    const accounts = [...new Set(lines.map((line) => line.accountId))].sort();
    await tx.$queryRaw`SELECT id FROM accounts WHERE organization_id=${org}::uuid AND id IN (${Prisma.join(accounts.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY id FOR SHARE`;
    const valid = await tx.account.count({
      where: {
        organizationId: org,
        id: { in: accounts },
        ...(requireActive ? { isActive: true } : {})
      }
    });
    if (valid !== accounts.length)
      throw new ConflictException({
        code: "POSTING_TEMPLATE_ACCOUNT_INACTIVE",
        message: "Alla konton måste vara aktiva och tillhöra organisationen."
      });
    for (const kind of ["project", "costCenter"] as const) {
      const ids = [
        ...new Set(
          lines
            .map((line) => (kind === "project" ? line.projectId : line.costCenterId))
            .filter((id): id is string => !!id)
        )
      ].sort();
      if (!ids.length) continue;
      const table = kind === "project" ? Prisma.sql`projects` : Prisma.sql`cost_centers`;
      await tx.$queryRaw`SELECT id FROM ${table} WHERE organization_id=${org}::uuid AND id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY id FOR SHARE`;
      const args = {
        where: {
          organizationId: org,
          id: { in: ids },
          ...(requireActive ? { isActive: true } : {})
        }
      };
      const count =
        kind === "project" ? await tx.project.count(args) : await tx.costCenter.count(args);
      if (count !== ids.length)
        throw new ConflictException({
          code: "POSTING_TEMPLATE_DIMENSION_INVALID",
          message: "Projekt och kostnadsställen måste vara aktiva och tillhöra organisationen."
        });
    }
  }
  async save(org: string, actor: string, dto: SaveTemplateDto, id?: string, requestId?: string) {
    try {
      return await this.db.prisma.$transaction(async (tx) => {
        if (id) {
          await tx.$queryRaw`SELECT id FROM posting_templates WHERE organization_id=${org}::uuid AND id=${id}::uuid FOR UPDATE`;
          await this.find(org, id, tx);
        }
        await this.validate(tx, org, dto.lines, dto.isActive !== false);
        const { lines, ...header } = dto;
        const data = { ...header, organizationId: org };
        const template = id
          ? await tx.postingTemplate.update({ where: { id }, data })
          : await tx.postingTemplate.create({ data: { ...data, createdById: actor } });
        if (id)
          await tx.postingTemplateLine.deleteMany({
            where: { postingTemplateId: id, organizationId: org }
          });
        await tx.postingTemplateLine.createMany({
          data: lines.map((line, index) => ({
            ...line,
            amount: line.amount == null ? null : new Prisma.Decimal(line.amount),
            organizationId: org,
            postingTemplateId: template.id,
            lineNumber: index + 1
          }))
        });
        await tx.auditEvent.create({
          data: {
            organizationId: org,
            actorUserId: actor,
            action: id ? "UPDATE" : "CREATE",
            entityType: "POSTING_TEMPLATE",
            entityId: template.id,
            requestId: requestId?.slice(0, 100),
            metadata: { code: dto.code, isActive: template.isActive, lineCount: lines.length }
          }
        });
        return this.find(org, template.id, tx);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
        throw new ConflictException({
          code: "POSTING_TEMPLATE_CODE_EXISTS",
          message: "Mallkoden används redan."
        });
      throw error;
    }
  }
  async apply(org: string, id: string) {
    return this.db.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM posting_templates WHERE organization_id=${org}::uuid AND id=${id}::uuid FOR SHARE`;
      const template = await this.find(org, id, tx);
      if (!template.isActive)
        throw new ConflictException({
          code: "POSTING_TEMPLATE_INACTIVE",
          message: "Mallen är inaktiv. Välj en aktiv mall."
        });
      await this.validate(tx, org, template.lines);
      return {
        description: template.defaultText ?? template.name,
        voucherSeriesCode: template.voucherSeriesCode,
        lines: template.lines.map((line) => ({
          account: {
            id: line.account.id,
            number: line.account.accountNumber,
            name: line.account.name
          },
          description: line.description ?? "",
          debit: line.side === "DEBIT" ? (line.amount?.toFixed(2) ?? "") : "0.00",
          credit: line.side === "CREDIT" ? (line.amount?.toFixed(2) ?? "") : "0.00",
          projectCode: line.project?.code ?? "",
          costCenterCode: line.costCenter?.code ?? ""
        }))
      };
    });
  }
}
