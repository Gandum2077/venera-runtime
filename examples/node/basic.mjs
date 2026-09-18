import { readFile } from "node:fs/promises";
import { loadVeneraConfig } from "venera-runtime";

const code = await readFile(
  new URL("../demo-source.js", import.meta.url),
  "utf8",
);
const source = loadVeneraConfig(code, { runInit: false });
if (!source.search?.load) throw new Error("Source does not support search");
const result = await source.search.load("Venera", [], 1);
console.log(`${source.name}: ${result.comics[0].title}`);
