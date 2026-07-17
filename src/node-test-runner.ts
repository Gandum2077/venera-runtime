import {
  DEFAULT_NETWORK_TEST_URL,
  formatTestReportMarkdown,
  runApiTestSuite,
} from "./api-test-suite";
import { runtimeFiles } from "./api";

async function main(): Promise<void> {
  const report = await runApiTestSuite({
    networkUrl: process.env.VENERA_TEST_NETWORK_URL || DEFAULT_NETWORK_TEST_URL,
    onProgress(completed, total, result) {
      console.log(
        `[${completed}/${total}] ${result.status.toUpperCase()} ${result.name}`,
      );
    },
  });
  runtimeFiles.writeText(
    "test-results/node-api-report.md",
    formatTestReportMarkdown(report),
  );
  runtimeFiles.writeText(
    "test-results/node-api-report.json",
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(
    `API contract: ${report.totals.passed} passed, ${report.totals.failed} failed, ${report.totals.skipped} skipped`,
  );
  if (report.totals.failed > 0) process.exitCode = 1;
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
