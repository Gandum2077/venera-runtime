import { describe, expect, it } from "vitest";
import { Convert } from "../src/convert";

function hex(value: ArrayBuffer | ArrayBufferView): string {
  return Convert.hexEncode(value);
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

  it("round-trips all AES modes exposed by Venera", () => {
    const value = Convert.encodeUtf8("sixteen-byte-msg");
    const key = Convert.encodeUtf8("0123456789abcdef");
    const iv = Convert.encodeUtf8("abcdef0123456789");
    expect(
      Convert.decodeUtf8(
        Convert.decryptAesEcb(Convert.encryptAesEcb(value, key), key),
      ),
    ).toBe("sixteen-byte-msg");
    expect(
      Convert.decodeUtf8(
        Convert.decryptAesCbc(Convert.encryptAesCbc(value, key, iv), key, iv),
      ),
    ).toBe("sixteen-byte-msg");
    expect(
      Convert.decodeUtf8(
        Convert.decryptAesCfb(
          Convert.encryptAesCfb(value, key, iv, 128),
          key,
          iv,
          128,
        ),
      ),
    ).toBe("sixteen-byte-msg");
    expect(
      Convert.decodeUtf8(
        Convert.decryptAesOfb(Convert.encryptAesOfb(value, key, 16), key, 16),
      ),
    ).toBe("sixteen-byte-msg");
  });

  it("reports RSA as intentionally unavailable", () => {
    expect(() => Convert.decryptRsa(new ArrayBuffer(0), "unused")).toThrow(
      "RSA decrypt is not implemented",
    );
  });
});
