export function exactArrayBuffer(
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
