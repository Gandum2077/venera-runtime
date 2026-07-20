import type { RuntimeGlobals, VeneraConfigSource } from "./venera-types";

/** Venera 1.6.3 在配置解析完成后延迟启动 `source.init()`。 */
const VENERA_INIT_DELAY_MS = 50;

interface SemanticVersion {
  core: [number, number, number];
  prerelease: Array<number | string>;
}

function parseSemanticVersion(value: string, field: string): SemanticVersion {
  const match = value.match(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/,
  );
  if (!match) {
    throw new Error(`${field} must be a valid semantic version: ${value}`);
  }
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4]
      ? match[4]
          .split(".")
          .map((part) => (/^\d+$/.test(part) ? Number(part) : part))
      : [],
  };
}

function compareSemanticVersions(
  left: SemanticVersion,
  right: SemanticVersion,
): number {
  for (let index = 0; index < left.core.length; index += 1) {
    if (left.core[index]! !== right.core[index]!) {
      return left.core[index]! > right.core[index]! ? 1 : -1;
    }
  }
  if (left.prerelease.length === 0 || right.prerelease.length === 0) {
    return left.prerelease.length === right.prerelease.length
      ? 0
      : left.prerelease.length === 0
        ? 1
        : -1;
  }
  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = left.prerelease[index];
    const rightPart = right.prerelease[index];
    if (leftPart === undefined || rightPart === undefined) {
      return leftPart === rightPart ? 0 : leftPart === undefined ? -1 : 1;
    }
    if (leftPart === rightPart) continue;
    if (typeof leftPart === "number" && typeof rightPart === "number") {
      return leftPart > rightPart ? 1 : -1;
    }
    if (typeof leftPart === "number") return -1;
    if (typeof rightPart === "number") return 1;
    return leftPart > rightPart ? 1 : -1;
  }
  return 0;
}

function validateRequiredString(
  source: VeneraConfigSource,
  field: "name" | "key" | "version",
): string {
  const value = source[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${field} is required`);
  }
  return value;
}

/** Validate the metadata that Venera checks before accepting a source. */
export function validateVeneraConfig(
  source: VeneraConfigSource,
  appVersion: string,
): void {
  validateRequiredString(source, "name");
  const key = validateRequiredString(source, "key");
  if (!/^[A-Za-z0-9_]+$/.test(key)) {
    throw new Error(`key ${key} is invalid`);
  }

  const version = validateRequiredString(source, "version");
  parseSemanticVersion(version, "version");

  if (source.minAppVersion !== undefined && source.minAppVersion !== null) {
    if (
      typeof source.minAppVersion !== "string" ||
      source.minAppVersion.trim() === ""
    ) {
      throw new Error("minAppVersion must be a valid semantic version");
    }
    const minimum = parseSemanticVersion(source.minAppVersion, "minAppVersion");
    const current = parseSemanticVersion(appVersion, "APP.version");
    if (compareSemanticVersions(minimum, current) > 0) {
      throw new Error(`minAppVersion ${source.minAppVersion} is required`);
    }
  }
}

export function loadVeneraConfigBySourceCode(
  sourceCode: string,
  globals: RuntimeGlobals,
  runInit = true,
): VeneraConfigSource {
  const source = evaluateVeneraConfig(sourceCode, globals);
  validateVeneraConfig(source, globals.APP.version);
  globals.ComicSource.sources[source.key] = source;
  if (runInit && source.init) {
    setTimeout(() => {
      void Promise.resolve(source.init?.call(source)).catch(
        (error: unknown) => {
          console.error("Venera config init failed", error);
        },
      );
    }, VENERA_INIT_DELAY_MS);
  }
  return source;
}

/**
 * 加载配置并等待 `source.init()` 完成。
 *
 * 这是需要在返回前确认初始化完成时使用的额外入口；它不模拟 Venera
 * 默认的后台初始化时序。
 */
export async function loadVeneraConfigBySourceCodeAsync(
  sourceCode: string,
  globals: RuntimeGlobals,
  runInit = true,
): Promise<VeneraConfigSource> {
  const source = evaluateVeneraConfig(sourceCode, globals);
  validateVeneraConfig(source, globals.APP.version);
  globals.ComicSource.sources[source.key] = source;
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
return __instance;
`,
  ) as (...args: unknown[]) => VeneraConfigSource;

  return factory(...Object.values(globals as RuntimeGlobals));
}
