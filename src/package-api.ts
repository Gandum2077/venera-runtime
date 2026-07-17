import { loadVeneraConfigBySourceCodeAsync } from "./load-config";
import { createVeneraRuntime } from "./runtime";
import type { RuntimeGlobals, VeneraConfigSource } from "./venera-types";

export interface LoadVeneraConfigOptions {
  /** 复用一套运行时；加载多个源并共享 `ComicSource.sources` 时很有用。 */
  globals?: RuntimeGlobals;
  /** 是否运行并等待配置的 `init()`。默认为 `true`。 */
  runInit?: boolean;
}

/**
 * npm 包消费者的推荐入口：创建（或复用）运行时、执行配置源码，并等待初始化完成。
 */
export async function loadVeneraConfig(
  sourceCode: string,
  options: LoadVeneraConfigOptions = {},
): Promise<VeneraConfigSource> {
  const globals = options.globals ?? createVeneraRuntime();
  return loadVeneraConfigBySourceCodeAsync(
    sourceCode,
    globals,
    options.runInit ?? true,
  );
}
