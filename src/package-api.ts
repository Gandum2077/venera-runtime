import { loadVeneraConfigBySourceCode } from "./load-config";
import { createVeneraRuntime } from "./runtime";
import type { RuntimeGlobals, VeneraConfigSource } from "./venera-types";

export interface LoadVeneraConfigOptions {
  /** 复用一套运行时；加载多个源并共享 `ComicSource.sources` 时很有用。 */
  globals?: RuntimeGlobals;
  /** 是否在后台运行配置的 `init()`。默认为 `true`。 */
  runInit?: boolean;
}

/**
 * npm 包消费者的推荐入口：创建（或复用）运行时、执行配置源码，并按照
 * Venera 1.6.3 的时序在后台启动 `init()`。
 */
export function loadVeneraConfig(
  sourceCode: string,
  options: LoadVeneraConfigOptions = {},
): VeneraConfigSource {
  const globals = options.globals ?? createVeneraRuntime();
  return loadVeneraConfigBySourceCode(
    sourceCode,
    globals,
    options.runInit ?? true,
  );
}
