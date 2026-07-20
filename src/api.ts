import type { CookieRecord } from "./venera-types";

export type RuntimeEnvironment = "node" | "jsbox";

export type DatabasePrimitive =
  string | number | boolean | ArrayBuffer | ArrayBufferView | null | undefined;

export interface DatabaseStatement {
  sql: string;
  args?: DatabasePrimitive[];
}

export interface RuntimeDatabase {
  query(sql: string, args?: DatabasePrimitive[]): Record<string, unknown>[];
  update(sql: string, args?: DatabasePrimitive[]): void;
  transaction(statements: DatabaseStatement[]): void;
  close(): void;
}

export interface RuntimeHttpRequest {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?:
    Record<string, unknown> | string | ArrayBuffer | ArrayBufferView | null;
  timeout?: number;
}

export interface RuntimeHttpResponse {
  status: number;
  headers: Record<string, string>;
  body: ArrayBuffer;
  url: string;
  setCookieHeaders: string[];
}

export interface RuntimeFileApi {
  exists(path: string): boolean;
  isDirectory(path: string): boolean;
  mkdir(path: string): boolean;
  readText(path: string): string | null;
  readBytes(path: string): ArrayBuffer | null;
  writeText(path: string, content: string): boolean;
  writeBytes(path: string, content: ArrayBuffer | ArrayBufferView): boolean;
  delete(path: string): boolean;
}

export interface RuntimeUiAction {
  text: string;
  callback: () => void | Promise<void>;
  style?: "text" | "filled" | "danger";
}

export interface RuntimeUiApi {
  showMessage(message: string): void;
  showDialog(
    title: string,
    content: string,
    actions: RuntimeUiAction[],
  ): Promise<void>;
  launchUrl(url: string): void;
  showLoading(onCancel?: (() => void) | null): number;
  cancelLoading(id: number): void;
  showInputDialog(
    title: string,
    validator?: (value: string) => string | null,
    image?: string | ArrayBuffer | null,
  ): Promise<string | null>;
  showSelectDialog(
    title: string,
    options: string[],
    initialIndex?: number | null,
  ): Promise<number | null>;
}

export interface RuntimeImageHandle {
  readonly width: number;
  readonly height: number;
  readonly native: unknown;
}

export interface RuntimeImageApi {
  decode(data: ArrayBuffer | ArrayBufferView): Promise<RuntimeImageHandle>;
  empty(width: number, height: number): RuntimeImageHandle;
  crop(
    image: RuntimeImageHandle,
    x: number,
    y: number,
    width: number,
    height: number,
  ): RuntimeImageHandle;
  rotate90(image: RuntimeImageHandle): RuntimeImageHandle;
  fill(
    target: RuntimeImageHandle,
    x: number,
    y: number,
    source: RuntimeImageHandle,
  ): RuntimeImageHandle;
  encodePng(image: RuntimeImageHandle): Promise<ArrayBuffer>;
}

export interface CliIo {
  write(message: string): void;
  read(prompt: string, signal?: AbortSignal): Promise<string | null>;
}

function detectEnvironment(): RuntimeEnvironment {
  if (
    typeof $http !== "undefined" &&
    typeof $sqlite !== "undefined" &&
    typeof $file !== "undefined"
  ) {
    return "jsbox";
  }
  if (typeof process !== "undefined" && process.versions?.node) {
    return "node";
  }
  throw new Error(
    "Unsupported environment. This library can only run in Node.js or JSBox.",
  );
}

export const runtimeEnvironment = detectEnvironment();
export const isNode = runtimeEnvironment === "node";
export const isJsBox = runtimeEnvironment === "jsbox";

function requireNode<T>(id: string): T {
  if (!isNode) {
    throw new Error(`Node.js module requested in JSBox: ${id}`);
  }
  // Keep Node built-ins and native dependencies out of the JSBox webpack bundle.
  const runtimeRequire = eval("require") as (moduleId: string) => T;
  return runtimeRequire(id);
}

