const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { mkdtempSync, readFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");

const root = resolve(__dirname, "..");
const data = mkdtempSync(join(tmpdir(), "venera-examples-"));
try {
  const options = {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, VENERA_RUNTIME_DATA_DIR: data },
  };
  for (const [file, expected] of [
    ["basic.cjs", "Local demo: Venera"],
    ["basic.mjs", "Local demo: Venera"],
    ["initialized.mjs", "Initialized: true"],
  ]) {
    const output = execFileSync(
      process.execPath,
      [join(root, "examples/node", file)],
      options,
    );
    assert.equal(output.trim(), expected, file);
  }
  const readme = readFileSync(join(root, "README.md"), "utf8");
  const quickstart = readme.match(/```js\n([\s\S]*?)\n```/);
  assert(quickstart, "README quickstart must exist");
  const output = execFileSync(
    process.execPath,
    ["--input-type=commonjs", "-e", quickstart[1]],
    options,
  );
  assert.equal(output.trim(), "Local demo\nVenera");
  console.log(
    "README and Node examples passed; TypeScript examples checked separately.",
  );
} finally {
  rmSync(data, { recursive: true, force: true });
}
