import { describe, expect, it, vi } from "vitest";
import { HtmlDocumentWrapper } from "../src/html-wrapper";
import { createVeneraRuntime } from "../src/runtime";
import { loadVeneraConfigBySourceCode } from "../src/load-config";
import { loadVeneraConfig } from "../src/package-api";
import { configManager } from "../src/config";

describe("HTML compatibility wrappers", () => {
  it("supports selectors, traversal, attributes and node conversion", () => {
    const document = new HtmlDocumentWrapper(`
      <main id="root"><p class="item active" data-id="1">A <b>B</b></p><!-- note --><p class="item">C</p></main>
    `);
    const root = document.getElementById("root")!;
    const items = root.querySelectorAll(".item");
    expect(items).toHaveLength(2);
    expect(items[0].text).toBe("A B");
    expect(items[0].attributes["data-id"]).toBe("1");
    expect(items[0].classNames).toEqual(["item", "active"]);
    expect(items[0].nextElementSibling?.text).toBe("C");
    expect(items[1].previousElementSibling?.text).toBe("A B");
    expect(root.nodes.some((node) => node.type === "comment")).toBe(true);
    expect(
      items[0].nodes.find((node) => node.type === "element")?.toElement()
        ?.localName,
    ).toBe("b");
  });
});

describe("Venera config runtime", () => {
  it("high-level loader schedules init without waiting for it", async () => {
    vi.useFakeTimers();
    try {
      const source = loadVeneraConfig(
        `
class AsyncSource extends ComicSource {
  name = "Async";
  key = "async_runtime_test_source";
  version = "1.0.0";
  async init() {
    await new Promise(resolve => setTimeout(resolve, 5));
    this.saveData("ready", true);
  }
}
`,
      );
      expect(source).not.toBeInstanceOf(Promise);
      expect(source.loadData("ready")).toBeUndefined();

      await vi.advanceTimersByTimeAsync(49);
      expect(source.loadData("ready")).toBeUndefined();

      await vi.advanceTimersByTimeAsync(6);
      expect(source.loadData("ready")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("loads a source, stores data/settings and exposes fixed app metadata", async () => {
    const globals = createVeneraRuntime();
    const source = loadVeneraConfigBySourceCode(
      `
class TestSource extends ComicSource {
  name = "Test";
  key = "runtime_test_source";
  version = "1.0.0";
  translation = { zh_CN: { hello: "你好" }, en: { hello: "Hello" } };
  settings = { mode: { title: "Mode", type: "select", default: "default", options: [] } };
  init() { this.saveData("initialized", true); }
}
`,
      globals,
    );
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(source.key).toBe("runtime_test_source");
    expect(source.loadSetting("mode")).toBe("default");
    expect(source.loadData("initialized")).toBe(true);
    source.saveData("bytes", Uint8Array.from([4, 5, 6]));
    expect(
      Array.from(new Uint8Array(source.loadData<ArrayBuffer>("bytes")!)),
    ).toEqual([4, 5, 6]);
    configManager.setSetting(source.key, "mode", "custom");
    expect(source.loadSetting("mode")).toBe("custom");
    source.deleteData("bytes");
    expect(source.loadData("bytes")).toBeUndefined();
    expect(globals.APP.version).toBe("1.6.3");
    expect(globals.APP.platform).toBe("ios");
    const sourceClass = globals.ComicSource as typeof globals.ComicSource & {
      sources: Record<string, typeof source>;
    };
    expect(sourceClass.sources[source.key]).toBe(source);
  });

  it("provides Venera model constructors and compute", async () => {
    const globals = createVeneraRuntime();
    const details = new globals.ComicDetails({
      title: "Title",
      cover: "cover",
      subTitle: "Subtitle",
    });
    expect(details.subtitle).toBe("Subtitle");
    expect(await globals.compute("(left, right) => left + right", 2, 3)).toBe(
      5,
    );
    expect(globals.randomInt(2, 3)).toBe(2);
    expect(globals.randomInt()).toBe(0);
    expect(globals.randomDouble()).toBeGreaterThanOrEqual(0);
    expect(globals.randomDouble()).toBeLessThan(1);
    const uuid = globals.createUuid();
    expect(uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-1[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("normalizes locale to Venera's language_COUNTRY form", () => {
    const previous = configManager.locale;
    try {
      configManager.locale = "zh-CN";
      expect(configManager.locale).toBe("zh_CN");
      configManager.locale = "zh-Hant";
      expect(configManager.locale).toBe("zh_TW");
      configManager.locale = "en_US";
      expect(configManager.locale).toBe("en_US");
    } finally {
      configManager.locale = previous;
    }
  });

  it("validates source metadata before registration", () => {
    const globals = createVeneraRuntime();
    const sourceCode = (fields: string, className = "ValidationSource") => `
class ${className} extends ComicSource {
  ${fields}
}
`;

    expect(() =>
      loadVeneraConfigBySourceCode(
        sourceCode('key = "valid_key"; version = "1.0.0";'),
        globals,
        false,
      ),
    ).toThrow("name is required");
    expect(() =>
      loadVeneraConfigBySourceCode(
        sourceCode('name = "Test"; version = "1.0.0";'),
        globals,
        false,
      ),
    ).toThrow("key is required");
    expect(() =>
      loadVeneraConfigBySourceCode(
        sourceCode('name = "Test"; key = "valid_key";'),
        globals,
        false,
      ),
    ).toThrow("version is required");
    expect(() =>
      loadVeneraConfigBySourceCode(
        sourceCode('name = "Test"; key = "invalid-key"; version = "1.0.0";'),
        globals,
        false,
      ),
    ).toThrow("key invalid-key is invalid");
    expect(() =>
      loadVeneraConfigBySourceCode(
        sourceCode('name = "Test"; key = "valid_key"; version = "1";'),
        globals,
        false,
      ),
    ).toThrow("version must be a valid semantic version");
    expect(() =>
      loadVeneraConfigBySourceCode(
        sourceCode(
          'name = "Test"; key = "valid_key"; version = "1.0.0"; minAppVersion = "invalid";',
        ),
        globals,
        false,
      ),
    ).toThrow("minAppVersion must be a valid semantic version");
    expect(() =>
      loadVeneraConfigBySourceCode(
        sourceCode(
          'name = "Test"; key = "valid_key"; version = "1.0.0"; minAppVersion = "9.0.0";',
        ),
        globals,
        false,
      ),
    ).toThrow("minAppVersion 9.0.0 is required");
    expect(globals.ComicSource.sources.valid_key).toBeUndefined();

    const first = loadVeneraConfigBySourceCode(
      sourceCode('name = "First"; key = "duplicate_key"; version = "1.0.0";'),
      globals,
      false,
    );
    const second = loadVeneraConfigBySourceCode(
      sourceCode(
        'name = "Second"; key = "duplicate_key"; version = "1.0.1";',
        "ReplacementSource",
      ),
      globals,
      false,
    );
    expect(first.name).toBe("First");
    expect(globals.ComicSource.sources.duplicate_key).toBe(second);
  });
});