async function importNode<T>(id: string): Promise<T> {
  if (!isNode) {
    throw new Error(`Node.js module requested in JSBox: ${id}`);
  }
  const runtimeImport = new Function("moduleId", "return import(moduleId)") as (
    moduleId: string,
  ) => Promise<T>;
  return runtimeImport(id);
}

function exactArrayBuffer(
  value: ArrayBuffer | ArrayBufferView | number[],
): ArrayBuffer {
  if (value instanceof ArrayBuffer) {
    return value.slice(0);
  }
  if (Array.isArray(value)) {
    return Uint8Array.from(value).buffer;
  }
  const bytes = new Uint8Array(
    value.buffer,
    value.byteOffset,
    value.byteLength,
  );
  return bytes.slice().buffer;
}

function normalizeDatabaseOutput(value: unknown): unknown {
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    return exactArrayBuffer(value);
  }
  if (isNode) {
    const BufferClass =
      requireNode<typeof import("node:buffer")>("node:buffer").Buffer;
    if (BufferClass.isBuffer(value)) {
      return exactArrayBuffer(value as Uint8Array);
    }
  }
  if (value && typeof value === "object" && "byteArray" in value) {
    return exactArrayBuffer((value as { byteArray: number[] }).byteArray);
  }
  return value;
}

