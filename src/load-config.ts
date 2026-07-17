import type { RuntimeGlobals, VeneraConfigSource } from "./venera-types";

export function loadVeneraConfigBySourceCode(
  sourceCode: string,
  globals: RuntimeGlobals,
  runInit = true,
): VeneraConfigSource {
  const source = evaluateVeneraConfig(sourceCode, globals);
  if (runInit && source.init) {
    setTimeout(() => {
      void Promise.resolve(source.init?.call(source)).catch(
        (error: unknown) => {
          console.error("Venera config init failed", error);
        },
      );
    }, 0);
  }
  return source;
}

/**
 * 加载配置并等待 `source.init()` 完成。
 *
 * npm 包消费者通常应使用这个版本，避免初始化数据尚未写入就调用源能力。
 */
export async function loadVeneraConfigBySourceCodeAsync(
  sourceCode: string,
  globals: RuntimeGlobals,
  runInit = true,
): Promise<VeneraConfigSource> {
  const source = evaluateVeneraConfig(sourceCode, globals);
  if (runInit && source.init) {
    await Promise.resolve(source.init.call(source));
  }
  return source;
}

function detectSourceClassName(sourceCode: string): string {
  // 约定：配置文件里通常会写成 `class Xxx extends ComicSource`。
  // 我们先把类名找出来，后面才能 new 这个类。
  const match = sourceCode.match(
    /class\s+([A-Za-z0-9_]+)\s+extends\s+ComicSource/,
  );
  if (!match?.[1]) {
    throw new Error("Could not find `class X extends ComicSource` in config");
  }
  return match[1];
}

function evaluateVeneraConfig(
  sourceCode: string,
  globals: RuntimeGlobals,
): VeneraConfigSource {
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

  return factory(...Object.values(globals as RuntimeGlobals));
}
