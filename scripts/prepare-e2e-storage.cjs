/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
// Test-only local provisioning. Never accepts remote endpoints or arbitrary buckets.
const { assertLocalStack } = require("./e2e-safety.cjs");
const { createRequire } = require("node:module"),
  path = require("node:path");
assertLocalStack(process.env);
const endpoint = new URL(process.env.S3_ENDPOINT || "invalid:");
if (
  endpoint.origin !== "http://127.0.0.1:19500" ||
  !/^ledgerapp-e2e-[a-z0-9-]+$/.test(process.env.S3_BUCKET || "")
)
  throw new Error("Dedicated loopback E2E storage and bucket required.");
const r = createRequire(path.resolve(__dirname, "../apps/api/package.json"));
const { S3Client, HeadBucketCommand, CreateBucketCommand } = r("@aws-sdk/client-s3");
const client = new S3Client({
  endpoint: endpoint.origin,
  region: "eu-north-1",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY
  }
});
async function main() {
  try {
    for (let attempt = 0; attempt < 20; attempt++) {
      try {
        await client.send(new HeadBucketCommand({ Bucket: process.env.S3_BUCKET }));
        console.log("Private disposable E2E bucket ready.");
        return;
      } catch (error) {
        if (error.$metadata?.httpStatusCode === 404) {
          await client.send(new CreateBucketCommand({ Bucket: process.env.S3_BUCKET }));
          console.log("Private disposable E2E bucket created.");
          return;
        }
        if (error.$metadata?.httpStatusCode === 403 || attempt === 19) throw error;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  } finally {
    client.destroy();
  }
}
main().catch(() => {
  console.error("Disposable E2E storage preparation failed (credentials redacted).");
  process.exitCode = 1;
});
