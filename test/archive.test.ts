import { afterEach, describe, expect, it, vi } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { downloadComicArchive, getArchiveDownloader } from "../src/archive";
import { loadVeneraConfig } from "../src/package-api";
import { Network } from "../src/network";
import { runtimeFiles } from "../src/platform";

function source(url = "https://example.test/comic.zip") {
  return loadVeneraConfig(
    `class ArchiveSource extends ComicSource {
    name = "Archive test"; key = "archive_test"; version = "1.0.0";
    comic = { archive: {
      marker: "original",
      async getArchives(cid) { return [{ id: this.marker, title: cid, description: "ZIP" }]; },
      async getDownloadUrl(cid, aid) { if (cid !== "comic" || aid !== "original") throw "invalid selection"; return ${JSON.stringify(url)}; }
    }};
  }`,
    { runInit: false },
  );
}
const root = "archive-tests";
afterEach(() => {
  vi.restoreAllMocks();
  runtimeFiles.delete(root);
});
function response(entries: Record<string, Uint8Array>, status = 200) {
  const zip = zipSync(entries);
  return vi
    .spyOn(Network, "fetchBytes")
    .mockResolvedValue({ status, headers: {}, body: zip.slice().buffer });
}
const options = { directory: `${root}/comic` };

describe("comic.archive", () => {
  it("loads both methods with their receiver and preserves optional absence", async () => {
    const config = source();
    const archive = getArchiveDownloader(config)!;
    expect(await archive.getArchives("comic")).toEqual([
      { id: "original", title: "comic", description: "ZIP" },
    ]);
    expect(await archive.getDownloadUrl("comic", "original")).toBe(
      "https://example.test/comic.zip",
    );
    await expect(archive.getDownloadUrl("wrong", "original")).rejects.toBe(
      "invalid selection",
    );
    delete config.comic!.archive;
    expect(getArchiveDownloader(config)).toBeNull();
    await expect(
      downloadComicArchive(config, "comic", "original", options),
    ).rejects.toThrow("does not support");
  });
  it("validates configuration and result shapes", async () => {
    const config = source();
    Object.assign(config.comic!.archive!, {
      getArchives: () => [{ id: 1 }],
      getDownloadUrl: () => null,
    });
    await expect(
      getArchiveDownloader(config)!.getArchives("comic"),
    ).rejects.toThrow("ArchiveInfo");
    await expect(
      getArchiveDownloader(config)!.getDownloadUrl("comic", "original"),
    ).rejects.toThrow("string");
    Object.assign(config.comic!.archive!, { getArchives: null });
    expect(() => getArchiveDownloader(config)).toThrow("requires");
  });
  it("treats an empty URL as remote download without network or file mutations", async () => {
    const fetch = vi.spyOn(Network, "fetchBytes");
    expect(
      await downloadComicArchive(source(""), "comic", "original", options),
    ).toEqual({ status: "remote" });
    expect(fetch).not.toHaveBeenCalled();
    expect(runtimeFiles.exists(root)).toBe(false);
  });
  it("downloads binary ZIP and publishes nested files", async () => {
    runtimeFiles.mkdir(root);
    const fetch = response({
      "pages/001.jpg": Uint8Array.of(0, 255, 1),
      "info.txt": strToU8("漫画"),
    });
    const result = await downloadComicArchive(
      source(),
      "comic",
      "original",
      options,
    );
    expect(result).toMatchObject({
      status: "downloaded",
      files: ["info.txt", "pages/001.jpg"],
    });
    expect(runtimeFiles.readText(`${options.directory}/info.txt`)).toBe("漫画");
    expect(
      new Uint8Array(
        runtimeFiles.readBytes(`${options.directory}/pages/001.jpg`)!,
      ),
    ).toEqual(Uint8Array.of(0, 255, 1));
    expect(runtimeFiles.list(root)).toEqual(["comic"]);
    expect(fetch).toHaveBeenCalledWith(
      "GET",
      "https://example.test/comic.zip",
      undefined,
    );
    await expect(
      downloadComicArchive(source(), "comic", "original", options),
    ).rejects.toThrow("already exists");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each([
    "../escape.jpg",
    "/escape.jpg",
    "C:/escape.jpg",
    "pages\\escape.jpg",
  ])("rejects unsafe ZIP entry %s", async (name) => {
    runtimeFiles.mkdir(root);
    response({ [name]: strToU8("bad") });
    await expect(
      downloadComicArchive(source(), "comic", "original", options),
    ).rejects.toThrow("Unsafe ZIP entry");
    expect(runtimeFiles.list(root)).toEqual([]);
  });
  it("rejects HTTP failures, malformed ZIP and excessive extracted sizes", async () => {
    runtimeFiles.mkdir(root);
    const fetch = response({ "page.jpg": strToU8("12345") }, 410);
    await expect(
      downloadComicArchive(source(), "comic", "original", options),
    ).rejects.toThrow("410");
    fetch.mockResolvedValueOnce({
      status: 200,
      headers: {},
      body: strToU8("html").slice().buffer,
    });
    await expect(
      downloadComicArchive(source(), "comic", "original", options),
    ).rejects.toThrow("ZIP");
    response({ "page.jpg": strToU8("12345") });
    await expect(
      downloadComicArchive(source(), "comic", "original", {
        ...options,
        maxExtractedBytes: 4,
      }),
    ).rejects.toThrow("maxExtractedBytes");
    expect(runtimeFiles.list(root)).toEqual([]);
  });
  it("cleans partial writes and does not publish failed extraction", async () => {
    runtimeFiles.mkdir(root);
    response({ "page.jpg": strToU8("image") });
    vi.spyOn(runtimeFiles, "writeBytes").mockReturnValue(false);
    await expect(
      downloadComicArchive(source(), "comic", "original", options),
    ).rejects.toThrow("Failed to write");
    expect(runtimeFiles.list(root)).toEqual([]);
  });
});
