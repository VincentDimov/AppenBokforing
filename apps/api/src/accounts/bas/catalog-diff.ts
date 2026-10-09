import type { CatalogRow } from "./catalog-validation";

/** A review aid only. Never mutates catalog identity or tenant accounts. */
export function compareCatalogs(before: CatalogRow[], after: CatalogRow[]) {
  const old = new Map(before.map((row) => [row.number, row])),
    next = new Map(after.map((row) => [row.number, row]));
  const changed = after.flatMap((row) => {
    const previous = old.get(row.number);
    if (!previous) return [];
    const fields = (Object.keys(row) as (keyof CatalogRow)[]).filter(
      (key) => key !== "sourcePosition" && row[key] !== previous[key]
    );
    return fields.length
      ? [
          {
            number: row.number,
            fields,
            requiresAccountingReview: fields.some((key) =>
              [
                "type",
                "normalBalance",
                "isK2Restricted",
                "isBookable",
                "parentAccountNumber"
              ].includes(key)
            )
          }
        ]
      : [];
  });
  return {
    added: after
      .filter((row) => !old.has(row.number))
      .map((row) => row.number)
      .sort(),
    removed: before
      .filter((row) => !next.has(row.number))
      .map((row) => row.number)
      .sort(),
    changed
  };
}
