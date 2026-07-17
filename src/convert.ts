import CryptoJS from "crypto-js";
import { decodeText, encodeText } from "./api";
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

function encryptWithAes(
  value: ArrayBufferLikeInput,
  key: ArrayBufferLikeInput,
  mode: unknown,
  iv?: ArrayBufferLikeInput,
): ArrayBuffer {
  const encrypted = CryptoJS.AES.encrypt(
    arrayBufferToWordArray(value),
    arrayBufferToWordArray(key),
    {
      iv: iv ? arrayBufferToWordArray(iv) : undefined,
      mode: mode as never,
      padding: CryptoJS.pad.Pkcs7,
    },
  );
  return wordArrayToArrayBuffer(encrypted.ciphertext);
}

function decryptWithAes(
  value: ArrayBufferLikeInput,
  key: ArrayBufferLikeInput,
  mode: unknown,
  iv?: ArrayBufferLikeInput,
): ArrayBuffer {
  const decrypted = CryptoJS.AES.decrypt(
    cipherParams(arrayBufferToWordArray(value)),
    arrayBufferToWordArray(key),
    {
      iv: iv ? arrayBufferToWordArray(iv) : undefined,
      mode: mode as never,
      padding: CryptoJS.pad.Pkcs7,
    },
  );
  return wordArrayToArrayBuffer(decrypted);
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
  encryptAesEcb: (value, key) => encryptWithAes(value, key, CryptoJS.mode.ECB),
  decryptAesEcb: (value, key) => decryptWithAes(value, key, CryptoJS.mode.ECB),
  encryptAesCbc: (value, key, iv) =>
    encryptWithAes(value, key, CryptoJS.mode.CBC, iv),
  decryptAesCbc: (value, key, iv) =>
    decryptWithAes(value, key, CryptoJS.mode.CBC, iv),
  encryptAesCfb: (value, key, iv) =>
    encryptWithAes(value, key, CryptoJS.mode.CFB, iv),
  decryptAesCfb: (value, key, iv) =>
    decryptWithAes(value, key, CryptoJS.mode.CFB, iv),
  encryptAesOfb: (value, key, blockSize) =>
    encryptWithAes(value, key, CryptoJS.mode.OFB, new Uint8Array(blockSize)),
  decryptAesOfb: (value, key, blockSize) =>
    decryptWithAes(value, key, CryptoJS.mode.OFB, new Uint8Array(blockSize)),
  decryptRsa: () =>
    unsupportedFeature("RSA decrypt is not implemented in venera-runtime"),
  hexEncode,
};
