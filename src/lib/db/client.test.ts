import { afterEach, describe, expect, it } from "vitest";
import { createDatabase, defaultDbPath } from "./client";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("defaultDbPath", () => {
  it("stores new Tritree data in .tritree by default", () => {
    delete process.env.TRITREE_DB_PATH;
    delete process.env.TREEABLE_DB_PATH;

    expect(defaultDbPath()).toMatch(/\.tritree\/tritree\.sqlite$/);
  });

  it("prefers TRITREE_DB_PATH while keeping TREEABLE_DB_PATH as a legacy fallback", () => {
    process.env.TRITREE_DB_PATH = "/tmp/new-tritree.sqlite";
    process.env.TREEABLE_DB_PATH = "/tmp/old-treeable.sqlite";

    expect(defaultDbPath()).toBe("/tmp/new-tritree.sqlite");

    delete process.env.TRITREE_DB_PATH;
    expect(defaultDbPath()).toBe("/tmp/old-treeable.sqlite");
  });
});

describe("database schema", () => {
  it("creates artifact storage and removes draft storage from the active schema", () => {
    const db = createDatabase(":memory:");
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>;
    const names = tables.map((table) => table.name);

    expect(names).toContain("artifacts");
    expect(names).not.toContain("draft_versions");
    expect(names).not.toContain("publish_packages");

    const artifactColumns = db.prepare("PRAGMA table_info(artifacts)").all() as Array<{ name: string }>;
    expect(artifactColumns.map((column) => column.name)).toEqual([
      "id",
      "session_id",
      "node_id",
      "type",
      "version",
      "payload_json",
      "source_artifact_ids_json",
      "created_at",
      "updated_at"
    ]);

    db.close();
  });
});
