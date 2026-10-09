import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@ledgerapp/db";

export const BAS_FRAMEWORK_MESSAGE =
  "Det här kontot är markerat i BAS som olämpligt för K2 och kan inte aktiveras för bokföring enligt K2. Begränsade konton kräver uttryckligen K3.";

export async function assertAccountNumberEligible(
  tx: Prisma.TransactionClient,
  organizationId: string,
  number: string,
  origin: string | null = null
) {
  const rows = await tx.$queryRaw<
    { eligible: boolean }[]
  >`SELECT bas_account_eligible(${organizationId}::uuid,${number},${origin}::uuid) AS eligible`;
  if (!rows[0]?.eligible)
    throw new BadRequestException({
      code: "BAS_ACCOUNT_INELIGIBLE",
      message: BAS_FRAMEWORK_MESSAGE
    });
}
export async function assertAccountsEligible(
  tx: Prisma.TransactionClient,
  organizationId: string,
  ids: string[]
) {
  if (!ids.length) return;
  const unique = [...new Set(ids)].sort();
  await tx.$queryRaw`SELECT id FROM organizations WHERE id=${organizationId}::uuid FOR SHARE`;
  const rows = await tx.$queryRaw<
    { id: string }[]
  >`SELECT id FROM accounts WHERE organization_id=${organizationId}::uuid AND id IN (${Prisma.join(unique.map((id) => Prisma.sql`${id}::uuid`))}) AND is_active AND bas_account_eligible(organization_id,account_number,bas_catalog_account_id) ORDER BY id FOR SHARE`;
  if (rows.length !== unique.length)
    throw new BadRequestException({
      code: "ACCOUNT_NOT_BOOKABLE",
      message:
        "Ett konto är inaktivt, saknas i organisationen eller är inte förenligt med valt K-regelverk."
    });
}
