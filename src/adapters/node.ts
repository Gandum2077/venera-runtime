import type {
  DatabaseRow,
  DatabaseValue,
  DatabasePrimitive,
  RuntimeDatabase,
  RuntimeFileApi,
  RuntimeHttpRequest,
  RuntimeHttpResponse,
  RuntimeUiApi,
  RuntimeImageApi,
  RuntimeImageHandle,
  RuntimeAdapter,
  RuntimeAdapterDefinition,
} from "../api";
import { exactArrayBuffer } from "./bytes";
import { getCliIo } from "./node-cli";
export { setCliIo } from "./node-cli";
export type { CliIo } from "./node-cli";
export function createNodeAdapter(): RuntimeAdapter {
  function requireNode<T>(id: string): T {
    // Runtime resolution keeps native dependencies out of non-Node bundles.
    // eslint-disable-next-line no-eval -- Keep Node module resolution invisible to JSBox bundlers.
    const runtimeRequire = eval("require") as (moduleId: string) => T;
    return runtimeRequire(id);
  }

  async function importNode<T>(id: string): Promise<T> {
    // eslint-disable-next-line no-new-func -- Load ESM-only Node dependencies without bundling them for JSBox.
    const runtimeImport = new Function(
      "moduleId",
      "return import(moduleId)",
    ) as (moduleId: string) => Promise<T>;
    return runtimeImport(id);
  }

  function normalizeDatabaseOutput(value: unknown): DatabaseValue {
    if (value instanceof ArrayBuffer || ArrayBuffer.isView(value))
      return exactArrayBuffer(value);
    if (value === null || value === undefined) return null;
    if (typeof value === "boolean") return value ? 1 : 0;
    if (typeof value === "string" || typeof value === "number") return value;
    throw new TypeError("Unsupported SQLite result value");
  }

  function normalizeDatabaseRow(row: Record<string, unknown>): DatabaseRow {
    return Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        normalizeDatabaseOutput(value),
      ]),
    );
  }

  function normalizeNodeDatabaseValue(
    value: DatabasePrimitive,
  ): string | number | bigint | Uint8Array | null {
    if (value === null || value === undefined) return null;
    if (typeof value === "boolean") return value ? 1 : 0;
    if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
      const BufferClass =
        requireNode<typeof import("node:buffer")>("node:buffer").Buffer;
      return BufferClass.from(new Uint8Array(exactArrayBuffer(value)));
    }
    return value;
  }

  function resolveNodePath(path: string): string {
    const pathModule = requireNode<typeof import("node:path")>("node:path");
    if (pathModule.isAbsolute(path)) return path;
    const root = process.env.VENERA_RUNTIME_DATA_DIR || process.cwd();
    return pathModule.resolve(root, path);
  }

  function createNodeDatabase(path: string): RuntimeDatabase {
    type Statement = {
      all(...args: unknown[]): Record<string, unknown>[];
      run(...args: unknown[]): unknown;
    };
    type Database = {
      prepare(sql: string): Statement;
      transaction<T extends (...args: never[]) => unknown>(fn: T): T;
      close(): void;
    };
    type DatabaseConstructor = new (path: string) => Database;
    const DatabaseClass = requireNode<DatabaseConstructor>("better-sqlite3");
    const fs = requireNode<typeof import("node:fs")>("node:fs");
    const pathModule = requireNode<typeof import("node:path")>("node:path");
    const resolvedPath = path === ":memory:" ? path : resolveNodePath(path);
    if (resolvedPath !== ":memory:") {
      fs.mkdirSync(pathModule.dirname(resolvedPath), { recursive: true });
    }
    const database = new DatabaseClass(resolvedPath);
    const run = (sql: string, args: DatabasePrimitive[] = []): void => {
      database.prepare(sql).run(...args.map(normalizeNodeDatabaseValue));
    };
    return {
      query(sql, args = []) {
        return database
          .prepare(sql)
          .all(...args.map(normalizeNodeDatabaseValue))
          .map(normalizeDatabaseRow);
      },
      update: run,
      transaction(statements) {
        const execute = database.transaction(() => {
          for (const statement of statements) {
            run(statement.sql, statement.args);
          }
        });
        execute();
      },
      close() {
        database.close();
      },
    };
  }

  function nodeFileApi(): RuntimeFileApi {
    const fs = requireNode<typeof import("node:fs")>("node:fs");
    const pathModule = requireNode<typeof import("node:path")>("node:path");
    const ensureParent = (path: string) =>
      fs.mkdirSync(pathModule.dirname(resolveNodePath(path)), {
        recursive: true,
      });
    return {
      exists: (path) => fs.existsSync(resolveNodePath(path)),
      isDirectory(path) {
        try {
          return fs.statSync(resolveNodePath(path)).isDirectory();
        } catch {
          return false;
        }
      },
      mkdir(path) {
        fs.mkdirSync(resolveNodePath(path), { recursive: true });
        return true;
      },
      list(path) {
        try {
          return fs.readdirSync(resolveNodePath(path));
        } catch {
          return null;
        }
      },
      readText(path) {
        try {
          return fs.readFileSync(resolveNodePath(path), "utf8");
        } catch {
          return null;
        }
      },
      readBytes(path) {
        try {
          return exactArrayBuffer(fs.readFileSync(resolveNodePath(path)));
        } catch {
          return null;
        }
      },
      writeText(path, content) {
        ensureParent(path);
        fs.writeFileSync(resolveNodePath(path), content, "utf8");
        return true;
      },
      writeBytes(path, content) {
        ensureParent(path);
        fs.writeFileSync(
          resolveNodePath(path),
          new Uint8Array(exactArrayBuffer(content)),
        );
        return true;
      },
      move(source, destination) {
        try {
          ensureParent(destination);
          fs.renameSync(resolveNodePath(source), resolveNodePath(destination));
          return true;
        } catch {
          return false;
        }
      },
      delete(path) {
        const resolvedPath = resolveNodePath(path);
        if (!fs.existsSync(resolvedPath)) return true;
        fs.rmSync(resolvedPath, { recursive: true, force: true });
        return true;
      },
    };
  }

  function encodeText(value: string, encoding: "utf8" | "gbk"): ArrayBuffer {
    if (encoding === "utf8") {
      return new TextEncoder().encode(value).buffer;
    }
    const iconv = requireNode<typeof import("iconv-lite")>("iconv-lite");
    return exactArrayBuffer(iconv.encode(value, "gbk"));
  }

  function decodeText(
    value: ArrayBuffer | ArrayBufferView,
    encoding: "utf8" | "gbk",
  ): string {
    if (encoding === "utf8") {
      return new TextDecoder().decode(new Uint8Array(exactArrayBuffer(value)));
    }
    const iconv = requireNode<typeof import("iconv-lite")>("iconv-lite");
    return iconv.decode(
      Buffer.from(new Uint8Array(exactArrayBuffer(value))),
      "gbk",
    );
  }

  function getHeader(
    headers: Record<string, string>,
    name: string,
  ): string | undefined {
    const normalizedName = name.toLowerCase();
    return Object.entries(headers).find(
      ([key]) => key.toLowerCase() === normalizedName,
    )?.[1];
  }

  function appendSearchParam(
    params: URLSearchParams,
    key: string,
    value: unknown,
  ): void {
    if (Array.isArray(value)) {
      for (const item of value) appendSearchParam(params, key, item);
    } else if (value === null || value === undefined) {
      params.append(key, "");
    } else if (typeof value === "object") {
      params.append(key, JSON.stringify(value));
    } else {
      params.append(key, String(value));
    }
  }

  function normalizeNodeRequestBody(
    body: RuntimeHttpRequest["body"],
    headers: Record<string, string>,
  ): BodyInit | null {
    if (body === null || body === undefined) return null;
    if (typeof body === "string") return body;
    if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
      return exactArrayBuffer(body);
    }
    const contentType =
      getHeader(headers, "content-type")?.toLowerCase() ?? "application/json";
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(body))
        appendSearchParam(params, key, value);
      return params;
    }
    return JSON.stringify(body);
  }

  async function nodeHttpRequest(
    request: RuntimeHttpRequest,
  ): Promise<RuntimeHttpResponse> {
    const headers = { ...(request.headers ?? {}) };
    const controller = new AbortController();
    const timeout = request.timeout
      ? setTimeout(
          () =>
            controller.abort(
              new Error(`Request timed out after ${request.timeout}ms`),
            ),
          request.timeout,
        )
      : null;
    try {
      const response = await globalThis.fetch(request.url, {
        method: request.method,
        headers,
        body: normalizeNodeRequestBody(request.body, headers),
        signal: controller.signal,
      });
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });
      const headerWithCookies = response.headers as Headers & {
        getSetCookie?: () => string[];
      };
      const setCookieHeaders = headerWithCookies.getSetCookie?.() ?? [];
      if (setCookieHeaders.length > 0) {
        responseHeaders["set-cookie"] = setCookieHeaders.join(", ");
      }
      return {
        status: response.status,
        headers: responseHeaders,
        body: await response.arrayBuffer(),
        url: response.url || request.url,
        setCookieHeaders,
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Network request failed: ${detail}`, { cause: error });
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  async function setClipboardText(text: string): Promise<void> {
    const clipboard = await importNode<{
      default: { write(text: string): Promise<void> };
    }>("clipboardy");
    await clipboard.default.write(text);
  }

  async function getClipboardText(): Promise<string> {
    const clipboard = await importNode<{
      default: { read(): Promise<string> };
    }>("clipboardy");
    return clipboard.default.read();
  }

  let loadingId = 0;

  const loadingCancelCallbacks = new Map<number, (() => void) | null>();

  const loadingCancelControllers = new Map<number, AbortController>();

  const runtimeUi: RuntimeUiApi = {
    showMessage(message) {
      getCliIo().write(`[Message] ${message}`);
    },
    async showDialog(title, content, actions) {
      getCliIo().write(`[Dialog] ${title}\n${content}`);
      if (actions.length === 0) {
        await getCliIo().read("Press Enter to close: ");
        return;
      }
      getCliIo().write(
        actions
          .map((action, index) => `${index + 1}. ${action.text}`)
          .join("\n"),
      );
      while (true) {
        const value = await getCliIo().read("Choice [1]: ");
        if (value === null) return;
        const selected = value.trim() === "" ? 0 : Number(value) - 1;
        if (
          Number.isInteger(selected) &&
          selected >= 0 &&
          selected < actions.length
        ) {
          await actions[selected]!.callback();
          return;
        }
        getCliIo().write(
          `[Invalid choice] Enter a number from 1 to ${actions.length}`,
        );
      }
    },
    launchUrl(url) {
      getCliIo().write(`[Open URL] ${url}`);
    },
    showLoading(onCancel) {
      const id = loadingId++;
      loadingCancelCallbacks.set(id, onCancel ?? null);

      getCliIo().write(
        `[Loading #${id}] started${onCancel ? " (cancelable)" : ""}`,
      );
      if (onCancel) {
        const controller = new AbortController();
        loadingCancelControllers.set(id, controller);
        void getCliIo()
          .read(`[Loading #${id}] Press Enter to cancel: `, controller.signal)
          .then((value) => {
            if (value === null || !loadingCancelCallbacks.has(id)) return;
            loadingCancelCallbacks.delete(id);
            loadingCancelControllers.delete(id);
            getCliIo().write(`[Loading #${id}] canceled`);
            onCancel();
          })
          .catch((error: unknown) => {
            if (
              !controller.signal.aborted &&
              (!(error instanceof Error) || error.name !== "AbortError")
            ) {
              getCliIo().write(
                `[Loading #${id}] cancel input failed: ${String(error)}`,
              );
            }
          });
      }

      return id;
    },
    cancelLoading(id) {
      if (!loadingCancelCallbacks.has(id)) return;
      loadingCancelCallbacks.delete(id);
      loadingCancelControllers.get(id)?.abort();
      loadingCancelControllers.delete(id);

      getCliIo().write(`[Loading #${id}] finished`);
    },
    async showInputDialog(title, validator, image) {
      if (image)
        getCliIo().write(
          `[Input image] ${typeof image === "string" ? image : `${image.byteLength} bytes`}`,
        );
      while (true) {
        const value = await getCliIo().read(`[Input] ${title}: `);
        if (value === null) return null;
        const validationError = validator?.(value);
        if (!validationError) return value;
        getCliIo().write(`[Validation error] ${validationError}`);
      }
    },
    async showSelectDialog(title, options, initialIndex) {
      if (options.length === 0) return null;

      getCliIo().write(
        `[Select] ${title}\n${options.map((option, index) => `${index + 1}. ${option}`).join("\n")}`,
      );
      while (true) {
        const value = await getCliIo().read(
          `Choice${initialIndex == null ? "" : ` [${initialIndex + 1}]`}: `,
        );
        if (value === null) return null;
        if (value.trim() === "") return initialIndex ?? null;
        const selected = Number(value) - 1;
        if (
          Number.isInteger(selected) &&
          selected >= 0 &&
          selected < options.length
        ) {
          return selected;
        }
        getCliIo().write(
          `[Invalid choice] Enter a number from 1 to ${options.length}`,
        );
      }
    },
  };

  interface NodeImageData {
    width: number;
    height: number;
    pixels: Uint8ClampedArray;
  }

  function nodeImageData(handle: RuntimeImageHandle): NodeImageData {
    return handle.native as NodeImageData;
  }

  function createNodeImageHandle(
    width: number,
    height: number,
    pixels?: Uint8ClampedArray,
  ): RuntimeImageHandle {
    const data: NodeImageData = {
      width,
      height,
      pixels: pixels
        ? new Uint8ClampedArray(pixels)
        : new Uint8ClampedArray(width * height * 4),
    };
    return { width, height, native: data };
  }

  function cropNodeImage(
    image: RuntimeImageHandle,
    x: number,
    y: number,
    width: number,
    height: number,
  ): RuntimeImageHandle {
    const source = nodeImageData(image);
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let row = 0; row < height; row += 1) {
      const sourceStart = ((y + row) * source.width + x) * 4;
      const targetStart = row * width * 4;
      pixels.set(
        source.pixels.subarray(sourceStart, sourceStart + width * 4),
        targetStart,
      );
    }
    return createNodeImageHandle(width, height, pixels);
  }

  function rotateNodeImage90(image: RuntimeImageHandle): RuntimeImageHandle {
    const source = nodeImageData(image);
    const target = nodeImageData(
      createNodeImageHandle(source.height, source.width),
    );
    for (let y = 0; y < source.height; y += 1) {
      for (let x = 0; x < source.width; x += 1) {
        const sourceOffset = (y * source.width + x) * 4;
        const targetX = source.height - y - 1;
        const targetY = x;
        const targetOffset = (targetY * target.width + targetX) * 4;
        target.pixels.set(
          source.pixels.subarray(sourceOffset, sourceOffset + 4),
          targetOffset,
        );
      }
    }
    return { width: target.width, height: target.height, native: target };
  }

  function fillNodeImage(
    targetHandle: RuntimeImageHandle,
    x: number,
    y: number,
    sourceHandle: RuntimeImageHandle,
  ): RuntimeImageHandle {
    const target = nodeImageData(targetHandle);
    const source = nodeImageData(sourceHandle);
    for (let row = 0; row < source.height; row += 1) {
      const sourceStart = row * source.width * 4;
      const targetStart = ((y + row) * target.width + x) * 4;
      target.pixels.set(
        source.pixels.subarray(sourceStart, sourceStart + source.width * 4),
        targetStart,
      );
    }
    return targetHandle;
  }

  const runtimeImages: RuntimeImageApi = {
    async decode(data) {
      const sharp = requireNode<typeof import("sharp")>("sharp");
      const BufferClass =
        requireNode<typeof import("node:buffer")>("node:buffer").Buffer;
      const decoded = await sharp(
        BufferClass.from(new Uint8Array(exactArrayBuffer(data))),
      )
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      return createNodeImageHandle(
        decoded.info.width,
        decoded.info.height,
        new Uint8ClampedArray(decoded.data),
      );
    },
    empty(width, height) {
      return createNodeImageHandle(width, height);
    },
    crop(image, x, y, width, height) {
      return cropNodeImage(image, x, y, width, height);
    },
    rotate90(image) {
      return rotateNodeImage90(image);
    },
    fill(target, x, y, source) {
      return fillNodeImage(target, x, y, source);
    },
    async encodePng(image) {
      const sharp = requireNode<typeof import("sharp")>("sharp");
      const BufferClass =
        requireNode<typeof import("node:buffer")>("node:buffer").Buffer;
      const native = nodeImageData(image);
      const encoded = await sharp(BufferClass.from(native.pixels), {
        raw: { width: native.width, height: native.height, channels: 4 },
      })
        .png()
        .toBuffer();
      return exactArrayBuffer(encoded);
    },
  };
  return {
    openDatabase: createNodeDatabase,
    files: nodeFileApi(),
    httpRequest: nodeHttpRequest,
    text: { encode: encodeText, decode: decodeText },
    clipboard: { read: getClipboardText, write: setClipboardText },
    ui: runtimeUi,
    images: runtimeImages,
  };
}

export const nodeAdapter: RuntimeAdapterDefinition = {
  id: "node",
  detect: () =>
    typeof process !== "undefined" && Boolean(process.versions?.node),
  create: createNodeAdapter,
};
