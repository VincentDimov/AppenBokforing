import { isEmail } from "class-validator";
import type { PrismaClient } from "@ledgerapp/db";
import { validPrivilegedPassword, hashPassword } from "./password-policy";

export async function bootstrapPlatformAdmin(
  db: PrismaClient,
  env: NodeJS.ProcessEnv,
  operatorAuthorized: boolean,
  policy: { argon2MemoryCost: number; argon2TimeCost: number; argon2Parallelism: number }
) {
  if (!operatorAuthorized || env.MASTER_ADMIN_BOOTSTRAP_ENABLED !== "true")
    throw new Error("Explicit operator authorization and enabled bootstrap are required.");
  const email = env.MASTER_ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  const password = env.MASTER_ADMIN_BOOTSTRAP_PASSWORD;
  if (
    !email ||
    !isEmail(email) ||
    email.length > 320 ||
    !password ||
    !validPrivilegedPassword(password)
  )
    throw new Error("Invalid bootstrap email/password configuration.");
  const passwordHash = await hashPassword(password, policy);
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(36036,1)`;
      const completed = await tx.platformAdminBootstrap.findUnique({ where: { id: 1 } });
      if (completed) return { status: "ALREADY_COMPLETED" as const };
      if (await tx.user.findUnique({ where: { email }, select: { id: true } }))
        throw new Error("Bootstrap refuses to elevate an existing account.");
      if (await tx.platformAdministrator.count())
        throw new Error("Platform administration already exists; bootstrap is unavailable.");
      const user = await tx.user.create({
        data: { email, displayName: "Master Admin", passwordHash, mustChangePassword: true },
        select: { id: true }
      });
      await tx.platformAdministrator.create({
        data: { userId: user.id, role: "SUPER_ADMIN", mustChangePassword: true }
      });
      await tx.platformAdminBootstrap.create({ data: { id: 1, userId: user.id } });
      await tx.platformAdminAuditEvent.create({
        data: {
          actorUserId: user.id,
          targetType: "PLATFORM_ADMINISTRATOR",
          targetId: user.id,
          action: "MASTER_ADMIN_BOOTSTRAPPED",
          afterMetadata: { role: "SUPER_ADMIN", securitySetupRequired: true }
        }
      });
      return { status: "CREATED" as const };
    },
    { maxWait: 10000, timeout: 15000 }
  );
}
