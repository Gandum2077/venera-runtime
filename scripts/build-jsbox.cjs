const { execFileSync } = require("node:child_process");
const { cpSync, mkdtempSync, renameSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { parseArgs } = require("node:util");

const { values } = parseArgs({
  options: {
    entry: { type: "string", default: "./dist/index.js" },
    debug: { type: "boolean", default: false },
  },
});
const root = resolve(__dirname, "..");
const directory = mkdtempSync(join(tmpdir(), "venera-jsbox-"));
const app = join(directory, "app");
const filename = values.debug
  ? "venera-runtime-debug.box"
  : "venera-runtime.box";
function run(command, args, cwd = root) {
  execFileSync(command, args, { cwd, stdio: "inherit" });
}

try {
  run(process.execPath, [join(__dirname, "clean.cjs")]);
  run(process.execPath, [require.resolve("typescript/bin/tsc")]);
  cpSync(join(root, "app"), app, {
    recursive: true,
    filter: (source) =>
      !["main.js", "main.js.LICENSE.txt", ".DS_Store"].includes(
        source.split(/[\\/]/).pop(),
      ),
  });
  run(process.execPath, [
    require.resolve("webpack-cli/bin/cli.js"),
    "--env",
    `debug=${values.debug}`,
    "--entry-reset",
    "--entry",
    values.entry,
    "--output-path",
    app,
    "--output-filename",
    "main.js",
  ]);
  // Always create a fresh archive; updating an existing zip retains deleted files.
  const archive = join(directory, filename);
  run("zip", ["-q", "-r", archive, "."], app);
  // Copy beside the target before renaming, even when the temp directory is on another volume.
  const pending = join(root, `${filename}.tmp`);
  try {
    cpSync(archive, pending);
    renameSync(pending, join(root, filename));
  } finally {
    rmSync(pending, { force: true });
  }
  console.log(`Built ${filename} from ${values.entry}`);
} finally {
  rmSync(directory, { recursive: true, force: true });
}