function normalizeDatabaseRow(
  row: Record<string, unknown>,
): Record<string, unknown> {
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

function normalizeJsBoxDatabaseValue(
  value: DatabasePrimitive,
): string | number | boolean | NSData | null {
  if (value === null || value === undefined) return null;
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    return $data({
      byteArray: Array.from(new Uint8Array(exactArrayBuffer(value))),
    });
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

function createJsBoxDatabase(path: string): RuntimeDatabase {
  const database = $sqlite.open(path);
  return {
    query(sql, args = []) {
      const rows: Record<string, unknown>[] = [];
      const options =
        args.length > 0
          ? { sql, args: args.map(normalizeJsBoxDatabaseValue) }
          : sql;
      database.query(options, (resultSet, error) => {
        if (error) {
          throw new Error(String(error) || `SQLite query failed: ${sql}`);
        }
        while (resultSet.next()) {
          rows.push(
            normalizeDatabaseRow(
              resultSet.values as unknown as Record<string, unknown>,
            ),
          );
        }
        resultSet.close();
      });
      return rows;
    },
    update(sql, args = []) {
      const options =
        args.length > 0
          ? { sql, args: args.map(normalizeJsBoxDatabaseValue) }
          : sql;
      database.update(options);
    },
    transaction(statements) {
      database.beginTransaction();
      try {
        for (const statement of statements) {
          const args = statement.args ?? [];
          const options =
            args.length > 0
              ? {
                  sql: statement.sql,
                  args: args.map(normalizeJsBoxDatabaseValue),
                }
              : statement.sql;
          database.update(options);
        }
        database.commit();
      } catch (error) {
        database.rollback();
        throw error;
      }
    },
    close() {
      $sqlite.close(database);
    },
  };
}

export function openDatabase(path: string): RuntimeDatabase {
  return isNode ? createNodeDatabase(path) : createJsBoxDatabase(path);
}

function jsBoxFileApi(): RuntimeFileApi {
  return {
    exists: (path) => $file.exists(path),
    isDirectory: (path) => $file.isDirectory(path),
    mkdir: (path) => $file.mkdir(path),
    readText(path) {
      return $file.read(path)?.string ?? null;
    },
    readBytes(path) {
      const data = $file.read(path);
      return data ? exactArrayBuffer(data.byteArray) : null;
    },
    writeText(path, content) {
      return $file.write({ data: $data({ string: content }), path });
    },
    writeBytes(path, content) {
      return $file.write({
        data: $data({
          byteArray: Array.from(new Uint8Array(exactArrayBuffer(content))),
        }),
        path,
      });
    },
    delete: (path) => !$file.exists(path) || $file.delete(path),
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
    delete(path) {
      const resolvedPath = resolveNodePath(path);
      if (!fs.existsSync(resolvedPath)) return true;
      fs.rmSync(resolvedPath, { recursive: true, force: true });
      return true;
    },
  };
}

export const runtimeFiles: RuntimeFileApi = isNode
  ? nodeFileApi()
  : jsBoxFileApi();

export function encodeText(
  value: string,
  encoding: "utf8" | "gbk",
): ArrayBuffer {
  if (isJsBox) {
    const data = $data({
      string: value,
      encoding: encoding === "utf8" ? 4 : 2147485234,
    });
    return exactArrayBuffer(data.byteArray);
  }
  if (encoding === "utf8") {
    return new TextEncoder().encode(value).buffer;
  }
  const iconv = requireNode<typeof import("iconv-lite")>("iconv-lite");
  return exactArrayBuffer(iconv.encode(value, "gbk"));
}

export function decodeText(
  value: ArrayBuffer | ArrayBufferView,
  encoding: "utf8" | "gbk",
): string {
  if (isJsBox) {
    const data = $data({
      byteArray: Array.from(new Uint8Array(exactArrayBuffer(value))),
    });
    return $text.decodeData({
      data,
      encoding: encoding === "utf8" ? 4 : 2147485234,
    });
  }
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

async function jsBoxHttpRequest(
  request: RuntimeHttpRequest,
): Promise<RuntimeHttpResponse> {
  let body: Record<string, unknown> | NSData | undefined;
  if (request.body instanceof ArrayBuffer || ArrayBuffer.isView(request.body)) {
    body = $data({
      byteArray: Array.from(new Uint8Array(exactArrayBuffer(request.body))),
    });
  } else if (typeof request.body === "string") {
    body = $data({ string: request.body });
  } else if (request.body !== null && request.body !== undefined) {
    body = request.body;
  }
  // JSBox 的原生方法依赖 `$http` 作为调用接收者，不能先取出再独立调用。
  const response = await $http.request({
    method: request.method,
    url: request.url,
    header: request.headers,
    body,
    timeout:
      request.timeout === undefined
        ? undefined
        : Math.max(1, Math.ceil(request.timeout / 1000)),
  });
  if (response.error) {
    throw new Error(
      `Network request failed: ${response.error.localizedDescription}`,
    );
  }
  const headers = Object.fromEntries(
    Object.entries(response.response?.headers ?? {}).map(([key, value]) => [
      key,
      String(value),
    ]),
  );
  const setCookie = getHeader(headers, "set-cookie");
  return {
    status: response.response?.statusCode ?? 0,
    headers,
    body: exactArrayBuffer(response.rawData.byteArray),
    url: response.response?.url || request.url,
    setCookieHeaders: setCookie ? [setCookie] : [],
  };
}

export function httpRequest(
  request: RuntimeHttpRequest,
): Promise<RuntimeHttpResponse> {
  return isNode ? nodeHttpRequest(request) : jsBoxHttpRequest(request);
}

const UUID_GREGORIAN_OFFSET_MS = 12_219_292_800_000n;
const uuidNode = Uint8Array.from({ length: 6 }, () =>
  Math.floor(Math.random() * 256),
);
uuidNode[0] = uuidNode[0]! | 0x01;
let uuidClockSequence = Math.floor(Math.random() * 0x4000);
let lastUuidTimestampMs = -1;
let uuidTicksWithinMs = 0;

function uuidHex(value: number | bigint, width: number): string {
  return value.toString(16).padStart(width, "0");
}

/** Create the time-based UUID v1 exposed by Venera's configuration runtime. */
export function createUuid(): string {
  const wallClockMs = Date.now();
  let timestampMs = wallClockMs;

  if (wallClockMs > lastUuidTimestampMs) {
    uuidTicksWithinMs = 0;
  } else if (uuidTicksWithinMs < 9_999) {
    timestampMs = lastUuidTimestampMs;
    uuidTicksWithinMs += 1;
  } else {
    timestampMs = lastUuidTimestampMs + 1;
    uuidTicksWithinMs = 0;
  }
  if (wallClockMs < lastUuidTimestampMs) {
    uuidClockSequence = (uuidClockSequence + 1) & 0x3fff;
  }
  lastUuidTimestampMs = timestampMs;

  const timestamp =
    (BigInt(timestampMs) + UUID_GREGORIAN_OFFSET_MS) * 10_000n +
    BigInt(uuidTicksWithinMs);
  const timeLow = timestamp & 0xffffffffn;
  const timeMid = (timestamp >> 32n) & 0xffffn;
  const timeHighAndVersion = ((timestamp >> 48n) & 0x0fffn) | 0x1000n;
  const clockSequenceHigh = ((uuidClockSequence >> 8) & 0x3f) | 0x80;
  const clockSequenceLow = uuidClockSequence & 0xff;
  const node = Array.from(uuidNode, (byte) => uuidHex(byte, 2)).join("");

  return `${uuidHex(timeLow, 8)}-${uuidHex(timeMid, 4)}-${uuidHex(
    timeHighAndVersion,
    4,
  )}-${uuidHex(clockSequenceHigh, 2)}${uuidHex(clockSequenceLow, 2)}-${node}`;
}

export async function setClipboardText(text: string): Promise<void> {
  if (isJsBox) {
    $clipboard.text = text;
    return;
  }
  const clipboard = await importNode<{
    default: { write(text: string): Promise<void> };
  }>("clipboardy");
  await clipboard.default.write(text);
}

export async function getClipboardText(): Promise<string> {
  if (isJsBox) return $clipboard.text || "";
  const clipboard = await importNode<{ default: { read(): Promise<string> } }>(
    "clipboardy",
  );
  return clipboard.default.read();
}

const defaultCliIo: CliIo = {
  write(message) {
    console.log(message);
  },
  async read(prompt, signal) {
    const readline = requireNode<typeof import("node:readline/promises")>(
      "node:readline/promises",
    );
    const io = requireNode<typeof import("node:process")>("node:process");
    const session = readline.createInterface({
      input: io.stdin,
      output: io.stdout,
    });
    try {
      return signal
        ? await session.question(prompt, { signal })
        : await session.question(prompt);
    } finally {
      session.close();
    }
  },
};

let cliIo: CliIo = defaultCliIo;

export function setCliIo(value: CliIo): () => void {
  const previous = cliIo;
  cliIo = value;
  return () => {
    cliIo = previous;
  };
}

let loadingId = 0;
const loadingCancelCallbacks = new Map<number, (() => void) | null>();
const loadingCancelControllers = new Map<number, AbortController>();

function showJsBoxLoading(id: number, onCancel?: (() => void) | null): void {
  const viewId = `loading-mask-${id}`;
  const maskView: UiTypes.ViewOptions = {
    type: "view",
    props: { id: viewId, bgcolor: $color("clear") },
    layout: $layout.fill,
    views: [
      {
        type: "blur",
        props: { style: 3, radius: 13 },
        layout: (make, view) => {
          make.center.equalTo(view.super);
          make.size.equalTo($size(250, 151));
        },
        views: [
          {
            type: "spinner",
            props: { loading: true, color: $color("white") },
            layout: (make, view) => {
              make.centerX.equalTo(view.super);
              make.top.inset(28);
            },
          },
          {
            type: "label",
            props: {
              text: "Loading",
              textColor: $color("white"),
              font: $font("bold", 17),
            },
            layout: (make, view) => {
              make.centerX.equalTo(view.super);
              make.top.equalTo(view.prev.bottom).offset(18);
            },
          },
          ...(onCancel
            ? [
                {
                  type: "view" as const,
                  props: { bgcolor: $color("separator") },
                  layout: (make: MASConstraintMaker, view: UIView) => {
                    make.left.right.inset(0);
                    make.bottom.inset(44);
                    make.height.equalTo(1 / $device.info.screen.scale);
                  },
                },
                {
                  type: "button" as const,
                  props: {
                    title: "Cancel",
                    font: $font(16),
                    bgcolor: $color("clear"),
                  },
                  layout: (make: MASConstraintMaker, view: UIButtonView) => {
                    make.left.right.bottom.inset(0);
                    make.height.equalTo(44);
                  },
                  events: {
                    tapped: () => {
                      loadingCancelCallbacks.delete(id);
                      $ui.get(viewId)?.remove();
                      onCancel();
                    },
                  },
                },
              ]
            : []),
        ],
      },
    ],
  };
  $ui.window.add(maskView);
}

async function showJsBoxInputDialog(
  title: string,
  validator?: (value: string) => string | null,
  image?: string | ArrayBuffer | null,
): Promise<string | null> {
  const {
    Base,
    DialogSheet,
    Image: CViewImage,
    Input,
    Label,
    searchBarBgcolor,
  } = require("jsbox-cview") as typeof import("jsbox-cview");

  class LazyImage extends Base<UIView, UiTypes.ViewOptions> {
    private readonly url: string;
    _defineView: () => UiTypes.ViewOptions;

    constructor(url: string) {
      super();
      this.url = url;
      this._defineView = () => ({
        type: "view",
        props: { id: this.id },
        layout: (make, view) => {
          make.top.inset(15);
          make.centerX.equalTo(view.super);
          make.height.equalTo(100);
          make.left.right.inset(25);
        },
        views: [
          {
            type: "image",
            props: {
              id: `${this.id}-image`,
              contentMode: $contentMode.scaleAspectFit,
              bgcolor: $color("clear"),
            },
            layout: $layout.fill,
          },
          {
            type: "label",
            props: {
              id: `${this.id}-loadingLabel`,
              text: "图片正在加载...",
              textColor: $color("secondaryText"),
              font: $font(13),
            },
            layout: (make, view) => make.center.equalTo(view.super),
          },
        ],
        events: { ready: () => void this.load() },
      });
    }

    private async load(): Promise<void> {
      const response = await $http.get(this.url);
      if (
        response.error ||
        response.response.statusCode >= 300 ||
        !response.rawData.image
      ) {
        ($(this.id + "-loadingLabel") as UILabelView).text = "图片加载失败";
        return;
      }
      const nativeImage = response.rawData.image;
      ($(this.id + "-image") as UIImageView).image = nativeImage;
      $(this.id + "-loadingLabel").hidden = true;
      this.view.updateLayout((make) =>
        make.height.equalTo(Math.min(nativeImage.size.height, 300)),
      );
    }
  }

  class InputView extends Base<UIView, UiTypes.ViewOptions> {
    _defineView: () => UiTypes.ViewOptions;
    private readonly input: InstanceType<typeof Input>;
    private readonly errorLabel: InstanceType<typeof Label>;

    constructor(url?: string, nativeImage?: UIImage) {
      super();
      const views: UiTypes.AllViewOptions[] = [];
      const hasImage = Boolean(url || nativeImage);
      this.input = new Input({
        props: {
          bgcolor: searchBarBgcolor,
          font: $font(17),
          textColor: $color("primaryText"),
          align: $align.left,
          placeholder: "请输入",
        },
        layout: (make, view) => {
          if (hasImage) make.top.equalTo(view.prev.bottom).inset(15);
          else make.top.inset(30);
          make.left.right.inset(25);
          make.height.equalTo(44);
        },
        events: { changed: () => (this.errorText = "") },
      });
      this.errorLabel = new Label({
        props: {
          textColor: $color({ light: "#D14343", dark: "#FF8B8B" }),
          font: $font(13),
        },
        layout: (make, view) => {
          make.left.right.equalTo(view.prev);
          make.top.equalTo(view.prev.bottom).inset(5);
        },
      });
      views.push(this.input.definition, this.errorLabel.definition);
      if (nativeImage) {
        views.unshift(
          new CViewImage({
            props: { image: nativeImage },
            layout: (make, view) => {
              make.top.inset(15);
              make.centerX.equalTo(view.super);
              make.height.equalTo(Math.min(nativeImage.size.height, 300));
              make.left.right.inset(25);
            },
          }).definition,
        );
      } else if (url) {
        views.unshift(new LazyImage(url).definition);
      }
      this._defineView = () => ({
        type: "view",
        props: { id: this.id },
        layout: $layout.fill,
        views,
      });
    }

    get text(): string {
      return this.input.view.text;
    }

    set errorText(value: string) {
      this.errorLabel.view.text = value;
    }
  }

  let imageUrl: string | undefined;
  let nativeImage: UIImage | undefined;
  if (typeof image === "string") {
    imageUrl = image;
  } else if (image) {
    nativeImage = $data({
      byteArray: Array.from(new Uint8Array(exactArrayBuffer(image))),
    }).image;
    if (!nativeImage) throw new Error("无效的图片数据");
  }
  const inputView = new InputView(imageUrl, nativeImage);
  try {
    return await new Promise<string>((resolve, reject) => {
      const sheet = new DialogSheet({
        title,
        cview: inputView,
        bgcolor: $color("primarySurface"),
        doneButtonValidator: () => {
          const validationError = validator?.(inputView.text) ?? null;
          inputView.errorText = validationError || "";
          return !validationError;
        },
        doneHandler: () => inputView.text,
      });
      sheet.promisify(resolve, reject);
    });
  } catch (error) {
    if (error === "cancel") return null;
    throw error;
  }
}

export const runtimeUi: RuntimeUiApi = {
  showMessage(message) {
    if (isJsBox) {
      $ui.toast(message);
    } else {
      cliIo.write(`[Message] ${message}`);
    }
  },
  async showDialog(title, content, actions) {
    if (isNode) {
      cliIo.write(`[Dialog] ${title}\n${content}`);
      if (actions.length === 0) {
        await cliIo.read("Press Enter to close: ");
        return;
      }
      cliIo.write(
        actions
          .map((action, index) => `${index + 1}. ${action.text}`)
          .join("\n"),
      );
      while (true) {
        const value = await cliIo.read("Choice [1]: ");
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
        cliIo.write(
          `[Invalid choice] Enter a number from 1 to ${actions.length}`,
        );
      }
    }
    await new Promise<void>((resolve) => {
      $ui.alert({
        title,
        message: content,
        actions: (actions.length > 0
          ? actions
          : [{ text: "OK", callback: () => {} }]
        ).map((action) => ({
          title: action.text,
          style:
            action.style === "danger"
              ? $alertActionType.destructive
              : $alertActionType.default,
          handler: async () => {
            await action.callback();
            resolve();
          },
        })),
      });
    });
  },
  launchUrl(url) {
    if (isJsBox) {
      $app.openURL(url);
    } else {
      cliIo.write(`[Open URL] ${url}`);
    }
  },
  showLoading(onCancel) {
    const id = loadingId++;
    loadingCancelCallbacks.set(id, onCancel ?? null);
    if (isJsBox) {
      showJsBoxLoading(id, onCancel);
    } else {
      cliIo.write(`[Loading #${id}] started${onCancel ? " (cancelable)" : ""}`);
      if (onCancel) {
        const controller = new AbortController();
        loadingCancelControllers.set(id, controller);
        void cliIo
          .read(`[Loading #${id}] Press Enter to cancel: `, controller.signal)
          .then((value) => {
            if (value === null || !loadingCancelCallbacks.has(id)) return;
            loadingCancelCallbacks.delete(id);
            loadingCancelControllers.delete(id);
            cliIo.write(`[Loading #${id}] canceled`);
            onCancel();
          })
          .catch((error: unknown) => {
            if (
              !controller.signal.aborted &&
              (!(error instanceof Error) || error.name !== "AbortError")
            ) {
              cliIo.write(
                `[Loading #${id}] cancel input failed: ${String(error)}`,
              );
            }
          });
      }
    }
    return id;
  },
  cancelLoading(id) {
    if (!loadingCancelCallbacks.has(id)) return;
    loadingCancelCallbacks.delete(id);
    loadingCancelControllers.get(id)?.abort();
    loadingCancelControllers.delete(id);
    if (isJsBox) {
      $ui.get(`loading-mask-${id}`)?.remove();
    } else {
      cliIo.write(`[Loading #${id}] finished`);
    }
  },
  async showInputDialog(title, validator, image) {
    if (isJsBox) {
      return showJsBoxInputDialog(title, validator, image);
    }
    if (image)
      cliIo.write(
        `[Input image] ${typeof image === "string" ? image : `${image.byteLength} bytes`}`,
      );
    while (true) {
      const value = await cliIo.read(`[Input] ${title}: `);
      if (value === null) return null;
      const validationError = validator?.(value);
      if (!validationError) return value;
      cliIo.write(`[Validation error] ${validationError}`);
    }
  },
  async showSelectDialog(title, options, initialIndex) {
    if (options.length === 0) return null;
    if (isJsBox) {
      const { listDialog } =
        require("jsbox-cview") as typeof import("jsbox-cview");
      try {
        return await listDialog({
          title,
          items: options,
          value: initialIndex ?? undefined,
        });
      } catch (error) {
        if (error === "cancel") return null;
        throw error;
      }
    }
    cliIo.write(
      `[Select] ${title}\n${options.map((option, index) => `${index + 1}. ${option}`).join("\n")}`,
    );
    while (true) {
      const value = await cliIo.read(
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
      cliIo.write(
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

export const runtimeImages: RuntimeImageApi = {
  async decode(data) {
    if (isJsBox) {
      const nativeData = $data({
        byteArray: Array.from(new Uint8Array(exactArrayBuffer(data))),
      });
      const image = nativeData.image;
      if (!image) throw new Error("Invalid image data");
      return {
        width: image.size.width,
        height: image.size.height,
        native: image,
      };
    }
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
    if (isNode) return createNodeImageHandle(width, height);
    const image = $imagekit.render({ size: $size(width, height) }, () => {});
    return { width, height, native: image };
  },
  crop(image, x, y, width, height) {
    if (isNode) return cropNodeImage(image, x, y, width, height);
    const source = image.native as UIImage;
    let cropped: UIImage;
    if (x === 0 && y === 0) {
      cropped = $imagekit.cropTo(source, $size(width, height), 0);
    } else {
      const first = $imagekit.cropTo(source, $size(width + x, height + y), 0);
      cropped = $imagekit.cropTo(first, $size(width, height), 5);
    }
    return { width, height, native: cropped };
  },
  rotate90(image) {
    if (isNode) return rotateNodeImage90(image);
    const rotated = $imagekit.rotate(image.native as UIImage, -Math.PI * 0.5);
    return { width: image.height, height: image.width, native: rotated };
  },
  fill(target, x, y, source) {
    if (isNode) return fillNodeImage(target, x, y, source);
    const combined = $imagekit.combine(
      target.native as UIImage,
      source.native as UIImage,
      $point(x, y),
    );
    return { width: target.width, height: target.height, native: combined };
  },
  async encodePng(image) {
    if (isJsBox) {
      const data = (image.native as UIImage).png;
      if (!data) throw new Error("Failed to encode PNG");
      return exactArrayBuffer(data.byteArray);
    }
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

export function normalizeCookiesForStorage(
  cookies: CookieRecord[],
): CookieRecord[] {
  return cookies.map((cookie) => ({ ...cookie }));
}
