import { readFile } from "node:fs/promises";
import { loadVeneraConfig, type VeneraConfigSource } from "venera-runtime";

// 可传入可信配置文件路径；不传时使用仓库自带的离线配置。
const path = process.argv[2] ?? new URL("../demo-source.js", import.meta.url);
const source: VeneraConfigSource = loadVeneraConfig(
  await readFile(path, "utf8"),
  {
    runInit: false,
  },
);
console.log(
  JSON.stringify({
    name: source.name,
    key: source.key,
    version: source.version,
    canSearch: typeof source.search?.load === "function",
  }),
);
