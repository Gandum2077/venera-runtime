import { readFile } from "node:fs/promises";
import {
  createVeneraRuntime,
  initializeDatabase,
  loadVeneraConfigBySourceCodeAsync,
} from "venera-runtime";

// 示例使用内存数据库；应用中改成独立的持久化路径。
const database = initializeDatabase(":memory:");
try {
  const code = await readFile(
    new URL("../demo-source.js", import.meta.url),
    "utf8",
  );
  const source = await loadVeneraConfigBySourceCodeAsync(
    code,
    createVeneraRuntime(),
  );
  console.log(`Initialized: ${source.loadData("initialized")}`);
} finally {
  // 本示例不会再调用运行时。关闭后的共享数据库不能重新打开。
  database.close();
}
