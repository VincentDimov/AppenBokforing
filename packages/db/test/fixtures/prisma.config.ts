import { defineConfig } from "prisma/config";

// Trusted static CLI configuration, not user-supplied application input.
export default defineConfig({
  schema: "../../prisma/schema.prisma",
  migrations: { path: "../../prisma/migrations" }
});
