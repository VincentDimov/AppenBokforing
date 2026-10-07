/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
// Report-only. Never deletes orphaned objects or accounting metadata.
const { createRequire } = require("node:module");
const { createHash } = require("node:crypto");
const path = require("node:path");
const apiRequire = createRequire(path.resolve(__dirname, "../apps/api/package.json"));
const { S3Client, ListObjectsV2Command, GetObjectCommand } = apiRequire("@aws-sdk/client-s3");
const { PrismaClient } = require("../packages/db/dist");
async function reconcile(db, s3, bucket) {
  const attachments = await db.attachment.findMany({
    select: { id: true, organizationId: true, storageKey: true, sha256: true, size: true }
  });
  const keys = new Set();
  let token;
  do {
    const page = await s3.send(
      new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }),
      { abortSignal: AbortSignal.timeout(10000) }
    );
    for (const object of page.Contents ?? []) if (object.Key) keys.add(object.Key);
    token = page.NextContinuationToken;
  } while (token);
  const missing = [],
    mismatched = [],
    unknown = [];
  for (const item of attachments) {
    if (!keys.delete(item.storageKey)) {
      missing.push(item.id);
      continue;
    }
    try {
      const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: item.storageKey }), {
        abortSignal: AbortSignal.timeout(10000)
      });
      if (
        object.ContentLength !== Number(item.size) ||
        (object.ContentLength ?? Infinity) > 10485760
      ) {
        mismatched.push(item.id);
        object.Body?.destroy?.();
        continue;
      }
      const bytes = await object.Body.transformToByteArray();
      if (
        createHash("sha256").update(bytes).digest("hex") !== item.sha256 ||
        (object.Metadata?.sha256 && object.Metadata.sha256 !== item.sha256)
      )
        mismatched.push(item.id);
    } catch {
      unknown.push(item.id);
    }
  }
  return {
    checked: attachments.length,
    missing,
    mismatched,
    unknown,
    orphans: [...keys].sort(),
    mode: "REPORT_ONLY"
  };
}
module.exports = { reconcile };
if (require.main === module) {
  const db = new PrismaClient();
  const s3 = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? "eu-north-1",
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY
    }
  });
  reconcile(db, s3, process.env.S3_BUCKET)
    .then((report) => {
      process.stdout.write(JSON.stringify(report) + "\n");
      if (report.missing.length || report.mismatched.length || report.unknown.length)
        process.exitCode = 1;
    })
    .catch(() => {
      process.stderr.write("Storage reconciliation unavailable; no changes made.\n");
      process.exitCode = 1;
    })
    .finally(async () => {
      await db.$disconnect();
      s3.destroy();
    });
}
