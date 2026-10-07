/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
// Real PostgreSQL + real S3. The barrier only delays completion after the
// real PUT; it does not emulate storage, transactions, locking or responses.
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto"),
  { createRequire } = require("node:module");
const path = require("node:path");
if (process.env.RUN_DISPOSABLE_RESTORE_DRILL !== "yes")
  throw new Error("Disposable opt-in required");
const bucket = "ledgerapp-race-" + randomUUID();
const sourceDatabase = process.env.RESTORE_DRILL_SOURCE_DB || "ledgerapp_drill";
if (!/^ledgerapp_drill(?:_[a-z0-9]+)?$/.test(sourceDatabase))
  throw new Error("Disposable source required");
Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL:
    "postgresql://ledgerapp_test:local_disposable_test_only@127.0.0.1:15440/" + sourceDatabase,
  JWT_ACCESS_SECRET: randomUUID() + randomUUID(),
  JWT_REFRESH_SECRET: randomUUID() + randomUUID(),
  ARGON2_MEMORY_COST: "8192",
  ARGON2_TIME_COST: "2",
  S3_ENDPOINT: "http://127.0.0.1:19500",
  S3_PUBLIC_ENDPOINT: "http://127.0.0.1:19500",
  S3_BUCKET: bucket,
  S3_ACCESS_KEY_ID: "disposable_drill_user",
  S3_SECRET_ACCESS_KEY: "disposable_drill_secret_only"
});
const apiRequire = createRequire(path.resolve(__dirname, "../apps/api/package.json"));
const { Test } = apiRequire("@nestjs/testing"),
  request = apiRequire("supertest");
const {
  S3Client,
  CreateBucketCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command
} = apiRequire("@aws-sdk/client-s3");
const { getSignedUrl } = apiRequire("@aws-sdk/s3-request-presigner");
const { PrismaClient } = require("../packages/db/dist"),
  { AppModule } = require("../apps/api/dist/app.module");
