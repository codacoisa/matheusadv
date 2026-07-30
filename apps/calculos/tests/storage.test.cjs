const test = require("node:test");
const assert = require("node:assert/strict");
const storage = require("../assets/storage.js");

test("mescla registros pelo updatedAt mais recente", () => {
  const merged = storage.merge(
    { records: [{ id: "1", name: "antigo", updatedAt: "2026-01-01T00:00:00Z" }] },
    { records: [{ id: "1", name: "novo", updatedAt: "2026-02-01T00:00:00Z" }] },
  );
  assert.equal(merged.records[0].name, "novo");
});

test("tombstone posterior impede ressurreição no Gist", () => {
  const merged = storage.merge(
    { records: [{ id: "1", updatedAt: "2026-01-01T00:00:00Z" }] },
    { deleted: [{ id: "1", deletedAt: "2026-02-01T00:00:00Z" }] },
  );
  assert.equal(merged.records.length, 0);
});
