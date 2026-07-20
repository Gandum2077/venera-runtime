import { describe, expect, it } from "vitest";
import { Convert } from "../src/convert";

function hex(value: ArrayBuffer | ArrayBufferView): string {
  return Convert.hexEncode(value);
}

function bytes(value: string): Uint8Array {
  return Uint8Array.from(value.match(/../g) ?? [], (part) =>
    Number.parseInt(part, 16),
  );
}

describe("Convert", () => {
  it("matches standard hash and HMAC vectors", () => {
    const value = Convert.encodeUtf8("abc");
    expect(hex(Convert.md5(value))).toBe("900150983cd24fb0d6963f7d28e17f72");
    expect(hex(Convert.sha1(value))).toBe(
      "a9993e364706816aba3e25717850c26c9cd0d89d",
    );
    expect(hex(Convert.sha256(value))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(Convert.hmacString(Convert.encodeUtf8("key"), value, "sha256")).toBe(
      "9c196e32dc0175f86f4b1cb89289d6619de6bee699e4c378e68309ed97a1a6ab",
    );
  });

  it("round-trips UTF-8, GBK and Base64", () => {
    const utf8 = Convert.encodeUtf8("漫画📚");
    expect(Convert.decodeUtf8(utf8)).toBe("漫画📚");
    const gbk = Convert.encodeGbk("中文");
    expect(hex(gbk)).toBe("d6d0cec4");
    expect(Convert.decodeGbk(gbk)).toBe("中文");
    expect(
      Convert.decodeUtf8(Convert.decodeBase64(Convert.encodeBase64(utf8))),
    ).toBe("漫画📚");
  });

  it("matches raw AES vectors without adding PKCS#7 padding", () => {
    const ecbKey = bytes("000102030405060708090a0b0c0d0e0f");
    const ecbPlaintext = bytes("00112233445566778899aabbccddeeff");
    const ecbCiphertext = "69c4e0d86a7b0430d8cdb78070b4c55a";
    expect(hex(Convert.encryptAesEcb(ecbPlaintext, ecbKey))).toBe(
      ecbCiphertext,
    );
    expect(hex(Convert.decryptAesEcb(bytes(ecbCiphertext), ecbKey))).toBe(
      hex(ecbPlaintext),
    );
    expect(Convert.encryptAesEcb(ecbPlaintext, ecbKey).byteLength).toBe(16);
    expect(() => Convert.encryptAesEcb(new Uint8Array(15), ecbKey)).toThrow(
      "multiple of 16 bytes",
    );

    const key = bytes("2b7e151628aed2a6abf7158809cf4f3c");
    const iv = bytes("000102030405060708090a0b0c0d0e0f");
    const plaintext = bytes("6bc1bee22e409f96e93d7e117393172a");
    const cbcCiphertext = "7649abac8119b246cee98e9b12e9197d";
    expect(hex(Convert.encryptAesCbc(plaintext, key, iv))).toBe(cbcCiphertext);
    expect(hex(Convert.decryptAesCbc(bytes(cbcCiphertext), key, iv))).toBe(
      hex(plaintext),
    );
  });

  it("honors Venera's CFB and OFB feedback block size", () => {
    const key = bytes("2b7e151628aed2a6abf7158809cf4f3c");
    const iv = bytes("000102030405060708090a0b0c0d0e0f");
    const plaintext = bytes("6bc1bee22e409f96e93d7e117393172a");
    const cfb128 = "3b3fd92eb72dad20333449f8e83cfb4a";
    expect(hex(Convert.encryptAesCfb(plaintext, key, iv, 128))).toBe(cfb128);
    expect(hex(Convert.decryptAesCfb(bytes(cfb128), key, iv, 128))).toBe(
      hex(plaintext),
    );

    const zeroIv = new Uint8Array(16);
    const cfb8 = "1686d6e534f1c31434af11ff69ebede0";
    expect(hex(Convert.encryptAesCfb(plaintext, key, zeroIv, 8))).toBe(cfb8);
    expect(hex(Convert.decryptAesCfb(bytes(cfb8), key, zeroIv, 8))).toBe(
      hex(plaintext),
    );

    // Venera initializes OFB with KeyParameter only, which means a zero IV.
    const ofb128 = "1636d5ee34f80625d77f8e56ca884345";
    expect(hex(Convert.encryptAesOfb(plaintext, key, 128))).toBe(ofb128);
    expect(hex(Convert.decryptAesOfb(bytes(ofb128), key, 128))).toBe(
      hex(plaintext),
    );
  });

  it("reports RSA as intentionally unavailable", () => {
    expect(() => Convert.decryptRsa(new ArrayBuffer(0), "unused")).toThrow(
      "RSA decrypt is not implemented",
    );
  });
});
