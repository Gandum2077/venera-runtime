import URLParse from "url-parse";

export function unsupportedFeature(message: string): never {
  // 对当前暂未支持的能力，统一抛出明确错误。
  throw new Error(message);
}

export type ArrayBufferLikeInput = ArrayBuffer | ArrayBufferView;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function toUint8Array(value: ArrayBufferLikeInput | number[]): Uint8Array {
  // 配置文件里有时传 ArrayBuffer，有时传 TypedArray，有时甚至直接传 number[]。
  // 这里统一收敛成 Uint8Array，后面的编码/哈希逻辑就简单很多。
  if (value instanceof Uint8Array) {
    return value;
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (Array.isArray(value)) {
    return Uint8Array.from(value);
  }
  throw new TypeError("Expected ArrayBuffer-compatible value");
}

export function toArrayBuffer(value: ArrayBufferLikeInput): ArrayBuffer {
  const bytes = toUint8Array(value);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function guessExtension(url: string): string {
  // 下载图片时用来猜测文件扩展名。
  try {
    const pathname = new URLParse(url).pathname;
    const matched = pathname.match(/\.([a-z0-9]+)$/i);
    if (matched?.[1]) {
      return matched[1].toLowerCase();
    }
  } catch {}
  return "bin";
}
