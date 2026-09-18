import {
  createVeneraRuntime,
  initializeDatabase,
  loadVeneraConfigBySourceCodeAsync,
} from "venera-runtime";

async function main(): Promise<void> {
  // 把 ../demo-source.js 复制到 JSBox 应用的 assets/config.js。
  if (!$file.exists("assets")) $file.mkdir("assets");
  const code = $file.read("assets/config.js")?.string;
  if (!code) throw new Error("Missing assets/config.js");

  initializeDatabase("assets/database.db");
  const source = await loadVeneraConfigBySourceCodeAsync(
    code,
    createVeneraRuntime(),
  );
  if (!source.search?.load) throw new Error("Source does not support search");
  const result = await source.search.load("Venera", [], 1);
  $ui.alert(`${source.name}: ${result.comics[0]?.title ?? "No results"}`);
}

void main().catch((error: unknown) => {
  $ui.alert(error instanceof Error ? error.message : String(error));
});
