import type {
  RuntimeAdapter,
  RuntimeAdapterDefinition,
  RuntimeFileApi,
  RuntimeImageApi,
  RuntimeUiApi,
} from "./api";
import { nodeAdapter } from "./adapters/node";
import { jsboxAdapter } from "./adapters/jsbox";

export type {
  RuntimeAdapter,
  RuntimeAdapterDefinition,
  RuntimeDatabase,
  DatabasePrimitive,
  DatabaseStatement,
  DatabaseRow,
  DatabaseValue,
  RuntimeHttpRequest,
  RuntimeHttpResponse,
  RuntimeFileApi,
  RuntimeUiApi,
  RuntimeUiAction,
  RuntimeImageApi,
  RuntimeImageHandle,
  RuntimeTextApi,
  RuntimeClipboardApi,
} from "./api";

const builtins = [jsboxAdapter, nodeAdapter];
const registered: RuntimeAdapterDefinition[] = [];
let selected: { id: string; adapter: RuntimeAdapter } | undefined;
let selecting = false;

/** Register before the first host operation. Custom hosts take precedence over built-ins. */
export function registerRuntimeAdapter(
  definition: RuntimeAdapterDefinition,
): void {
  if (selected || selecting)
    throw new Error("Runtime adapter is already selected or initializing");
  if (
    !definition ||
    typeof definition.id !== "string" ||
    !/^[a-z][a-z0-9-]*$/.test(definition.id) ||
    typeof definition.detect !== "function" ||
    typeof definition.create !== "function"
  ) {
    throw new TypeError("An adapter requires an id, detect() and create()");
  }
  if ([...registered, ...builtins].some(({ id }) => id === definition.id)) {
    throw new Error(`Runtime adapter already registered: ${definition.id}`);
  }
  registered.push(
    Object.freeze({
      id: definition.id,
      detect: definition.detect.bind(definition),
      create: definition.create.bind(definition),
    }),
  );
}

// Exhaustive method maps: adding a capability to api.ts also requires validation here.
type MethodMap<T> = { [K in keyof T]-?: true };
const methods = {
  openDatabase: true,
  httpRequest: true,
  files: {
    exists: true,
    isDirectory: true,
    mkdir: true,
    list: true,
    readText: true,
    readBytes: true,
    writeText: true,
    writeBytes: true,
    move: true,
    delete: true,
  },
  text: { encode: true, decode: true },
  clipboard: { read: true, write: true },
  ui: {
    showMessage: true,
    showDialog: true,
    launchUrl: true,
    showLoading: true,
    cancelLoading: true,
    showInputDialog: true,
    showSelectDialog: true,
  },
  images: {
    decode: true,
    empty: true,
    crop: true,
    rotate90: true,
    fill: true,
    encodePng: true,
  },
} satisfies {
  [K in keyof RuntimeAdapter]: RuntimeAdapter[K] extends (
    ...args: never[]
  ) => unknown
    ? true
    : MethodMap<RuntimeAdapter[K]>;
};

function snapshot(value: unknown, schema: object, path: string): unknown {
  if (!value || typeof value !== "object")
    throw new TypeError(`Missing runtime capability: ${path}`);
  const result: Record<string, unknown> = {};
  for (const [key, requirement] of Object.entries(schema)) {
    const method = (value as Record<string, unknown>)[key];
    if (requirement === true) {
      if (typeof method !== "function")
        throw new TypeError(`Missing runtime capability: ${path}.${key}`);
      result[key] = method.bind(value);
    } else {
      result[key] = snapshot(method, requirement as object, `${path}.${key}`);
    }
  }
  return Object.freeze(result);
}

function matchesEnvironment(definition: RuntimeAdapterDefinition): boolean {
  const matches = definition.detect();
  if (typeof matches !== "boolean") {
    throw new TypeError(
      `Runtime adapter ${definition.id}: detect() must return a boolean synchronously`,
    );
  }
  return matches;
}

