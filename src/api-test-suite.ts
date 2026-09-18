import { createUuid } from "./uuid";
import {
  decodeText,
  encodeText,
  httpRequest,
  openDatabase,
  getRuntimeEnvironment,
  runtimeFiles,
  runtimeImages,
} from "./platform";
import { VENERA_APP_VERSION, VENERA_RUNTIME_PLATFORM } from "./constants";
import { modifyImage } from "./modify-image";

export interface RuntimeTestResult {
  name: string;
  status: "passed" | "failed" | "skipped";
  durationMs: number;
  detail?: string;
}

export interface RuntimeTestReport {
  schemaVersion: 1;
  runtime: string;
  veneraVersion: string;
  platform: string;
  startedAt: string;
  durationMs: number;
  totals: { passed: number; failed: number; skipped: number };
  results: RuntimeTestResult[];
}

export interface RuntimeTestOptions {
  networkUrl?: string;
  onProgress?: (
    completed: number,
    total: number,
    result: RuntimeTestResult,
  ) => void;
}

/** 轻量 204 连通性端点；调用方仍可通过 `networkUrl` 覆盖。 */
export const DEFAULT_NETWORK_TEST_URL =
  "https://connectivitycheck.platform.hicloud.com/generate_204";

interface RuntimeTestCase {
  name: string;
  run(): Promise<void> | void;
  skip?: string;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function bytesToHex(value: ArrayBuffer | ArrayBufferView): string {
  const bytes =
    value instanceof ArrayBuffer
      ? new Uint8Array(value)
      : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function createTestCases(options: RuntimeTestOptions): RuntimeTestCase[] {
  const fileRoot = "runtime-test-output/api-contract";
  const databasePath = `${fileRoot}/contract.db`;
  return [
    {
      name: "metadata matches Venera 1.6.3 on iOS",
      run() {
        assert(
          VENERA_APP_VERSION === "1.6.3",
          `Unexpected Venera version: ${VENERA_APP_VERSION}`,
        );
        assert(
          VENERA_RUNTIME_PLATFORM === "ios",
          `Unexpected platform: ${VENERA_RUNTIME_PLATFORM}`,
        );
      },
    },
    {
      name: "UTF-8 encode/decode",
      run() {
        const encoded = encodeText("Venera 漫画 📚", "utf8");
        assert(
          decodeText(encoded, "utf8") === "Venera 漫画 📚",
          "UTF-8 round trip failed",
        );
        assert(
          bytesToHex(encodeText("A中", "utf8")) === "41e4b8ad",
          "UTF-8 bytes differ from contract",
        );
      },
    },
    {
      name: "GBK encode/decode",
      run() {
        const encoded = encodeText("中文", "gbk");
        assert(
          bytesToHex(encoded) === "d6d0cec4",
          `Unexpected GBK bytes: ${bytesToHex(encoded)}`,
        );
        assert(decodeText(encoded, "gbk") === "中文", "GBK round trip failed");
      },
    },
    {
      name: "file text and binary round trip",
      run() {
        runtimeFiles.delete(fileRoot);
        assert(runtimeFiles.mkdir(fileRoot), "Failed to create test directory");
        assert(
          runtimeFiles.writeText(`${fileRoot}/text.txt`, "line 1\n中文"),
          "Failed to write text file",
        );
        assert(
          runtimeFiles.readText(`${fileRoot}/text.txt`) === "line 1\n中文",
          "Text file differs",
        );
        const bytes = Uint8Array.from([0, 1, 127, 128, 255]);
        assert(
          runtimeFiles.writeBytes(`${fileRoot}/bytes.bin`, bytes),
          "Failed to write binary file",
        );
        const stored = runtimeFiles.readBytes(`${fileRoot}/bytes.bin`);
        assert(
          stored !== null && bytesToHex(stored) === "00017f80ff",
          "Binary file differs",
        );
        assert(
          runtimeFiles.list(fileRoot)?.includes("bytes.bin") === true,
          "File listing does not contain the binary file",
        );
        assert(
          runtimeFiles.move(
            `${fileRoot}/bytes.bin`,
            `${fileRoot}/moved.bin`,
          ),
          "Failed to move binary file",
        );
        assert(
          !runtimeFiles.exists(`${fileRoot}/bytes.bin`) &&
            runtimeFiles.readBytes(`${fileRoot}/moved.bin`) !== null,
          "Moved file state is invalid",
        );
      },
    },
    {
      name: "SQLite query, transaction and BLOB round trip",
      run() {
        runtimeFiles.delete(databasePath);
        const database = openDatabase(databasePath);
        try {
          database.update(
            "CREATE TABLE values_test (id INTEGER PRIMARY KEY, label TEXT, data BLOB)",
          );
          database.transaction([
            {
              sql: "INSERT INTO values_test (id, label, data) VALUES (?, ?, ?)",
              args: [1, "first", Uint8Array.from([1, 2, 3])],
            },
            {
              sql: "INSERT INTO values_test (id, label, data) VALUES (?, ?, ?)",
              args: [2, "second", new ArrayBuffer(0)],
            },
          ]);
          const rows = database.query(
            "SELECT id, label, data FROM values_test ORDER BY id",
          );
          assert(rows.length === 2, `Expected 2 rows, received ${rows.length}`);
          assert(rows[0]?.label === "first", "Text column differs");
          assert(
            rows[0]?.data instanceof ArrayBuffer,
            "BLOB was not normalized to ArrayBuffer",
          );
          assert(
            bytesToHex(rows[0].data as ArrayBuffer) === "010203",
            "BLOB content differs",
          );
        } finally {
          database.close();
          runtimeFiles.delete(databasePath);
        }
      },
    },
    {
      name: "UUID shape and uniqueness",
      run() {
        const first = createUuid();
        const second = createUuid();
        const uuidPattern =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        assert(uuidPattern.test(first), `Invalid UUID: ${first}`);
        assert(uuidPattern.test(second), `Invalid UUID: ${second}`);
        assert(first !== second, "Consecutive UUIDs must differ");
      },
    },
    {
      name: "image decode, script rotation and PNG encode",
      async run() {
        const png = Uint8Array.from([
          137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0,
          2, 0, 0, 0, 1, 8, 6, 0, 0, 0, 244, 34, 127, 138, 0, 0, 0, 9, 112, 72,
          89, 115, 0, 0, 3, 232, 0, 0, 3, 232, 1, 181, 123, 82, 107, 0, 0, 0,
          14, 73, 68, 65, 84, 8, 153, 99, 248, 207, 192, 0, 66, 255, 1, 15, 249,
          3, 253, 114, 81, 153, 32, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96,
          130,
        ]);
        const output = await modifyImage(
          png,
          "function modifyImage(image) { return image.copyAndRotate90(); }",
        );
        const decoded = await runtimeImages.decode(output);
        assert(
          decoded.width === 1 && decoded.height === 2,
          `Unexpected rotated size: ${decoded.width}x${decoded.height}`,
        );
      },
    },
    {
      name: "HTTP status and empty body",
      skip: options.networkUrl ? undefined : "No networkUrl configured",
      async run() {
        const response = await httpRequest({
          method: "GET",
          url: options.networkUrl!,
          timeout: 8_000,
        });
        assert(
          response.status === 204,
          `Expected HTTP 204, received ${response.status}`,
        );
        assert(
          response.body.byteLength === 0,
          `Expected empty body, received ${response.body.byteLength} bytes`,
        );
      },
    },
  ];
}

export async function runApiTestSuite(
  options: RuntimeTestOptions = {},
): Promise<RuntimeTestReport> {
  const startedAt = new Date();
  const start = Date.now();
  const cases = createTestCases(options);
  const results: RuntimeTestResult[] = [];

  for (const testCase of cases) {
    const caseStart = Date.now();
    let result: RuntimeTestResult;
    if (testCase.skip) {
      result = {
        name: testCase.name,
        status: "skipped",
        durationMs: 0,
        detail: testCase.skip,
      };
    } else {
      try {
        await testCase.run();
        result = {
          name: testCase.name,
          status: "passed",
          durationMs: Date.now() - caseStart,
        };
      } catch (error) {
        result = {
          name: testCase.name,
          status: "failed",
          durationMs: Date.now() - caseStart,
          detail:
            error instanceof Error
              ? error.stack || error.message
              : String(error),
        };
      }
    }
    results.push(result);
    options.onProgress?.(results.length, cases.length, result);
  }

  return {
    schemaVersion: 1,
    runtime: getRuntimeEnvironment(),
    veneraVersion: VENERA_APP_VERSION,
    platform: VENERA_RUNTIME_PLATFORM,
    startedAt: startedAt.toISOString(),
    durationMs: Date.now() - start,
    totals: {
      passed: results.filter((result) => result.status === "passed").length,
      failed: results.filter((result) => result.status === "failed").length,
      skipped: results.filter((result) => result.status === "skipped").length,
    },
    results,
  };
}

export function formatTestReportMarkdown(report: RuntimeTestReport): string {
  const lines = [
    "# venera-runtime API test report",
    "",
    `- Runtime: ${report.runtime}`,
    `- Venera: ${report.veneraVersion}`,
    `- Platform contract: ${report.platform}`,
    `- Started: ${report.startedAt}`,
    `- Duration: ${report.durationMs} ms`,
    `- Summary: ${report.totals.passed} passed, ${report.totals.failed} failed, ${report.totals.skipped} skipped`,
    "",
    "| Status | Test | Duration | Detail |",
    "| --- | --- | ---: | --- |",
  ];
  for (const result of report.results) {
    const detail = (result.detail ?? "")
      .replaceAll("\n", "<br>")
      .replaceAll("|", "\\|");
    lines.push(
      `| ${result.status} | ${result.name} | ${result.durationMs} ms | ${detail} |`,
    );
  }
  return `${lines.join("\n")}\n`;
}
