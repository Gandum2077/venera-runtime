import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createVeneraRuntime } from "../src/runtime";
import { loadVeneraConfigBySourceCode } from "../src/load-config";

interface ConfigIndexEntry {
  fileName: string;
  key: string;
  version: string;
}

const defaultConfigsDirectories = [
  "../venera-configs",
  "../Github/venera-configs",
  ".fixtures/venera-configs",
].map((directory) => resolve(process.cwd(), directory));
const configsDirectory = process.env.VENERA_CONFIGS_DIR
  ? resolve(process.env.VENERA_CONFIGS_DIR)
  : (defaultConfigsDirectories.find((directory) =>
      existsSync(resolve(directory, "index.json")),
    ) ?? defaultConfigsDirectories[0]);
const indexPath = resolve(configsDirectory, "index.json");

describe("real venera-configs compatibility", () => {
  it("loads every indexed config without running network init", () => {
    if (!existsSync(indexPath))
      throw new Error(
        `Missing venera-configs index: ${indexPath}. Set VENERA_CONFIGS_DIR before running test:compat.`,
      );
    const index = JSON.parse(
      readFileSync(indexPath, "utf8"),
    ) as ConfigIndexEntry[];
    const failures: string[] = [];
    for (const entry of index) {
      try {
        const sourceCode = readFileSync(
          resolve(configsDirectory, entry.fileName),
          "utf8",
        );
        const source = loadVeneraConfigBySourceCode(
          sourceCode,
          createVeneraRuntime(),
          false,
        );
        if (source.key !== entry.key)
          failures.push(
            `${entry.fileName}: key=${source.key}, expected=${entry.key}`,
          );
        if (!source.version)
          failures.push(`${entry.fileName}: source version is empty`);
      } catch (error) {
        failures.push(
          `${entry.fileName}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    expect(failures, failures.join("\n")).toEqual([]);
    expect(index.length).toBeGreaterThan(20);
  });
});

describe("real E-Hentai archive configuration", () => {
  it("resolves original ZIP URLs and H@H remote downloads without live requests", async () => {
    const { getArchiveDownloader } = await import("../src/archive");
    const { Network } = await import("../src/network");
    const source = loadVeneraConfigBySourceCode(
      readFileSync(resolve(configsDirectory, "ehentai.js"), "utf8"),
      createVeneraRuntime(),
      false,
    );
    const archive = getArchiveDownloader(source)!;
    const cid = "https://e-hentai.org/g/123/token/";
    const post = vi.spyOn(Network, "post").mockResolvedValue({
      status: 200,
      headers: {},
      body: '<a href="https://download.test/start">download</a>',
    });
    const get = vi.spyOn(Network, "get").mockResolvedValue({
      status: 200,
      headers: {},
      body: '<a href="/comic.zip">download</a>',
    });
    const head = vi
      .spyOn(Network, "sendRequest")
      .mockResolvedValue({ status: 200, headers: {}, body: "" });
    try {
      Object.defineProperty(source, "baseUrl", {
        value: "https://exhentai.org",
      });
      vi.spyOn(source.comic!, "loadInfo").mockResolvedValue({
        title: "Comic",
        cover: "",
      });
      get.mockResolvedValueOnce({
        status: 200,
        headers: {},
        body: `
        <table><tr><td><a onclick="do_hathdl('1280')">1280x</a><p>1280x</p><p>10 MB</p><p>Free</p></td></tr></table>
        <div id="db"><p>Header</p><div>
          <section><div><strong>20 GP</strong></div><p><strong>30 MB</strong></p></section>
          <section><div><strong>Free</strong></div><p><strong>10 MB</strong></p></section>
        </div></div>`,
      });
      expect(await archive.getArchives(cid)).toEqual([
        {
          id: "h@h_1280",
          title: "H@H 1280x",
          description: "Size: 10 MB, Cost: Free",
        },
        { id: "0", title: "Original", description: "Cost: 20 GP, Size: 30 MB" },
        { id: "1", title: "Resample", description: "Cost: Free, Size: 10 MB" },
      ]);
      expect(await archive.getDownloadUrl(cid, "0")).toBe(
        "https://download.test/comic.zip",
      );
      expect(post.mock.calls[0][2]).toBe(
        "dltype=org&dlcheck=Download+Original+Archive",
      );
      expect(get).toHaveBeenCalledWith("https://download.test/start", {
        http_client: "dart:io",
      });
      expect(head.mock.calls[0][0]).toBe("HEAD");
      head.mockResolvedValueOnce({ status: 410, headers: {}, body: "" });
      await expect(archive.getDownloadUrl(cid, "1")).rejects.toBe(
        "IP quota exhausted.",
      );
      post.mockResolvedValueOnce({
        status: 200,
        headers: {},
        body: "<p>Command sent</p>",
      });
      expect(await archive.getDownloadUrl(cid, "h@h_1280")).toBe("");
      expect(post.mock.calls.at(-1)?.[2]).toBe("hathdl_xres=1280");
      post.mockResolvedValueOnce({
        status: 200,
        headers: {},
        body: '<p class="br">H@H client required</p>',
      });
      await expect(archive.getDownloadUrl(cid, "h@h_org")).rejects.toBe(
        "You need an H@H client associated with your account to use this feature",
      );
    } finally {
      vi.restoreAllMocks();
    }
  });
});
