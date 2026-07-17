import { readFileSync } from "node:fs";
import type { RuntimeTestReport } from "./api-test-suite";

function loadReport(path: string): RuntimeTestReport {
  return JSON.parse(readFileSync(path, "utf8")) as RuntimeTestReport;
}

function main(): void {
  const nodePath = process.argv[2] || "test-results/node-api-report.json";
  const jsBoxPath = process.argv[3] || "test-results/jsbox-api-report.json";
  const nodeReport = loadReport(nodePath);
  const jsBoxReport = loadReport(jsBoxPath);
  const failures: string[] = [];

  if (nodeReport.veneraVersion !== jsBoxReport.veneraVersion) {
    failures.push(
      `Venera version differs: node=${nodeReport.veneraVersion}, jsbox=${jsBoxReport.veneraVersion}`,
    );
  }
  if (nodeReport.platform !== jsBoxReport.platform) {
    failures.push(
      `Platform contract differs: node=${nodeReport.platform}, jsbox=${jsBoxReport.platform}`,
    );
  }

  const nodeResults = new Map(
    nodeReport.results.map((result) => [result.name, result]),
  );
  const jsBoxResults = new Map(
    jsBoxReport.results.map((result) => [result.name, result]),
  );
  const names = new Set([...nodeResults.keys(), ...jsBoxResults.keys()]);
  for (const name of names) {
    const nodeResult = nodeResults.get(name);
    const jsBoxResult = jsBoxResults.get(name);
    if (!nodeResult || !jsBoxResult) {
      failures.push(
        `${name}: missing from ${nodeResult ? "JSBox" : "Node"} report`,
      );
    } else if (nodeResult.status !== jsBoxResult.status) {
      failures.push(
        `${name}: node=${nodeResult.status}, jsbox=${jsBoxResult.status}`,
      );
    }
  }

  if (failures.length > 0) {
    console.error(`Runtime reports differ (${failures.length}):`);
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `Runtime reports match: ${names.size} tests, Venera ${nodeReport.veneraVersion}, platform ${nodeReport.platform}`,
  );
}

main();
