import type { Prisma } from "@ledgerapp/db";
export interface DimensionLabel {
  id: string;
  code: string;
  name: string;
}
export function dimensionLabel(
  snapshot: Prisma.JsonValue | null,
  current: DimensionLabel | null
): DimensionLabel | null {
  if (
    snapshot &&
    typeof snapshot === "object" &&
    !Array.isArray(snapshot) &&
    typeof snapshot.id === "string" &&
    typeof snapshot.code === "string" &&
    typeof snapshot.name === "string"
  )
    return { id: snapshot.id, code: snapshot.code, name: snapshot.name };
  return current;
}
