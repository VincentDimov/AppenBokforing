import { z } from "zod";

export const nodeEnvironmentSchema = z.enum(["development", "test", "production"]);

/** Parses the single environment setting that every runtime can safely share. */
export function getNodeEnvironment(value: unknown): z.infer<typeof nodeEnvironmentSchema> {
  return nodeEnvironmentSchema.catch("development").parse(value);
}
