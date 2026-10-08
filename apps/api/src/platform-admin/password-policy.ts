import argon2 from "argon2";

export function validPrivilegedPassword(password: string): boolean {
  return (
    password.length >= 14 &&
    password.length <= 128 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /[0-9]/.test(password)
  );
}

export async function hashPassword(
  password: string,
  policy: { argon2MemoryCost: number; argon2TimeCost: number; argon2Parallelism: number }
) {
  return argon2.hash(password, {
    memoryCost: policy.argon2MemoryCost,
    timeCost: policy.argon2TimeCost,
    parallelism: policy.argon2Parallelism,
    type: argon2.argon2id
  });
}
