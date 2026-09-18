import CryptoJS from "crypto-js";
import { decodeText, encodeText } from "./platform";
import { ConvertApi } from "./venera-types";
import {
  ArrayBufferLikeInput,
  toUint8Array,
  unsupportedFeature,
} from "./tools";

function arrayBufferToWordArray(
  value: ArrayBufferLikeInput,
): CryptoJS.lib.WordArray {
  // `crypto-js` 的输入输出不是 ArrayBuffer，而是 WordArray。
  const bytes = toUint8Array(value);
  const words: number[] = [];
  for (let index = 0; index < bytes.length; index += 1) {
    words[index >>> 2] ??= 0;
    words[index >>> 2] |= bytes[index]! << (24 - (index % 4) * 8);
  }
  return CryptoJS.lib.WordArray.create(words, bytes.length);
}

function wordArrayToArrayBuffer(value: CryptoJS.lib.WordArray): ArrayBuffer {
  const bytes = new Uint8Array(value.sigBytes);
  for (let index = 0; index < value.sigBytes; index += 1) {
    bytes[index] =
      ((value.words[index >>> 2] ?? 0) >>> (24 - (index % 4) * 8)) & 0xff;
  }
  return bytes.buffer;
}

function encodeUtf8(value: string): ArrayBuffer {
  return encodeText(value, "utf8");
}

export function decodeUtf8(value: ArrayBufferLikeInput): string {
  return decodeText(value, "utf8");
}

function encodeGbk(value: string): ArrayBuffer {
  return encodeText(value, "gbk");
}

function decodeGbk(value: ArrayBufferLikeInput): string {
  return decodeText(value, "gbk");
}

