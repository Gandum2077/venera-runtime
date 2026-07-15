import type { RuntimeGlobals, VeneraConfigSource } from "./venera-types";
import { VENERA_CONFIG_STORAGE_PATH } from "./constants";

export function loadVeneraConfigBySourceCode(sourceCode: string, globals: RuntimeGlobals): VeneraConfigSource {
  return loadVeneraConfig(sourceCode, globals, true);
}

function detectSourceClassName(sourceCode: string): string {
  // 约定：配置文件里通常会写成 `class Xxx extends ComicSource`。
  // 我们先把类名找出来，后面才能 new 这个类。
  const match = sourceCode.match(/class\s+([A-Za-z0-9_]+)\s+extends\s+ComicSource/);
  if (!match?.[1]) {
    throw new Error("Could not find `class X extends ComicSource` in config");
  }
  return match[1];
}

function loadVeneraConfig(sourceCode: string, globals: RuntimeGlobals, runInit = false): VeneraConfigSource {
  /**
   * 这里是整个项目最关键的一步：
   * 用 `new Function(...)` 动态执行配置脚本，并把运行时对象作为参数注入进去。
   */
  const className = detectSourceClassName(sourceCode);
  const factory = new Function(
    ...Object.keys(globals),
    `
${sourceCode}
const __instance = new ${className}();
ComicSource.sources[__instance.key] = __instance;
return __instance;
`,
  ) as (...args: unknown[]) => VeneraConfigSource;

  const source = factory(...Object.values(globals as RuntimeGlobals));
  if (runInit && source.init) {
    setTimeout(() => {
      void Promise.resolve(source.init?.call(source)).catch((error: unknown) => {
        console.error("Venera config init failed", error);
      });
    }, 0);
  }
  return source;
}