const { configureHttpApp } = require("../apps/api/dist/http/app-setup"),
  { OBJECT_STORAGE } = require("../apps/api/dist/attachments/object-storage");
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4QAAAABJRU5ErkJggg==",
  "base64"
);
async function main() {
  const db = new PrismaClient();
  const s3 = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: "eu-north-1",
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY
    }
  });
  let app, reached, release, gate;
  const storage = {
    async putObject(input) {
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: input.storageKey,
          Body: input.body,
          ContentType: input.contentType,
          Metadata: { sha256: input.sha256 }
        })
      );
      if (gate) {
        reached();
        await gate;
      }
    },
    async deleteObject(key) {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
    async createSignedDownloadUrl(input) {
      return {
        downloadUrl: await getSignedUrl(
          s3,
          new GetObjectCommand({ Bucket: bucket, Key: input.storageKey }),
          { expiresIn: 60 }
        ),
        expiresAt: new Date(Date.now() + 60000)
      };
    }
  };
  try {
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
    app = (
      await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(OBJECT_STORAGE)
        .useValue(storage)
        .compile()
    ).createNestApplication({ logger: false });
    configureHttpApp(app);
    await app.init();
    const owner = request.agent(app.getHttpServer()),
      foreign = request.agent(app.getHttpServer());
    for (const agent of [owner, foreign])
      await agent
        .post("/auth/register")
        .send({
          email: randomUUID() + "@example.test",
          displayName: "Race",
          password: "Disposable-storage-race-password!"
        })
        .expect(201);
    const org = (
      await owner
        .post("/organizations")
        .send({ name: "Storage race", slug: "race-" + randomUUID() })
        .expect(201)
    ).body;
    const fiscal = (
      await owner
        .post("/fiscal-years")
        .send({
          organizationId: org.id,
          name: "2026",
          startDate: "2026-01-01",
          endDate: "2026-12-31"
        })
        .expect(201)
    ).body;
    const series = await db.voucherSeries.create({
      data: { organizationId: org.id, fiscalYearId: fiscal.id, code: "A", name: "Race" }
    });
    const accounts = [];
    for (const [number, accountType] of [
      ["1930", "ASSET"],
      ["3010", "REVENUE"]
    ])
      accounts.push(
        (
          await owner
            .post("/accounts")
            .send({ organizationId: org.id, number, name: number, accountType })
            .expect(201)
        ).body.id
      );
    const draft = async (month) =>
      (
        await owner
          .post("/journal-entries")
          .send({
            organizationId: org.id,
            voucherSeriesId: series.id,
            transactionDate: `2026-${String(month).padStart(2, "0")}-10`,
            description: "Race",
            lines: [
              { accountId: accounts[0], debit: "10", credit: "0" },
              { accountId: accounts[1], debit: "0", credit: "10" }
            ]
          })
          .expect(201)
      ).body;
    let count = 0;
    for (const [index, kind] of ["post", "lock", "move"].entries()) {
      const entry = await draft(index + 1);
      const uploaded = new Promise((resolve) => {
        reached = resolve;
      });
      gate = new Promise((resolve) => {
        release = resolve;
      });
      const response = owner
        .post(`/journal-entries/${entry.id}/attachments`)
        .attach("file", png, { filename: "fixture.png", contentType: "image/png" })
        .then((result) => result);
      await uploaded;
      if (kind === "post")
        await owner
          .post(`/journal-entries/${entry.id}/post`)
          .send({ expectedVersion: 1 })
          .expect(201);
      if (kind === "lock") {
        const period = await db.accountingPeriod.findFirstOrThrow({
          where: { fiscalYearId: fiscal.id, periodNumber: index + 1 }
        });
        await owner
          .post(`/accounting-periods/${period.id}/lock`)
          .send({ organizationId: org.id, confirm: true })
          .expect(201);
      }
      if (kind === "move")
        await owner
          .patch(`/journal-entries/${entry.id}`)
          .send({ expectedVersion: 1, transactionDate: "2026-04-10" })
          .expect(200);
      release();
      gate = undefined;
      assert.equal((await response).status, 409, kind);
      assert.equal(await db.attachment.count({ where: { journalEntryId: entry.id } }), 0);
      assert.equal(
        await db.auditEvent.count({ where: { organizationId: org.id, entityType: "ATTACHMENT" } }),
        0
      );
      assert.equal(
        (await s3.send(new ListObjectsV2Command({ Bucket: bucket }))).Contents?.length || 0,
        0,
        "Failed upload object cleaned up by the real service"
      );
      count++;
    }
    const entry = await draft(5);
    const attachment = (
      await owner
        .post(`/journal-entries/${entry.id}/attachments`)
        .attach("file", png, { filename: "fixture.png", contentType: "image/png" })
        .expect(201)
    ).body;
    const url = (await owner.get(`/attachments/${attachment.id}/download`).expect(200)).body
      .downloadUrl;
    await foreign.get(`/attachments/${attachment.id}/download`).expect(404);
    await owner.post("/auth/logout").expect(204);
    await owner.get(`/attachments/${attachment.id}/download`).expect(401);
    assert.deepEqual(
      Buffer.from(await (await fetch(url)).arrayBuffer()),
      png,
      "Already issued bounded capabilities remain valid until expiry, independent of session"
    );
    console.log(
      JSON.stringify({
        realStorageRaces: "PASS",
        concurrentScenarios: count,
        cleanupVerified: true,
        foreignTenantDenied: true,
        loggedOutSigningDenied: true,
        previouslySignedUrlRevokedByLogout: false
      })
    );
  } finally {
    if (release) release();
    if (app) await app.close();
    await db.$disconnect();
    s3.destroy();
  }
}
main().catch((error) => {
  console.error(
    "Disposable real-storage races failed: " +
      String(error.message).replace(/postgresql:\/\/\S+/g, "[redacted]")
  );
  process.exitCode = 1;
});
