/** Returns true only for values that are neither null nor undefined. */
export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}
