import { afterEach, describe, expect, it, vi } from "vitest";

const keys = ["$http", "$sqlite", "$file"] as const;
const originals = new Map<string, PropertyDescriptor | undefined>();

afterEach(() => {
  for (const key of keys) {
    const original = originals.get(key);
    if (original) Object.defineProperty(globalThis, key, original);
    else delete (globalThis as Record<string, unknown>)[key];
  }
  originals.clear();
  vi.resetModules();
});

describe("JSBox platform adapter", () => {
  it("calls the native HTTP method with $http as its receiver", async () => {
    for (const key of keys)
      originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));

    let receiver: unknown;
    let receivedOptions: Record<string, unknown> | undefined;
    const mockHttp = {
      async request(this: unknown, options: Record<string, unknown>) {
        receiver = this;
        receivedOptions = options;
        return {
          rawData: { byteArray: [] },
          response: {
            statusCode: 204,
            headers: {},
            url: "https://example.com/status/204",
          },
        };
      },
    };
    Object.defineProperties(globalThis, {
      $http: { configurable: true, value: mockHttp },
      $sqlite: { configurable: true, value: {} },
      $file: { configurable: true, value: {} },
    });
    vi.resetModules();

    const { httpRequest, getRuntimeEnvironment } = await import("../src/platform");
    const response = await httpRequest({
      method: "GET",
      url: "https://example.com/status/204",
      timeout: 8_000,
    });

    expect(getRuntimeEnvironment()).toBe("jsbox");
    expect(receiver).toBe(mockHttp);
    expect(receivedOptions?.timeout).toBe(8);
    expect(response.status).toBe(204);
    expect(response.body.byteLength).toBe(0);
  });
});
