/**
 * Required host capabilities. This module contains types only: no detection,
 * host globals, dependencies or initialization. Hosts provide ES2021, console
 * and setTimeout/clearTimeout in addition to this contract.
 */
export type DatabasePrimitive =
  string | number | boolean | ArrayBuffer | ArrayBufferView | null | undefined;

export interface DatabaseStatement {
  sql: string;
  args?: DatabasePrimitive[];
}

export interface RuntimeDatabase {
  /** SQLite semantics; booleans bind as 0/1, undefined as NULL, BLOBs return owned ArrayBuffers. */
  query(sql: string, args?: DatabasePrimitive[]): DatabaseRow[];
  update(sql: string, args?: DatabasePrimitive[]): void;
  /** All statements commit together or roll back on any failure. SQL failures throw. */
  transaction(statements: DatabaseStatement[]): void;
  close(): void;
}

export type DatabaseValue = string | number | ArrayBuffer | null;
export type DatabaseRow = Record<string, DatabaseValue>;

export interface RuntimeHttpRequest {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?:
    Record<string, unknown> | string | ArrayBuffer | ArrayBufferView | null;
  /** Milliseconds; omitted or zero means no adapter-imposed timeout. */
  timeout?: number;
}

export interface RuntimeHttpResponse {
  /** HTTP errors (including 4xx/5xx) resolve; transport failures reject. */
  status: number;
  headers: Record<string, string>;
  body: ArrayBuffer;
  url: string;
  /** Preserve separate Set-Cookie values where the host exposes them; never split on commas. */
  setCookieHeaders: string[];
}

export interface RuntimeFileApi {
  /** Paths are relative to the adapter's storage root unless absolute. */
  exists(path: string): boolean;
  isDirectory(path: string): boolean;
  mkdir(path: string): boolean;
  /** List the direct children of a directory, or return null when unavailable. */
  list(path: string): string[] | null;
  /** UTF-8 text; null for missing/unreadable files. Empty files return "". */
  readText(path: string): string | null;
  /** Owned bytes; null for missing/unreadable files. */
  readBytes(path: string): ArrayBuffer | null;
  /** Mutations report host success; native exceptions may propagate. */
  writeText(path: string, content: string): boolean;
  writeBytes(path: string, content: ArrayBuffer | ArrayBufferView): boolean;
  /** Atomically rename a file when the host file system supports it. */
  move(source: string, destination: string): boolean;
  delete(path: string): boolean;
}

export interface RuntimeUiAction {
  text: string;
  callback: () => void | Promise<void>;
  style?: "text" | "filled" | "danger";
}

export interface RuntimeUiApi {
  showMessage(message: string): void;
  /** Resolve after dismissal/action completion; reject if the action fails. */
  showDialog(
    title: string,
    content: string,
    actions: RuntimeUiAction[],
  ): Promise<void>;
  launchUrl(url: string): void;
  /** Return an adapter-local id. User cancellation invokes onCancel if provided. */
  showLoading(onCancel?: (() => void) | null): number;
  /** Programmatic dismissal; must not invoke onCancel. Unknown ids are ignored. */
  cancelLoading(id: number): void;
  /** Return null on cancellation. A non-null validator message keeps the dialog open. */
  showInputDialog(
    title: string,
    validator?: (value: string) => string | null,
    image?: string | ArrayBuffer | null,
  ): Promise<string | null>;
  /** Return a zero-based index, or null on cancellation/empty options. */
  showSelectDialog(
    title: string,
    options: string[],
    initialIndex?: number | null,
  ): Promise<number | null>;
}

export interface RuntimeImageHandle {
  readonly width: number;
  readonly height: number;
  /** Opaque adapter-owned value. Shared code must not inspect or transfer it between adapters. */
  readonly native: unknown;
}

export interface RuntimeImageApi {
  /** Decode encoded image bytes; reject invalid data. Returned dimensions are pixels. */
  decode(data: ArrayBuffer | ArrayBufferView): Promise<RuntimeImageHandle>;
  /** A transparent image. Dimensions and rectangle coordinates must be valid integers. */
  empty(width: number, height: number): RuntimeImageHandle;
  crop(
    image: RuntimeImageHandle,
    x: number,
    y: number,
    width: number,
    height: number,
  ): RuntimeImageHandle;
  /** Return a new image rotated 90 degrees clockwise. */
  rotate90(image: RuntimeImageHandle): RuntimeImageHandle;
  /** Return the updated target; implementations may mutate or replace the target handle. */
  fill(
    target: RuntimeImageHandle,
    x: number,
    y: number,
    source: RuntimeImageHandle,
  ): RuntimeImageHandle;
  encodePng(image: RuntimeImageHandle): Promise<ArrayBuffer>;
}

export interface RuntimeTextApi {
  /** Return owned bytes. Views passed to decode must respect byteOffset/byteLength. */
  encode(value: string, encoding: "utf8" | "gbk"): ArrayBuffer;
  decode(
    value: ArrayBuffer | ArrayBufferView,
    encoding: "utf8" | "gbk",
  ): string;
}

export interface RuntimeClipboardApi {
  /** Empty clipboard returns "". Host read/write failures reject. */
  read(): Promise<string>;
  write(text: string): Promise<void>;
}

/** Every capability is mandatory. No silent fallback to another environment. */
export interface RuntimeAdapter {
  openDatabase(path: string): RuntimeDatabase;
  readonly files: RuntimeFileApi;
  httpRequest(request: RuntimeHttpRequest): Promise<RuntimeHttpResponse>;
  readonly text: RuntimeTextApi;
  readonly clipboard: RuntimeClipboardApi;
  readonly ui: RuntimeUiApi;
  readonly images: RuntimeImageApi;
}

export interface RuntimeAdapterDefinition {
  /** Unique, stable environment name; new hosts need no changes to a union type. */
  readonly id: string;
  /** Synchronous, side-effect-free; safe to call in every supported host. */
  detect(): boolean;
  /** Called only for the selected environment, once on first use. */
  create(): RuntimeAdapter;
}
