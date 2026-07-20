import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../src/api";
import { BrowserCookieJar } from "../src/cookiejar";
import { DBManager } from "../src/database";

const managers: DBManager[] = [];
const temporaryDirectories: string[] = [];

function createJar(): BrowserCookieJar {
  const manager = new DBManager(":memory:");
  managers.push(manager);
  return new BrowserCookieJar(manager);
}

afterEach(() => {
  while (managers.length > 0) managers.pop()!.close();
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop()!, { recursive: true, force: true });
  }
});

describe("BrowserCookieJar", () => {
  it("applies domain, path and secure matching", () => {
    const jar = createJar();
    jar.setCookies("https://example.com/account", [
      { name: "root", value: "1" },
      { name: "account", value: "2", path: "/account" },
      { name: "secure", value: "3", secure: true },
      { name: "domain", value: "4", domain: ".example.com" },
    ]);
    expect(
      jar.getCookieHeader("https://example.com/account/profile"),
    ).toContain("account=2");
    expect(jar.getCookieHeader("https://sub.example.com/")).toContain(
      "domain=4",
    );
    expect(jar.getCookieHeader("https://sub.example.com/")).not.toContain(
      "root=1",
    );
    expect(jar.getCookieHeader("http://example.com/")).not.toContain(
      "secure=3",
    );
    expect(jar.getCookieHeader("https://example.com/accounting")).not.toContain(
      "account=2",
    );
  });

  it("uses request-derived paths and honors Max-Age", () => {
    const jar = createJar();
    jar.applySetCookieHeader(
      "https://example.com/account/login",
      "scoped=1; Max-Age=3600",
    );
    expect(
      jar.getCookies("https://example.com/account/profile")[0],
    ).toMatchObject({ "max-age": 3600, session: false });
    expect(jar.getCookieHeader("https://example.com/account/profile")).toBe(
      "scoped=1",
    );
    expect(jar.getCookieHeader("https://example.com/elsewhere")).toBe("");

    jar.applySetCookieHeader(
      "https://example.com/account/login",
      "scoped=gone; Max-Age=0",
    );
    expect(jar.getCookieHeader("https://example.com/account/profile")).toBe("");
  });

  it("rejects cookies for unrelated domains", () => {
    const jar = createJar();
    jar.setCookies("https://example.com/", [
      { name: "invalid", value: "1", domain: "attacker.test" },
    ]);
    expect(jar.getCookies("https://example.com/")).toEqual([]);
  });

  it("splits merged Set-Cookie values without splitting Expires dates", () => {
    const jar = createJar();
    jar.applySetCookieHeader(
      "https://example.com/",
      "first=1; Expires=Wed, 21 Oct 2037 07:28:00 GMT; Path=/, second=2; Path=/",
    );
    expect(jar.getCookieHeader("https://example.com/")).toBe(
      "first=1; second=2",
    );
  });

  it("persists updates and deletions through SQLite", () => {
    const manager = new DBManager(":memory:");
    managers.push(manager);
    const first = new BrowserCookieJar(manager);
    first.setCookies("https://example.com/", [
      { name: "session", value: "value" },
    ]);
    expect(
      new BrowserCookieJar(manager).getCookieHeader("https://example.com/"),
    ).toBe("session=value");
    first.deleteCookies("https://example.com/");
    expect(
      new BrowserCookieJar(manager).getCookies("https://example.com/"),
    ).toEqual([]);
  });

  it("upgrades cookie columns in an existing database", () => {
    const directory = mkdtempSync(join(tmpdir(), "venera-cookie-migration-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "database.db");
    const oldDatabase = openDatabase(path);
    oldDatabase.update(`CREATE TABLE cookiejar (
      name TEXT NOT NULL,
      value TEXT NOT NULL,
      domain TEXT NOT NULL,
      path TEXT NOT NULL,
      expires TEXT,
      secure INTEGER NOT NULL DEFAULT 0,
      httpOnly INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (name, domain, path)
    )`);
    oldDatabase.close();

    const manager = new DBManager(path);
    managers.push(manager);
    const columns = manager.query("PRAGMA table_info(cookiejar)") as Array<{
      name: string;
    }>;
    expect(columns.map((column) => column.name)).toEqual(
      expect.arrayContaining(["hostOnly", "maxAge"]),
    );
  });
});
