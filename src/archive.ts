import { unzipSync } from "fflate";
import { Network } from "./network";
import { runtimeFiles } from "./platform";
import { createUuid } from "./uuid";
import type {
  ArchiveDownloader,
  ArchiveInfo,
  VeneraConfigSource,
} from "./venera-types";

/** Optional source capability, preserving the configuration object's method receiver. */
export function getArchiveDownloader(
  source: VeneraConfigSource,
): ArchiveDownloader | null {
  const archive = source.comic?.archive;
  if (archive == null) return null;
  if (
    typeof archive.getArchives !== "function" ||
    typeof archive.getDownloadUrl !== "function"
  ) {
    throw new TypeError(
      "comic.archive requires getArchives and getDownloadUrl",
    );
  }
  return {
    async getArchives(cid) {
      const result: unknown = await archive.getArchives(cid);
      if (!Array.isArray(result))
        throw new TypeError("getArchives must return an array");
      return result.map((item: unknown): ArchiveInfo => {
        if (!item || typeof item !== "object")
          throw new TypeError("Invalid ArchiveInfo");
        const record = item as Record<string, unknown>;
        if (
          ["id", "title", "description"].some(
            (key) => typeof record[key] !== "string",
          )
        ) {
          throw new TypeError(
            "ArchiveInfo requires string id, title and description",
          );
        }
        return {
          id: record.id as string,
          title: record.title as string,
          description: record.description as string,
        };
      });
    },
    async getDownloadUrl(cid, aid) {
      const result: unknown = await archive.getDownloadUrl(cid, aid);
      if (typeof result !== "string")
        throw new TypeError("getDownloadUrl must return a string");
      return result;
    },
  };
}

export type ArchiveDownloadResult =
  | { status: "remote" }
  | { status: "downloaded"; directory: string; files: string[]; url: string };

export interface ArchiveDownloadOptions {
  /** New directory; existing destinations are never overwritten. Parent must exist. */
  directory: string;
  /** Maximum declared uncompressed ZIP size; defaults to 512 MiB. */
  maxExtractedBytes?: number;
  headers?: Record<string, string>;
}

function safeEntry(name: string): void {
  if (
    !name ||
    name.startsWith("/") ||
    name.includes("\\") ||
    name.includes(":") ||
    Array.from(name).some((character) => character.charCodeAt(0) < 32) ||
    name.split("/").some((part) => part === ".." || part === "." || part === "")
  ) {
    throw new Error(`Unsafe ZIP entry: ${name}`);
  }
}

/** Downloads and extracts a chapterless comic ZIP using the selected host's file API. */
export async function downloadComicArchive(
  source: VeneraConfigSource,
  cid: string,
  aid: string,
  options: ArchiveDownloadOptions,
): Promise<ArchiveDownloadResult> {
  const archive = getArchiveDownloader(source);
  if (!archive) throw new Error("This source does not support comic.archive");
  if (!options.directory || options.directory.endsWith("/"))
    throw new Error(
      "A destination directory without a trailing slash is required",
    );
  const limit = options.maxExtractedBytes ?? 512 * 1024 * 1024;
  if (!Number.isSafeInteger(limit) || limit <= 0)
    throw new Error("maxExtractedBytes must be a positive safe integer");
  if (runtimeFiles.exists(options.directory))
    throw new Error("Archive destination already exists");
  // This call can trigger a remote H@H download; never retry it automatically.
  const url = await archive.getDownloadUrl(cid, aid);
  if (url === "") return { status: "remote" };
  if (!/^https?:\/\//i.test(url))
    throw new Error("Archive URL must use HTTP or HTTPS");
  const response = await Network.fetchBytes("GET", url, options.headers);
  if (response.status < 200 || response.status >= 300)
    throw new Error(`Archive download failed: HTTP ${response.status}`);
  const bytes = new Uint8Array(response.body);
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b)
    throw new Error("Archive must be a ZIP file");
  let total = 0;
  const entries = unzipSync(bytes, {
    filter(entry) {
      safeEntry(
        entry.name.endsWith("/") ? entry.name.slice(0, -1) : entry.name,
      );
      total += entry.originalSize;
      if (total > limit) throw new Error("Archive exceeds maxExtractedBytes");
      return true;
    },
  });
  const files = Object.keys(entries).filter((name) => !name.endsWith("/"));
  if (files.length === 0) throw new Error("Archive contains no files");
  const temporary = `${options.directory}.archive-${createUuid()}`;
  if (runtimeFiles.exists(temporary))
    throw new Error("Archive temporary directory already exists");
  if (!runtimeFiles.mkdir(temporary))
    throw new Error("Failed to create archive temporary directory");
  try {
    for (const name of files) {
      const parts = name.split("/");
      parts.pop();
      let parent = temporary;
      for (const part of parts) {
        parent += `/${part}`;
        if (!runtimeFiles.exists(parent) && !runtimeFiles.mkdir(parent))
          throw new Error(`Failed to create directory: ${parent}`);
      }
      if (!runtimeFiles.writeBytes(`${temporary}/${name}`, entries[name]))
        throw new Error(`Failed to write archive entry: ${name}`);
    }
    if (runtimeFiles.exists(options.directory))
      throw new Error("Archive destination already exists");
    if (!runtimeFiles.move(temporary, options.directory))
      throw new Error("Failed to publish extracted archive");
    return {
      status: "downloaded",
      directory: options.directory,
      files: files.sort(),
      url,
    };
  } finally {
    if (runtimeFiles.exists(temporary)) runtimeFiles.delete(temporary);
  }
}
