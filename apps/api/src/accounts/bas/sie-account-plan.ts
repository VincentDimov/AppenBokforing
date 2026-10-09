import { Prisma, type BasAccountCatalog } from "@ledgerapp/db";
import type { SieDocument } from "@ledgerapp/sie";

export interface SieAccountPlanRow {
  number: string;
  kind: "EXISTING" | "ACTIVATE_BAS" | "AVAILABLE_BAS" | "CREATE_CUSTOM" | "CONFLICT";
  activationRequired: boolean;
  reason: string | null;
}

/** Source classification is authoritative only for explicitly reviewed catalogs. */
export async function reviewSieAccounts(
  tx: Prisma.TransactionClient,
  org: string,
  document: SieDocument
) {
  const used = new Set([
    ...document.vouchers.flatMap((v) => v.transactions.map((l) => l.account)),
    ...document.openingBalances
      .filter((b) => !new Prisma.Decimal(b.amount).isZero())
      .map((b) => b.account)
  ]);
  const incomingAccounts = new Map(document.accounts.map((a) => [a.number, a]));
  const numbers = [...new Set([...incomingAccounts.keys(), ...used])];
  if (!numbers.length)
    return { catalog: new Map<string, BasAccountCatalog>(), rows: [] as SieAccountPlanRow[] };
  const organization = await tx.organization.findUniqueOrThrow({ where: { id: org } });
  const version =
    organization.basCatalogVersionId ??
    (await tx.basCatalogVersion.findFirst({ where: { isDefault: true }, select: { id: true } }))
      ?.id;
  const catalog = new Map(
    (version
      ? await tx.basAccountCatalog.findMany({
          where: { catalogVersionId: version, accountNumber: { in: numbers } }
        })
      : []
    ).map((a) => [a.accountNumber, a])
  );
  const existing = new Map(
    (
      await tx.account.findMany({ where: { organizationId: org, accountNumber: { in: numbers } } })
    ).map((a) => [a.accountNumber, a])
  );
  const rows = numbers.map((number) => {
    const incoming = incomingAccounts.get(number) ?? { number, type: undefined };
    const a = existing.get(incoming.number),
      b = catalog.get(incoming.number);
    const conflict =
      b &&
      used.has(incoming.number) &&
      (!b.isBookable || (b.isK2Restricted && organization.accountingFramework !== "K3"))
        ? "BAS account requires K3 or is not bookable."
        : b &&
            a &&
            !a.isActive &&
            used.has(number) &&
            (a.type !== b.type || a.normalBalance !== b.normalBalance)
          ? "Existing account classification requires review before BAS reactivation."
          : b &&
              !a &&
              incoming.type &&
              !(
                (incoming.type === "T" && b.type === "ASSET") ||
                (incoming.type === "S" && ["EQUITY", "LIABILITY"].includes(b.type)) ||
                (incoming.type === "I" && b.type === "REVENUE") ||
                (incoming.type === "K" && b.type === "EXPENSE")
              )
            ? "#KTYP conflicts with reviewed BAS classification."
            : !a && !b && incoming.number.startsWith("8") && !incoming.type
              ? "Custom class-8 account needs an explicit #KTYP; no revenue/expense guess is permitted."
              : null;
    const activationRequired = !!b && (!a || !a.isActive) && used.has(incoming.number);
    const kind: SieAccountPlanRow["kind"] = conflict
      ? "CONFLICT"
      : activationRequired
        ? "ACTIVATE_BAS"
        : a
          ? "EXISTING"
          : b
            ? "AVAILABLE_BAS"
            : "CREATE_CUSTOM";
    return { number: incoming.number, kind, activationRequired, reason: conflict };
  });
  return { catalog, rows };
}