function bytesToBase64(bytes: ArrayBufferLikeInput): string {
  const view = toUint8Array(bytes);
  let binary = "";
  for (let index = 0; index < view.length; index += 0x8000) {
    binary += String.fromCharCode(...view.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function base64ToArrayBuffer(value: string): ArrayBuffer {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

function normalizeHashName(hash: string): string {
  return hash.toLowerCase().replaceAll("-", "");
}

function hashWordArray(
  algorithm: "md5" | "sha1" | "sha256" | "sha512",
  value: ArrayBufferLikeInput,
): ArrayBuffer {
  const input = arrayBufferToWordArray(value);
  const output = {
    md5: CryptoJS.MD5,
    sha1: CryptoJS.SHA1,
    sha256: CryptoJS.SHA256,
    sha512: CryptoJS.SHA512,
  }[algorithm](input);
  return wordArrayToArrayBuffer(output);
}

function hmacWordArray(
  key: ArrayBufferLikeInput,
  value: ArrayBufferLikeInput,
  hash: string,
): CryptoJS.lib.WordArray {
  const input = arrayBufferToWordArray(value);
  const secret = arrayBufferToWordArray(key);
  switch (normalizeHashName(hash)) {
    case "md5":
      return CryptoJS.HmacMD5(input, secret);
    case "sha1":
      return CryptoJS.HmacSHA1(input, secret);
    case "sha256":
      return CryptoJS.HmacSHA256(input, secret);
    case "sha512":
      return CryptoJS.HmacSHA512(input, secret);
    default:
      throw new Error(`Unsupported HMAC hash: ${hash}`);
  }
}

function cipherParams(
  ciphertext: CryptoJS.lib.WordArray,
): CryptoJS.lib.CipherParams {
  return CryptoJS.lib.CipherParams.create({ ciphertext });
}

const AES_BLOCK_BYTES = 16;

function validateAesKey(key: ArrayBufferLikeInput): Uint8Array {
  const bytes = toUint8Array(key);
  if (![16, 24, 32].includes(bytes.byteLength)) {
    throw new Error("AES key must contain 16, 24, or 32 bytes");
  }
  return bytes;
}

function validateAesIv(iv: ArrayBufferLikeInput): Uint8Array {
  const bytes = toUint8Array(iv);
  if (bytes.byteLength !== AES_BLOCK_BYTES) {
    throw new Error("AES IV must contain exactly 16 bytes");
  }
  return bytes;
}

function validateBlockAlignedInput(
  value: ArrayBufferLikeInput,
  blockBytes: number,
): Uint8Array {
  const bytes = toUint8Array(value);
  if (bytes.byteLength % blockBytes !== 0) {
    throw new Error(
      `AES input length must be a multiple of ${blockBytes} bytes`,
    );
  }
  return bytes;
}

function validateFeedbackBlockSize(blockSize: number): number {
  if (
    !Number.isInteger(blockSize) ||
    blockSize < 8 ||
    blockSize > AES_BLOCK_BYTES * 8 ||
    blockSize % 8 !== 0
  ) {
    throw new Error(
      "AES feedback block size must be a multiple of 8 from 8 to 128 bits",
    );
  }
  return blockSize / 8;
}

function encryptWithAesBlockMode(
  value: ArrayBufferLikeInput,
  key: ArrayBufferLikeInput,
  mode: unknown,
  iv?: ArrayBufferLikeInput,
): ArrayBuffer {
  validateBlockAlignedInput(value, AES_BLOCK_BYTES);
  validateAesKey(key);
  if (iv) validateAesIv(iv);
  const encrypted = CryptoJS.AES.encrypt(
    arrayBufferToWordArray(value),
    arrayBufferToWordArray(key),
    {
      iv: iv ? arrayBufferToWordArray(iv) : undefined,
      mode: mode as never,
      padding: CryptoJS.pad.NoPadding,
    },
  );
  return wordArrayToArrayBuffer(encrypted.ciphertext);
}

function decryptWithAesBlockMode(
  value: ArrayBufferLikeInput,
  key: ArrayBufferLikeInput,
  mode: unknown,
  iv?: ArrayBufferLikeInput,
): ArrayBuffer {
  validateBlockAlignedInput(value, AES_BLOCK_BYTES);
  validateAesKey(key);
  if (iv) validateAesIv(iv);
  const decrypted = CryptoJS.AES.decrypt(
    cipherParams(arrayBufferToWordArray(value)),
    arrayBufferToWordArray(key),
    {
      iv: iv ? arrayBufferToWordArray(iv) : undefined,
      mode: mode as never,
      padding: CryptoJS.pad.NoPadding,
    },
  );
  return wordArrayToArrayBuffer(decrypted);
}

function encryptAesBlock(
  value: ArrayBufferLikeInput,
  key: ArrayBufferLikeInput,
): Uint8Array {
  const encrypted = encryptWithAesBlockMode(value, key, CryptoJS.mode.ECB);
  return new Uint8Array(encrypted);
}

function processAesFeedbackMode(
  value: ArrayBufferLikeInput,
  key: ArrayBufferLikeInput,
  initialRegister: ArrayBufferLikeInput,
  blockSize: number,
  mode: "cfb-encrypt" | "cfb-decrypt" | "ofb",
): ArrayBuffer {
  const segmentBytes = validateFeedbackBlockSize(blockSize);
  const input = validateBlockAlignedInput(value, segmentBytes);
  const secret = validateAesKey(key);
  const register = new Uint8Array(validateAesIv(initialRegister));
  const output = new Uint8Array(input.byteLength);

  for (let offset = 0; offset < input.byteLength; offset += segmentBytes) {
    const encryptedRegister = encryptAesBlock(register, secret);
    for (let index = 0; index < segmentBytes; index += 1) {
      output[offset + index] =
        input[offset + index]! ^ encryptedRegister[index]!;
    }

    register.copyWithin(0, segmentBytes);
    const feedback =
      mode === "cfb-decrypt"
        ? input.subarray(offset, offset + segmentBytes)
        : mode === "cfb-encrypt"
          ? output.subarray(offset, offset + segmentBytes)
          : encryptedRegister.subarray(0, segmentBytes);
    register.set(feedback, AES_BLOCK_BYTES - segmentBytes);
  }

  return output.buffer;
}

function hexEncode(value: ArrayBufferLikeInput): string {
  return Array.from(toUint8Array(value), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export const Convert: ConvertApi = {
  // 这一组方法直接模拟 Venera 的 `Convert`。
  encodeUtf8,
  decodeUtf8,
  encodeGbk,
  decodeGbk,
  encodeBase64: (value) => bytesToBase64(value),
  decodeBase64: (value) => base64ToArrayBuffer(value),
  md5: (value) => hashWordArray("md5", value),
  sha1: (value) => hashWordArray("sha1", value),
  sha256: (value) => hashWordArray("sha256", value),
  sha512: (value) => hashWordArray("sha512", value),
  hmac: (key, value, hash) =>
    wordArrayToArrayBuffer(hmacWordArray(key, value, hash)),
  hmacString: (key, value, hash) =>
    hmacWordArray(key, value, hash).toString(CryptoJS.enc.Hex),
  encryptAesEcb: (value, key) =>
    encryptWithAesBlockMode(value, key, CryptoJS.mode.ECB),
  decryptAesEcb: (value, key) =>
    decryptWithAesBlockMode(value, key, CryptoJS.mode.ECB),
  encryptAesCbc: (value, key, iv) =>
    encryptWithAesBlockMode(value, key, CryptoJS.mode.CBC, iv),
  decryptAesCbc: (value, key, iv) =>
    decryptWithAesBlockMode(value, key, CryptoJS.mode.CBC, iv),
  encryptAesCfb: (value, key, iv, blockSize) =>
    processAesFeedbackMode(value, key, iv, blockSize, "cfb-encrypt"),
  decryptAesCfb: (value, key, iv, blockSize) =>
    processAesFeedbackMode(value, key, iv, blockSize, "cfb-decrypt"),
  encryptAesOfb: (value, key, blockSize) =>
    processAesFeedbackMode(
      value,
      key,
      new Uint8Array(AES_BLOCK_BYTES),
      blockSize,
      "ofb",
    ),
  decryptAesOfb: (value, key, blockSize) =>
    processAesFeedbackMode(
      value,
      key,
      new Uint8Array(AES_BLOCK_BYTES),
      blockSize,
      "ofb",
    ),
  decryptRsa: () =>
    unsupportedFeature("RSA decrypt is not implemented in venera-runtime"),
  hexEncode,
};
