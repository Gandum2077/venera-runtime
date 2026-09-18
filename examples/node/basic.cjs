const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { loadVeneraConfig } = require("venera-runtime");

async function main() {
  const code = readFileSync(join(__dirname, "../demo-source.js"), "utf8");
  const source = loadVeneraConfig(code, { runInit: false });
  if (!source.search?.load) throw new Error("Source does not support search");
  const result = await source.search.load("Venera", [], 1);
  console.log(`${source.name}: ${result.comics[0].title}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
