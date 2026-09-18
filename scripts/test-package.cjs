const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { mkdtempSync, writeFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { resolve, join } = require("node:path");

const root = resolve(__dirname, "..");
const directory = mkdtempSync(join(tmpdir(), "venera-package-"));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
function run(command, args, cwd = directory) {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, VENERA_RUNTIME_DATA_DIR: join(directory, "data") },
    // Windows npm is a command shim; all arguments here are generated locally.
    shell: process.platform === "win32",
  });
}
try {
  const [packed] = JSON.parse(
    run(
      npm,
      ["pack", "--ignore-scripts", "--json", "--pack-destination", directory],
      root,
    ),
  );
  assert(
    !packed.files.some(({ path }) =>
      /test-runner|api-test-suite|compare-test-reports/.test(path),
    ),
  );
  writeFileSync(
    join(directory, "package.json"),
    JSON.stringify({
      name: "venera-consumer-test",
      private: true,
      type: "module",
    }),
  );
  console.log(
    run(npm, [
      "install",
      "--omit=dev",
      "--no-audit",
      "--no-fund",
      join(directory, packed.filename),
    ]),
  );
  writeFileSync(
    join(directory, "smoke.cjs"),
    `
const assert = require("node:assert/strict");
const runtime = require("venera-runtime");
const platform = require("venera-runtime/platform");
assert.equal(platform.getRuntimeEnvironment(), "node");
const db = runtime.initializeDatabase(":memory:");
assert.deepEqual(db.query("SELECT 1 AS value"), [{ value: 1 }]);
db.close();
const source = runtime.loadVeneraConfig('class Demo extends ComicSource { name="Demo"; key="demo"; version="1.0.0"; }', { runInit: false });
assert.equal(source.key, "demo");
(async () => {
  const images = platform.getRuntimeAdapter().images;
  const png = await images.encodePng(images.empty(2, 3));
  const decoded = await images.decode(png);
  assert.equal(decoded.width, 2);
  assert.equal(decoded.height, 3);
})().catch(error => { console.error(error); process.exitCode = 1; });
`,
  );
  run(process.execPath, ["smoke.cjs"]);
  writeFileSync(
    join(directory, "smoke.mjs"),
    `
import assert from "node:assert/strict";
import runtime, { loadVeneraConfig, modifyImage } from "venera-runtime";
import { getRuntimeEnvironment } from "venera-runtime/platform";
assert.equal(runtime.loadVeneraConfig, loadVeneraConfig);
assert.equal(typeof modifyImage, "function");
assert.equal(getRuntimeEnvironment(), "node");
`,
  );
  run(process.execPath, ["smoke.mjs"]);
  writeFileSync(
    join(directory, "consumer.mts"),
    `
import { loadVeneraConfig, modifyImage, type VeneraConfigSource } from "venera-runtime";
import { registerRuntimeAdapter, type RuntimeAdapter, type RuntimeAdapterDefinition } from "venera-runtime/platform";
import { createNodeAdapter } from "venera-runtime/adapters/node";
import { createJsBoxAdapter } from "venera-runtime/adapters/jsbox";
const adapter: RuntimeAdapter = createNodeAdapter();
const definition: RuntimeAdapterDefinition = { id: "example", detect: () => false, create: () => adapter };
registerRuntimeAdapter(definition);
const source: VeneraConfigSource = loadVeneraConfig("", { runInit: false });
const bytes: Promise<ArrayBuffer> = modifyImage(new Uint8Array(), "");
void [source, bytes, createJsBoxAdapter];
// @ts-expect-error An incomplete adapter must never satisfy the capability contract.
const incomplete: RuntimeAdapter = { files: adapter.files };
`,
  );
  writeFileSync(
    join(directory, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        skipLibCheck: false,
        module: "NodeNext",
        target: "ES2021",
        lib: ["ES2023", "DOM"],
        types: [],
      },
      files: ["consumer.mts"],
    }),
  );
  // Use the repository compiler, but only the consumer's installed declarations.
  run(process.execPath, [
    join(root, "node_modules/typescript/bin/tsc"),
    "-p",
    join(directory, "tsconfig.json"),
  ]);
  console.log(
    `Package consumer checks passed (${packed.files.length} files): CJS, native ESM, SQLite, images, TypeScript without jsbox-types.`,
  );
} catch (error) {
  if (error.stdout) console.error(String(error.stdout));
  if (error.stderr) console.error(String(error.stderr));
  throw error;
} finally {
  rmSync(directory, { recursive: true, force: true });
}
