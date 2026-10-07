/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
// Explicit disposable local drill ONLY. Creates data; never drops a database or bucket.
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { createRequire } = require("node:module");
const { randomUUID, createHash } = require("node:crypto");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const sourceDatabase = process.env.RESTORE_DRILL_SOURCE_DB || "ledgerapp_drill";
if (!/^ledgerapp_drill(?:_[a-z0-9]+)?$/.test(sourceDatabase))
  throw new Error("Invalid disposable source database name.");
const source =
  "postgresql://ledgerapp_test:local_disposable_test_only@127.0.0.1:15438/" + sourceDatabase;
const target =
  "postgresql://ledgerapp_test:local_disposable_test_only@127.0.0.1:15439/ledgerapp_restore";
if (process.env.RUN_DISPOSABLE_RESTORE_DRILL !== "yes")
  throw new Error("Explicit RUN_DISPOSABLE_RESTORE_DRILL=yes is required.");
const sourceContainer = "ledgerapp-fas21-23-20261007",
  targetContainer = "ledgerapp-fas23-restore-20261007";
const suffix = randomUUID().slice(0, 8),
  bucket = "ledgerapp-drill-source-" + suffix,
  restoredBucket = "ledgerapp-drill-restored-" + suffix;
Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: source,
  S3_ENDPOINT: "http://127.0.0.1:19500",
  S3_PUBLIC_ENDPOINT: "http://127.0.0.1:19500",
  S3_BUCKET: bucket,
  S3_ACCESS_KEY_ID: "disposable_drill_user",
  S3_SECRET_ACCESS_KEY: "disposable_drill_secret_only",
  JWT_ACCESS_SECRET: randomUUID() + randomUUID(),
  JWT_REFRESH_SECRET: randomUUID() + randomUUID(),
  ARGON2_MEMORY_COST: "8192",
  ARGON2_TIME_COST: "2"
});
const apiRequire = createRequire(path.resolve(__dirname, "../apps/api/package.json"));
const { Test } = apiRequire("@nestjs/testing"),
  request = apiRequire("supertest");
const { S3Client, CreateBucketCommand, GetObjectCommand, PutObjectCommand } =
  apiRequire("@aws-sdk/client-s3");
