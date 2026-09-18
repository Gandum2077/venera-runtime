import { afterEach, describe, expect, it, vi } from "vitest";
import type { RuntimeAdapter, RuntimeAdapterDefinition } from "../src/api";

function fixture(): RuntimeAdapter {
  const files = new Map<string, string>();
  let clipboard = "";
  const image = { width: 1, height: 1, native: null };
  return {
    openDatabase() {
      throw new Error("Fixture does not execute SQL");
    },
    files: {
      exists: (path) => files.has(path),
      isDirectory: () => false,
      mkdir: () => true,
      list: () => [],
      readText: (path) => files.get(path) ?? null,
      readBytes: (path) =>
        files.has(path)
          ? new TextEncoder().encode(files.get(path)).buffer
          : null,
      writeText(path, value) {
        files.set(path, value);
        return true;
      },
      writeBytes(path, value) {
        files.set(path, new TextDecoder().decode(value));
        return true;
      },
      move(from, to) {
        const value = files.get(from);
        if (value === undefined) return false;
        files.set(to, value);
        files.delete(from);
        return true;
      },
      delete(path) {
        files.delete(path);
        return true;
      },
    },
    async httpRequest(request) {
      return {
        status: 204,
        url: request.url,
        headers: {},
        body: new ArrayBuffer(0),
        setCookieHeaders: [],
      };
    },
    text: {
      encode: (value) => new TextEncoder().encode(value).buffer,
      decode: (value) => new TextDecoder().decode(value),
    },
    clipboard: {
      read: async () => clipboard,
      write: async (text) => {
        clipboard = text;
      },
    },
    ui: {
      showMessage() {},
      showDialog: async () => {},
      launchUrl() {},
      showLoading: () => 1,
      cancelLoading() {},
      showInputDialog: async () => null,
      showSelectDialog: async () => null,
    },
    images: {
      decode: async () => image,
      empty: () => image,
      crop: () => image,
      rotate90: () => image,
      fill: (target) => target,
      encodePng: async () => new ArrayBuffer(0),
    },
  };
}

function definition(id: string, adapter = fixture()): RuntimeAdapterDefinition {
  return { id, detect: () => true, create: () => adapter };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("runtime adapter registration", () => {
  it("allows registration after root import and routes core operations to the custom host", async () => {
    const runtime = await import("../src/index");
    const platform = await import("../src/platform");
    const adapter = fixture();
    const detect = vi.fn(() => true);
    const create = vi.fn(() => adapter);
    const ignored = vi.fn(() => {
      throw new Error("Must not initialize an unmatched host");
    });
    platform.registerRuntimeAdapter({
      id: "unused",
      detect: () => false,
      create: ignored,
    });
    platform.registerRuntimeAdapter({ id: "custom-host", detect, create });
    expect(create).not.toHaveBeenCalled();
    expect(runtime.logger.enabled).toBe(false);
    expect(platform.getRuntimeEnvironment()).toBe("custom-host");
    await platform.setClipboardText("custom clipboard");
    expect(await platform.getClipboardText()).toBe("custom clipboard");
    platform.runtimeFiles.writeText("test", "hello");
    expect(adapter.files.readText("test")).toBe("hello");
    expect(runtime.Convert.decodeUtf8(runtime.Convert.encodeUtf8("漫画"))).toBe(
      "漫画",
    );
    expect(
      runtime.loadVeneraConfig(
        `class Custom extends ComicSource { name="Custom"; key="custom"; version="1.0.0"; }`,
        { runInit: false },
      ).key,
    ).toBe("custom");
    expect(create).toHaveBeenCalledTimes(1);
    expect(detect).toHaveBeenCalledTimes(1);
    expect(ignored).not.toHaveBeenCalled();
    expect(() => platform.registerRuntimeAdapter(definition("later"))).toThrow(
      "already selected",
    );
  });

  it("rejects duplicate ids and ambiguous custom matches", async () => {
    const platform = await import("../src/platform");
    expect(() => platform.registerRuntimeAdapter(definition("node"))).toThrow(
      "already registered",
    );
    platform.registerRuntimeAdapter(definition("one"));
    expect(() => platform.registerRuntimeAdapter(definition("one"))).toThrow(
      "already registered",
    );
    platform.registerRuntimeAdapter(definition("two"));
    expect(() => platform.getRuntimeAdapter()).toThrow(
      "Ambiguous runtime adapters: one, two",
    );
  });

  it("validates every nested capability before accepting a JavaScript adapter", async () => {
    const platform = await import("../src/platform");
    const adapter = fixture();
    // Model an untyped JS consumer: TypeScript alone cannot validate its adapter.
    Reflect.deleteProperty(adapter.images, "encodePng");
    platform.registerRuntimeAdapter(definition("incomplete", adapter));
    expect(() => platform.getRuntimeAdapter()).toThrow(
      "incomplete.images.encodePng",
    );
  });

  it("preserves capability receivers and freezes the selected method table", async () => {
    const platform = await import("../src/platform");
    const adapter = fixture();
    adapter.files.exists = function () {
      return this === adapter.files;
    };
    platform.registerRuntimeAdapter(definition("receiver", adapter));
    expect(platform.runtimeFiles.exists("any")).toBe(true);
    expect(Object.isFrozen(platform.getRuntimeAdapter().files)).toBe(true);
    adapter.files.exists = () => false;
    expect(platform.runtimeFiles.exists("any")).toBe(true);
  });

  it("reports unsupported hosts lazily, without blocking registration", async () => {
    const platform = await import("../src/platform");
    vi.stubGlobal("process", undefined);
    try {
      expect(() => platform.getRuntimeAdapter()).toThrow(
        "Unsupported environment",
      );
      platform.registerRuntimeAdapter(definition("new-host"));
      expect(platform.getRuntimeEnvironment()).toBe("new-host");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("rejects asynchronous detection from untyped consumers", async () => {
    const platform = await import("../src/platform");
    platform.registerRuntimeAdapter({
      id: "async-detection",
      // @ts-expect-error Detection must be synchronous, including for JS callers.
      detect: async () => true,
      create: fixture,
    });
    expect(() => platform.getRuntimeAdapter()).toThrow(
      "detect() must return a boolean synchronously",
    );
  });

  it("rejects recursive initialization without falling back to Node", async () => {
    const platform = await import("../src/platform");
    platform.registerRuntimeAdapter({
      id: "recursive",
      detect: () => true,
      create: () => platform.getRuntimeAdapter(),
    });
    expect(() => platform.getRuntimeAdapter()).toThrow("Recursive runtime");
  });
});
