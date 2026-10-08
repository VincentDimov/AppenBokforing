import { randomBytes } from "node:crypto";
import { PlatformAdminRole, type PrismaClient } from "@ledgerapp/db";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { hasPlatformPermission, type PlatformPermission } from "./platform-admin.permissions";
import { mfaEncryptionKey, encryptMfaSecret, decryptMfaSecret } from "./mfa-crypto";
import { validPrivilegedPassword } from "./password-policy";
import { AdminListDto, AdminGrantDto } from "./platform-admin.dto";
import { userSort, organizationSort } from "./platform-admin.service";
import { bootstrapPlatformAdmin } from "./bootstrap";

describe("platform-admin security primitives", () => {
  const roles = Object.values(PlatformAdminRole);
  const permissions: PlatformPermission[] = ["READ", "WRITE", "GRANTS"];
  it.each(roles.flatMap((role) => permissions.map((permission) => ({ role, permission }))))(
    "$role / $permission follows explicit least privilege",
    ({ role, permission }) => {
      expect(hasPlatformPermission(role, permission)).toBe(
        permission === "READ" ||
          role === "SUPER_ADMIN" ||
          (permission === "WRITE" && role === "PLATFORM_ADMIN")
      );
    }
  );
  it("never interprets company ADMIN or email as a platform role", () => {
    expect(hasPlatformPermission("ADMIN" as PlatformAdminRole, "READ")).toBe(false);
    expect(hasPlatformPermission("admin@admin.com" as PlatformAdminRole, "GRANTS")).toBe(false);
  });
  it("encrypts MFA with authenticated tenant/user-bound AES-GCM", () => {
    const key = randomBytes(32),
      secret = "ONLY_SYNTHETIC_MFA_SECRET",
      cipher = encryptMfaSecret(secret, key, "user-a", "key-v1");
    expect(cipher).not.toContain(secret);
    expect(decryptMfaSecret(cipher, key, "user-a", "key-v1")).toBe(secret);
    expect(() => decryptMfaSecret(cipher, key, "user-b", "key-v1")).toThrow();
    expect(() => decryptMfaSecret(cipher, key, "user-a", "key-v2")).toThrow();
    expect(() => decryptMfaSecret(cipher, randomBytes(32), "user-a", "key-v1")).toThrow();
  });
  it("uses fresh IVs and refuses ciphertext tampering", () => {
    const key = randomBytes(32),
      a = encryptMfaSecret("test", key, "user", "v1"),
      b = encryptMfaSecret("test", key, "user", "v1");
    expect(a).not.toBe(b);
    const parts = a.split(".");
    parts[2] = Buffer.from("tampered").toString("base64");
    expect(() => decryptMfaSecret(parts.join("."), key, "user", "v1")).toThrow();
  });
  it.each([
    undefined,
    "",
    "short",
    "a".repeat(44),
    randomBytes(31).toString("base64"),
    randomBytes(33).toString("base64")
  ])("fails closed on malformed MFA key %s", (key) => expect(mfaEncryptionKey(key)).toBeNull());
  it("accepts exactly canonical base64 encoding of 32 random bytes", () => {
    const key = randomBytes(32);
    expect(mfaEncryptionKey(key.toString("base64"))).toEqual(key);
  });
  it.each([
    "short",
    "lowercasepassword123",
    "UPPERCASEPASSWORD123",
    "NoDigitsInThisPassword",
    "Aa1" + "x".repeat(126)
  ])("rejects weak temporary/admin passwords", (password) =>
    expect(validPrivilegedPassword(password)).toBe(false)
  );
  it("accepts a strong test-only passphrase", () =>
    expect(validPrivilegedPassword("Synthetic-fixture-password-2026!")).toBe(true));
  it.each([
    { page: 0 },
    { page: 201 },
    { pageSize: 1000 },
    { sort: "name;DROP TABLE users" },
    { role: "SUPER_ADMIN" },
    { organizationId: "not-a-uuid" },
    { fromDate: "not-a-date" }
  ])("rejects unsupported list input %j", async (data) =>
    expect((await validate(plainToInstance(AdminListDto, data))).length).toBeGreaterThan(0)
  );
  it("validates page defaults and bounded page sizes", async () =>
    expect(await validate(plainToInstance(AdminListDto, {}))).toHaveLength(0));
  it("requires a real boolean, UUID and explicit role for grants", async () =>
    expect(
      (
        await validate(
          plainToInstance(AdminGrantDto, {
            userId: "bad",
            role: "OWNER",
            isActive: "false",
            confirmation: "x"
          })
        )
      ).length
    ).toBeGreaterThan(0));
  it.each(["name_asc", "name_desc", "oldest", "newest", "last_login", "company"])(
    "whitelists stable user sorting %s",
    (sort) => expect(userSort(sort).sql).toContain("u.id ASC")
  );
  it.each(["name_asc", "name_desc", "oldest", "newest", "members_desc", "members_asc", "updated"])(
    "whitelists stable company sorting %s",
    (sort) => expect(organizationSort(sort).sql).toContain("o.id ASC")
  );
  it("rejects interpolation into sort identifiers", () => {
    expect(() => userSort("display_name DESC;--")).toThrow();
    expect(() => organizationSort("u.email")).toThrow();
  });
});

describe("operator-only bootstrap", () => {
  const policy = { argon2MemoryCost: 8192, argon2TimeCost: 2, argon2Parallelism: 1 };
  const configured = {
    MASTER_ADMIN_BOOTSTRAP_ENABLED: "true",
    MASTER_ADMIN_BOOTSTRAP_EMAIL: "bootstrap-fixture@example.test",
    MASTER_ADMIN_BOOTSTRAP_PASSWORD: "Synthetic-bootstrap-fixture-2026!"
  };
  it.each([
    { authorized: false, env: configured },
    { authorized: true, env: { ...configured, MASTER_ADMIN_BOOTSTRAP_ENABLED: "false" } },
    { authorized: true, env: { ...configured, MASTER_ADMIN_BOOTSTRAP_PASSWORD: "weak" } },
    { authorized: true, env: { ...configured, MASTER_ADMIN_BOOTSTRAP_EMAIL: "invalid" } }
  ])(
    "fails closed before touching a database for invalid authorization/configuration",
    async ({ authorized, env }) => {
      const transaction = jest.fn();
      await expect(
        bootstrapPlatformAdmin(
          { $transaction: transaction } as unknown as PrismaClient,
          env,
          authorized,
          policy
        )
      ).rejects.toThrow();
      expect(transaction).not.toHaveBeenCalled();
    }
  );
  it("never upgrades an existing ordinary email account", async () => {
    const create = jest.fn();
    const tx = {
      $executeRaw: jest.fn(),
      platformAdminBootstrap: { findUnique: jest.fn().mockResolvedValue(null) },
      user: { findUnique: jest.fn().mockResolvedValue({ id: "existing-account" }), create },
      platformAdministrator: { create }
    };
    const db = {
      $transaction: (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)
    };
    await expect(
      bootstrapPlatformAdmin(db as unknown as PrismaClient, configured, true, policy)
    ).rejects.toThrow("refuses to elevate");
    expect(create).not.toHaveBeenCalled();
  });
});
