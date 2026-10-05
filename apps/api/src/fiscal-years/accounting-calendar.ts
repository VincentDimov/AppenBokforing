import { ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@ledgerapp/db";

/** Every accounting writer takes the same calendar locks as period locking. */
export async function requireOpenCalendar(
  tx: Prisma.TransactionClient,
  organizationId: string,
  fiscalYearId: string,
  accountingPeriodId?: string
) {
  const years = await tx.$queryRaw<{ status: string }[]>`
    SELECT status FROM fiscal_years
    WHERE id = ${fiscalYearId}::uuid AND organization_id = ${organizationId}::uuid FOR UPDATE
  `;
  if (!years[0]) throw new NotFoundException("Fiscal year not found.");
  if (years[0].status !== "OPEN") throw new ConflictException("Fiscal year is closed.");
  if (!accountingPeriodId) return;
  const periods = await tx.$queryRaw<{ status: string }[]>`
    SELECT status FROM accounting_periods
    WHERE id = ${accountingPeriodId}::uuid AND organization_id = ${organizationId}::uuid
      AND fiscal_year_id = ${fiscalYearId}::uuid FOR UPDATE
  `;
  if (!periods[0]) throw new NotFoundException("Accounting period not found.");
  if (periods[0].status !== "OPEN") throw new ConflictException("Accounting period is locked.");
}
