const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { reconcile } = require("../scripts/reconcile-storage.cjs");
test("report-only reconciliation reports missing, orphan, mismatch and unavailable blobs", async () => {
  const bytes = Buffer.from("fixture");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const rows = ["good", "missing", "mismatch", "unavailable"].map((id) => ({
    id,
    storageKey: id,
    size: 7n,
    sha256
  }));
  const calls = [];
  const storage = {
    async send(command) {
      calls.push(command.constructor.name);
      if (command.constructor.name === "ListObjectsV2Command")
        return { Contents: ["good", "mismatch", "unavailable", "orphan"].map((Key) => ({ Key })) };
      if (command.input.Key === "unavailable") throw new Error("fixture failure");
      return {
        ContentLength: 7,
        Body: {
          transformToByteArray: async () =>
            command.input.Key === "mismatch" ? Buffer.from("changed") : bytes
        }
      };
    }
  };
  assert.deepEqual(
    await reconcile({ attachment: { findMany: async () => rows } }, storage, "fixture"),
    {
      checked: 4,
      missing: ["missing"],
      mismatched: ["mismatch"],
      unknown: ["unavailable"],
      orphans: ["orphan"],
      mode: "REPORT_ONLY"
    }
  );
  assert.ok(calls.every((name) => ["ListObjectsV2Command", "GetObjectCommand"].includes(name)));
});
