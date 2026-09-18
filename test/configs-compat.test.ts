import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createVeneraRuntime } from "../src/runtime";
import { loadVeneraConfigBySourceCode } from "../src/load-config";

interface ConfigIndexEntry {
  fileName: string;
  key: string;
  version: string;
}

const configsDirectory =
  process.env.VENERA_CONFIGS_DIR ||
  resolve(process.cwd(), "../Github/venera-configs");
const indexPath = resolve(configsDirectory, "index.json");

describe("real venera-configs compatibility", () => {
  it("loads every indexed config without running network init", () => {
    if (!existsSync(indexPath))
      throw new Error(
        `Missing venera-configs index: ${indexPath}. Set VENERA_CONFIGS_DIR before running test:compat.`,
      );
    const index = JSON.parse(
      readFileSync(indexPath, "utf8"),
    ) as ConfigIndexEntry[];
    const failures: string[] = [];
    for (const entry of index) {
      try {
        const sourceCode = readFileSync(
          resolve(configsDirectory, entry.fileName),
          "utf8",
        );
        const source = loadVeneraConfigBySourceCode(
          sourceCode,
          createVeneraRuntime(),
          false,
        );
        if (source.key !== entry.key)
          failures.push(
            `${entry.fileName}: key=${source.key}, expected=${entry.key}`,
          );
        if (!source.version)
          failures.push(`${entry.fileName}: source version is empty`);
      } catch (error) {
        failures.push(
          `${entry.fileName}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    expect(failures, failures.join("\n")).toEqual([]);
    expect(index.length).toBeGreaterThan(20);
  });
});
