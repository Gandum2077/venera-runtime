import { describe, expect, it } from "vitest";
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
  it("high-level loader waits for async init", async () => {
    const source = await loadVeneraConfig(
      `
class AsyncSource extends ComicSource {
  name = "Async";
  key = "async_runtime_test_source";
  version = "1";
  async init() {
    await new Promise(resolve => setTimeout(resolve, 5));
    this.saveData("ready", true);
  }
}
`,
    );
    expect(source.loadData("ready")).toBe(true);
  });

  it("loads a source, stores data/settings and exposes fixed app metadata", async () => {
    const globals = createVeneraRuntime();
    const source = loadVeneraConfigBySourceCode(
      `
class TestSource extends ComicSource {
  name = "Test";
  key = "runtime_test_source";
  version = "1";
  translation = { zh_CN: { hello: "你好" }, en: { hello: "Hello" } };
  settings = { mode: { title: "Mode", type: "select", default: "default", options: [] } };
  init() { this.saveData("initialized", true); }
}
`,
      globals,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
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
  });
});
