import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const temporaryDirectories: string[] = [];

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop()!, { recursive: true, force: true });
  }
});

describe("package import", () => {
  it("exports cookieJar from the package root", async () => {
    const runtime = await import("../src/index");

    expect(runtime.cookieJar.getCookieHeader).toBeTypeOf("function");
  });

  it("exports modifyImage from the package root", async () => {
    const runtime = await import("../src/index");

    expect(runtime.modifyImage).toBeTypeOf("function");
  });

  it("exports logger from the package root", async () => {
    const runtime = await import("../src/index");

    expect(runtime.logger.error).toBeTypeOf("function");
  });

  it("does not open or create the default database until its first operation", async () => {
    const directory = mkdtempSync(join(tmpdir(), "venera-lazy-database-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "assets", "database.db");
    const previousDataDirectory = process.env.VENERA_RUNTIME_DATA_DIR;

    try {
      process.env.VENERA_RUNTIME_DATA_DIR = directory;
      vi.resetModules();

      const runtime = await import("../src/index");
      expect(existsSync(databasePath)).toBe(false);

      expect(runtime.dbManager.query("SELECT 1 AS value")).toEqual([
        { value: 1 },
      ]);
      expect(existsSync(databasePath)).toBe(true);
      runtime.dbManager.close();
    } finally {
      if (previousDataDirectory === undefined) {
        delete process.env.VENERA_RUNTIME_DATA_DIR;
      } else {
        process.env.VENERA_RUNTIME_DATA_DIR = previousDataDirectory;
      }
    }
  });

  it("actively initializes the shared database at a caller-provided path", async () => {
    const directory = mkdtempSync(join(tmpdir(), "venera-active-database-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "shared.db");

    vi.resetModules();
    const runtime = await import("../src/index");
    expect(existsSync(databasePath)).toBe(false);

    const database = runtime.initializeDatabase(databasePath);
    expect(database).toBe(runtime.dbManager);
    expect(runtime.initializeDatabase(databasePath)).toBe(database);
    expect(existsSync(databasePath)).toBe(true);
    expect(
      database.query(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
        ["venera_runtime_locale"],
      ),
    ).toEqual([{ name: "venera_runtime_locale" }]);
    expect(() =>
      runtime.initializeDatabase(join(directory, "other.db")),
    ).toThrow("Database is already initialized");

    database.close();
  });
});
