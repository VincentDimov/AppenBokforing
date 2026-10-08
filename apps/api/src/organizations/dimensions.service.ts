import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@ledgerapp/db";
import { DatabaseService } from "../database/database.service";
import { CreateDimensionDto, DimensionQueryDto, UpdateDimensionDto } from "./dimensions.dto";
type Kind = "project" | "costCenter";
@Injectable()
export class DimensionsService {
  constructor(private readonly db: DatabaseService) {}
  list(org: string, kind: Kind, query: DimensionQueryDto) {
    const where = {
      organizationId: org,
      ...(query.activeOnly === "true" ? { isActive: true } : {}),
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search, mode: "insensitive" as const } },
              { name: { contains: query.search, mode: "insensitive" as const } }
            ]
          }
        : {})
    };
    const args = { where, orderBy: { code: "asc" as const }, take: 1000 };
    return kind === "project"
      ? this.db.prisma.project.findMany(args)
      : this.db.prisma.costCenter.findMany(args);
  }
  async create(
    org: string,
    actor: string,
    kind: Kind,
    dto: CreateDimensionDto,
    requestId?: string
  ) {
    try {
      return await this.db.prisma.$transaction(async (tx) => {
        const args = { data: { ...dto, organizationId: org } };
        const dimension =
          kind === "project" ? await tx.project.create(args) : await tx.costCenter.create(args);
        await this.audit(tx, org, actor, kind, dimension.id, "CREATE", requestId);
        return dimension;
      });
    } catch (error) {
      this.conflict(error);
    }
  }
  async update(
    org: string,
    id: string,
    actor: string,
    kind: Kind,
    dto: UpdateDimensionDto,
    requestId?: string
  ) {
    try {
      return await this.db.prisma.$transaction(async (tx) => {
        if (kind === "project")
          await tx.$queryRaw`SELECT id FROM projects WHERE id=${id}::uuid AND organization_id=${org}::uuid FOR UPDATE`;
        else
          await tx.$queryRaw`SELECT id FROM cost_centers WHERE id=${id}::uuid AND organization_id=${org}::uuid FOR UPDATE`;
        const current =
          kind === "project"
            ? await tx.project.findFirst({ where: { id, organizationId: org } })
            : await tx.costCenter.findFirst({ where: { id, organizationId: org } });
        if (!current) throw new NotFoundException("Dimension not found.");
        const reference = kind === "project" ? { projectId: id } : { costCenterId: id };
        if (
          dto.code !== undefined &&
          dto.code !== current.code &&
          (await tx.journalLine.count({
            where: { ...reference, organizationId: org, journalEntry: { status: "POSTED" } }
          }))
        )
          throw new ConflictException({
            code: "DIMENSION_CODE_IN_USE",
            message: "Koden är låst efter bokföring."
          });
        if (
          dto.name !== undefined &&
          dto.name !== current.name &&
          (await tx.journalLine.count({
            where: {
              ...reference,
              organizationId: org,
              journalEntry: { status: "POSTED" },
              ...(kind === "project"
                ? { projectSnapshot: { equals: Prisma.DbNull } }
                : { costCenterSnapshot: { equals: Prisma.DbNull } })
            }
          }))
        )
          throw new ConflictException({
            code: "LEGACY_DIMENSION_LABEL_IN_USE",
            message: "Äldre bokföring saknar fryst etikett. Namnet kan inte ändras säkert."
          });
        const args = { where: { id }, data: dto };
        const updated =
          kind === "project" ? await tx.project.update(args) : await tx.costCenter.update(args);
        await this.audit(tx, org, actor, kind, id, "UPDATE", requestId);
        return updated;
      });
    } catch (error) {
      this.conflict(error);
    }
  }
  private async audit(
    tx: Prisma.TransactionClient,
    org: string,
    actor: string,
    kind: Kind,
    id: string,
    action: "CREATE" | "UPDATE",
    requestId?: string
  ) {
    const dimension =
      kind === "project"
        ? await tx.project.findUniqueOrThrow({ where: { id } })
        : await tx.costCenter.findUniqueOrThrow({ where: { id } });
    return tx.auditEvent.create({
      data: {
        organizationId: org,
        actorUserId: actor,
        entityType: kind === "project" ? "PROJECT" : "COST_CENTER",
        entityId: id,
        action,
        requestId,
        metadata: { code: dimension.code, name: dimension.name, isActive: dimension.isActive }
      }
    });
  }
  private conflict(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      throw new ConflictException({
        code: "DIMENSION_ALREADY_EXISTS",
        message: "Koden finns redan i organisationen."
      });
    throw error;
  }
}
