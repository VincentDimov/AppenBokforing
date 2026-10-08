import { BadRequestException, Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { Prisma } from "@ledgerapp/db";
import { DatabaseService } from "../database/database.service";
import { OrganizationMembershipGuard } from "../organizations/organization-membership.guard";
import { ArchiveQueryDto } from "./attachment-archive.dto";
@Controller("organizations/:id/attachments")
@UseGuards(OrganizationMembershipGuard)
export class AttachmentArchiveController {
  constructor(private readonly db: DatabaseService) {}
  @Get()
  async list(@Param("id") org: string, @Query() query: ArchiveQueryDto): Promise<unknown> {
    if (query.search && query.search.trim().length < 3)
      throw new BadRequestException("Sök med minst tre tecken.");
    if (query.fromDate && query.toDate && query.fromDate > query.toDate)
      throw new BadRequestException("Från datum måste vara före till datum.");
    let cursor: { org: string; createdAt: string; id: string } | undefined;
    if (query.cursor) {
      try {
        cursor = JSON.parse(Buffer.from(query.cursor, "base64url").toString("utf8"));
        if (
          !cursor ||
          cursor.org !== org ||
          typeof cursor.id !== "string" ||
          !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(cursor.id) ||
          typeof cursor.createdAt !== "string" ||
          !Number.isFinite(Date.parse(cursor.createdAt))
        )
          throw new Error();
      } catch {
        throw new BadRequestException("Ogiltig arkivmarkör.");
      }
    }
    const limit = query.limit ?? 50;
    const where: Prisma.AttachmentWhereInput = {
      organizationId: org,
      ...(query.hasVoucher === "true" ? { journalEntryId: { not: null } } : {}),
      ...(query.hasVoucher === "false" ? { journalEntryId: null } : {}),
      ...(query.search
        ? { originalName: { contains: query.search.trim(), mode: "insensitive" } }
        : {}),
      ...(query.mimeType ? { mimeType: query.mimeType } : {}),
      ...(query.uploadedBy ? { uploadedById: query.uploadedBy } : {}),
      ...(query.fromDate || query.toDate
        ? {
            createdAt: {
              ...(query.fromDate ? { gte: new Date(query.fromDate) } : {}),
              ...(query.toDate ? { lt: new Date(new Date(query.toDate).getTime() + 86400000) } : {})
            }
          }
        : {}),
      ...(query.status || query.series || query.voucherNumber
        ? {
            journalEntry: {
              organizationId: org,
              ...(query.status ? { status: query.status } : {}),
              ...(query.series
                ? { voucherSeries: { organizationId: org, code: query.series } }
                : {}),
              ...(query.voucherNumber ? { voucherNumber: query.voucherNumber } : {})
            }
          }
        : {}),
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: new Date(cursor.createdAt) } },
              { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } }
            ]
          }
        : {})
    };
    const rows = await this.db.prisma.attachment.findMany({
      where,
      take: limit + 1,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        originalName: true,
        createdAt: true,
        mimeType: true,
        kind: true,
        size: true,
        sha256: true,
        uploadedBy: { select: { id: true, displayName: true } },
        journalEntry: {
          select: {
            id: true,
            status: true,
            voucherNumber: true,
            entryDate: true,
            description: true,
            voucherSeries: { select: { code: true } }
          }
        }
      }
    });
    const items = rows.slice(0, limit),
      last = items.at(-1);
    return {
      items: items.map((row) => ({ ...row, size: row.size.toString() })),
      nextCursor:
        rows.length > limit && last
          ? Buffer.from(
              JSON.stringify({ org, createdAt: last.createdAt.toISOString(), id: last.id })
            ).toString("base64url")
          : null
    };
  }
}
