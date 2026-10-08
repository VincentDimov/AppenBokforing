import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { OrganizationMembershipGuard } from "../organizations/organization-membership.guard";
import { DatabaseService } from "../database/database.service";
@Controller("organizations/:id/sie/history")
@UseGuards(OrganizationMembershipGuard)
export class SieHistoryController {
  constructor(private readonly db: DatabaseService) {}
  @Get()
  async history(@Param("id") org: string): Promise<unknown> {
    const [imports, exports] = await Promise.all([
      this.db.prisma.sieImport.findMany({
        where: { organizationId: org },
        take: 100,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          sourceFileName: true,
          sourceSha256: true,
          status: true,
          importedEntryCount: true,
          summary: true,
          createdAt: true,
          fiscalYear: { select: { id: true, name: true } },
          importedBy: { select: { displayName: true } }
        }
      }),
      this.db.prisma.sieExport.findMany({
        where: { organizationId: org },
        take: 100,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          status: true,
          exportedEntryCount: true,
          createdAt: true,
          fiscalYear: { select: { id: true, name: true } },
          exportedBy: { select: { displayName: true } }
        }
      })
    ]);
    return { imports, exports, limit: 100 };
  }
}