/** Resolves lazily and then stays fixed for the lifetime of this module instance. */
export function getRuntimeAdapter(): RuntimeAdapter {
  if (selected) return selected.adapter;
  if (selecting) throw new Error("Recursive runtime adapter initialization");
  selecting = true;
  try {
    const matches = registered.filter(matchesEnvironment);
    if (matches.length > 1)
      throw new Error(
        `Ambiguous runtime adapters: ${matches.map(({ id }) => id).join(", ")}`,
      );
    const definition = matches[0] ?? builtins.find(matchesEnvironment);
    if (!definition)
      throw new Error(
        "Unsupported environment; register a RuntimeAdapter before using the runtime",
      );
    const adapter = snapshot(
      definition.create(),
      methods,
      definition.id,
    ) as RuntimeAdapter;
    selected = { id: definition.id, adapter };
    return adapter;
  } finally {
    selecting = false;
  }
}

export function getRuntimeEnvironment(): string {
  getRuntimeAdapter();
  return selected!.id;
}

export const openDatabase: RuntimeAdapter["openDatabase"] = (...args) =>
  getRuntimeAdapter().openDatabase(...args);
export const httpRequest: RuntimeAdapter["httpRequest"] = (...args) =>
  getRuntimeAdapter().httpRequest(...args);
export const encodeText: RuntimeAdapter["text"]["encode"] = (...args) =>
  getRuntimeAdapter().text.encode(...args);
export const decodeText: RuntimeAdapter["text"]["decode"] = (...args) =>
  getRuntimeAdapter().text.decode(...args);
export const getClipboardText = (): Promise<string> =>
  getRuntimeAdapter().clipboard.read();
export const setClipboardText = (text: string): Promise<void> =>
  getRuntimeAdapter().clipboard.write(text);

export const runtimeFiles: RuntimeFileApi = {
  exists: (...args) => getRuntimeAdapter().files.exists(...args),
  isDirectory: (...args) => getRuntimeAdapter().files.isDirectory(...args),
  mkdir: (...args) => getRuntimeAdapter().files.mkdir(...args),
  list: (...args) => getRuntimeAdapter().files.list(...args),
  readText: (...args) => getRuntimeAdapter().files.readText(...args),
  readBytes: (...args) => getRuntimeAdapter().files.readBytes(...args),
  writeText: (...args) => getRuntimeAdapter().files.writeText(...args),
  writeBytes: (...args) => getRuntimeAdapter().files.writeBytes(...args),
  move: (...args) => getRuntimeAdapter().files.move(...args),
  delete: (...args) => getRuntimeAdapter().files.delete(...args),
};
export const runtimeUi: RuntimeUiApi = {
  showMessage: (...args) => getRuntimeAdapter().ui.showMessage(...args),
  showDialog: (...args) => getRuntimeAdapter().ui.showDialog(...args),
  launchUrl: (...args) => getRuntimeAdapter().ui.launchUrl(...args),
  showLoading: (...args) => getRuntimeAdapter().ui.showLoading(...args),
  cancelLoading: (...args) => getRuntimeAdapter().ui.cancelLoading(...args),
  showInputDialog: (...args) => getRuntimeAdapter().ui.showInputDialog(...args),
  showSelectDialog: (...args) =>
    getRuntimeAdapter().ui.showSelectDialog(...args),
};
export const runtimeImages: RuntimeImageApi = {
  decode: (...args) => getRuntimeAdapter().images.decode(...args),
  empty: (...args) => getRuntimeAdapter().images.empty(...args),
  crop: (...args) => getRuntimeAdapter().images.crop(...args),
  rotate90: (...args) => getRuntimeAdapter().images.rotate90(...args),
  fill: (...args) => getRuntimeAdapter().images.fill(...args),
  encodePng: (...args) => getRuntimeAdapter().images.encodePng(...args),
};