const { PrismaClient } = require("../packages/db/dist");
const { AppModule } = require("../apps/api/dist/app.module");
const { configureHttpApp } = require("../apps/api/dist/http/app-setup");
const { reconcile } = require("./reconcile-storage.cjs");
async function main() {
  const started = Date.now();
  const db = new PrismaClient({ datasourceUrl: source }),
    restored = new PrismaClient({ datasourceUrl: target });
  const s3 = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: "eu-north-1",
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY
    }
  });
  let app;
  try {
    const targetTables = await restored.$queryRawUnsafe(
      "SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='public'"
    );
    assert.equal(
      targetTables[0].count,
      0,
      "Restore target must be empty; existing data must not be overwritten."
    );
    assert.equal(await db.organization.count(), 0, "Source drill database must be empty.");
    app = (
      await Test.createTestingModule({ imports: [AppModule] }).compile()
    ).createNestApplication({ logger: false });
    configureHttpApp(app);
    await app.init();
    const agent = request.agent(app.getHttpServer());
    const user = await agent
      .post("/auth/register")
      .send({
        email: "restore-" + suffix + "@example.test",
        displayName: "Restore fixture",
        password: "Disposable-restore-fixture-password!"
      })
      .expect(201);
    const org = (
      await agent
        .post("/organizations")
        .send({ name: "Restore fixture", slug: "restore-" + suffix })
        .expect(201)
    ).body;
    const fiscal = (
      await agent
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
      data: { organizationId: org.id, fiscalYearId: fiscal.id, code: "A", name: "Restore" }
    });
    const accountIds = [];
    for (const [number, accountType] of [
      ["1930", "ASSET"],
      ["2080", "EQUITY"],
      ["3010", "REVENUE"]
    ])
      accountIds.push(
        (
          await agent
            .post("/accounts")
            .send({ organizationId: org.id, number, name: number, accountType })
            .expect(201)
        ).body.id
      );
    await db.openingBalance.createMany({
      data: [
        {
          organizationId: org.id,
          fiscalYearId: fiscal.id,
          accountId: accountIds[0],
          debitAmount: "1000",
          creditAmount: "0"
        },
        {
          organizationId: org.id,
          fiscalYearId: fiscal.id,
          accountId: accountIds[1],
          debitAmount: "0",
          creditAmount: "1000"
        }
      ]
    });
    const entry = (
      await agent
        .post("/journal-entries")
        .send({
          organizationId: org.id,
          voucherSeriesId: series.id,
          transactionDate: "2026-01-10",
          description: "Restore accounting",
          lines: [
            { accountId: accountIds[0], debit: "10.01", credit: "0" },
            { accountId: accountIds[2], debit: "0", credit: "10.01" }
          ]
        })
        .expect(201)
    ).body;
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4QAAAABJRU5ErkJggg==",
      "base64"
    );
    const attachment = (
      await agent
        .post(`/journal-entries/${entry.id}/attachments`)
        .attach("file", png, { filename: "underlag.png", contentType: "image/png" })
        .expect(201)
    ).body;
    await agent
      .post(`/journal-entries/${entry.id}/post`)
      .send({ expectedVersion: entry.version })
      .expect(201);
    const period = await db.accountingPeriod.findFirstOrThrow({
      where: { organizationId: org.id, fiscalYearId: fiscal.id, periodNumber: 1 }
    });
    await agent
      .post(`/accounting-periods/${period.id}/lock`)
      .send({ organizationId: org.id, confirm: true })
      .expect(201);
    const download = (await agent.get(`/attachments/${attachment.id}/download`).expect(200)).body;
    const signed = await fetch(download.downloadUrl);
    assert.equal(signed.status, 200);
    assert.deepEqual(Buffer.from(await signed.arrayBuffer()), png);
    const sourceReport = await reconcile(db, s3, bucket);
    assert.deepEqual(sourceReport, {
      checked: 1,
      missing: [],
      mismatched: [],
      unknown: [],
      orphans: [],
      mode: "REPORT_ONLY"
    });
    await app.close();
    app = undefined;
    const dump = execFileSync(
      "docker",
      ["exec", sourceContainer, "pg_dump", "-U", "ledgerapp_test", "-d", sourceDatabase, "-Fc"],
      { maxBuffer: 32 * 1024 * 1024 }
    );
    const artifactDir = fs.mkdtempSync(path.join(os.tmpdir(), "ledgerapp-restore-drill-"));
    fs.writeFileSync(path.join(artifactDir, "database.dump"), dump);
    execFileSync(
      "docker",
      [
        "exec",
        "-i",
        targetContainer,
        "pg_restore",
        "-U",
        "ledgerapp_test",
        "-d",
        "ledgerapp_restore",
        "--no-owner",
        "--no-acl",
        "--exit-on-error"
      ],
      { input: dump }
    );
    await s3.send(new CreateBucketCommand({ Bucket: restoredBucket }));
    const record = await db.attachment.findUniqueOrThrow({ where: { id: attachment.id } });
    const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: record.storageKey }));
    const blob = Buffer.from(await object.Body.transformToByteArray());
    fs.writeFileSync(path.join(artifactDir, "attachment.bin"), blob);
    await s3.send(
      new PutObjectCommand({
        Bucket: restoredBucket,
        Key: record.storageKey,
        Body: blob,
        ContentType: object.ContentType,
        Metadata: object.Metadata
      })
    );
    assert.equal(createHash("sha256").update(blob).digest("hex"), record.sha256);
    for (const model of [
      "user",
      "session",
      "organization",
      "organizationMember",
      "account",
      "fiscalYear",
      "accountingPeriod",
      "voucherSeries",
      "journalEntry",
      "journalLine",
      "openingBalance",
      "auditEvent",
      "attachment"
    ])
      assert.equal(await restored[model].count(), await db[model].count(), model + " row count");
    assert.equal(
      (await restored.accountingPeriod.findUniqueOrThrow({ where: { id: period.id } })).status,
      "LOCKED"
    );
    assert.equal(
      (await restored.journalEntry.findUniqueOrThrow({ where: { id: entry.id } })).status,
      "POSTED"
    );
    assert.equal(await restored.openingBalance.count(), 2);
    assert.equal(await restored.user.count(), 1);
    assert.ok(user.body);
    const audit = await restored.auditEvent.findFirstOrThrow({ where: { organizationId: org.id } });
    for (const sql of [
      `UPDATE journal_lines SET debit_amount=11 WHERE journal_entry_id='${entry.id}'`,
      `DELETE FROM journal_entries WHERE id='${entry.id}'`,
      `UPDATE audit_events SET metadata='{}' WHERE id='${audit.id}'`,
      `DELETE FROM audit_events WHERE id='${audit.id}'`
    ])
      await assert.rejects(restored.$executeRawUnsafe(sql));
    const other = await restored.organization.create({
      data: { name: "Other restore tenant", slug: "other-" + suffix }
    });
    await assert.rejects(
      restored.openingBalance.create({
        data: {
          organizationId: other.id,
          fiscalYearId: fiscal.id,
          accountId: accountIds[0],
          debitAmount: "0",
          creditAmount: "0"
        }
      })
    );
    execFileSync(
      "docker",
      [
        "exec",
        "-i",
        targetContainer,
        "psql",
        "-U",
        "ledgerapp_test",
        "-d",
        "ledgerapp_restore",
        "-v",
        "ON_ERROR_STOP=1"
      ],
      { input: fs.readFileSync(path.resolve(__dirname, "../ops/database-runtime-role.sql")) }
    );
    for (const sql of [
      "DROP TABLE audit_events",
      "ALTER TABLE journal_lines DISABLE TRIGGER ALL",
      `UPDATE audit_events SET metadata='{}' WHERE id='${audit.id}'`
    ])
      await assert.rejects(
        restored.$transaction(async (tx) => {
          await tx.$executeRawUnsafe("SET LOCAL ROLE ledgerapp_runtime");
          await tx.$executeRawUnsafe(sql);
        })
      );
    const restoredReport = await reconcile(restored, s3, restoredBucket);
    assert.deepEqual(restoredReport, sourceReport);
    process.stdout.write(
      JSON.stringify({
        drill: "PASS",
        databaseAndBlobRestore: true,
        signedDownload: true,
        checksums: true,
        immutableTriggers: true,
        tenantForeignKeys: true,
        runtimeRoleDdlDenied: true,
        elapsedSeconds: (Date.now() - started) / 1000,
        artifactDir,
        buckets: [bucket, restoredBucket]
      }) + "\n"
    );
  } finally {
    if (app) await app.close();
    await db.$disconnect();
    await restored.$disconnect();
    s3.destroy();
  }
}
main().catch((error) => {
  process.stderr.write(
    "Disposable restore drill FAILED: " +
      String(error.message).replace(/postgresql:\/\/\S+/g, "[redacted]") +
      "\n"
  );
  process.exitCode = 1;
});
