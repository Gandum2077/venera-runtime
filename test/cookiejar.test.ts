import { afterEach, describe, expect, it } from "vitest";
import { BrowserCookieJar } from "../src/cookiejar";
import { DBManager } from "../src/database";

const managers: DBManager[] = [];

function createJar(): BrowserCookieJar {
  const manager = new DBManager(":memory:");
  managers.push(manager);
  return new BrowserCookieJar(manager);
}

afterEach(() => {
  while (managers.length > 0) managers.pop()!.close();
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
    expect(jar.getCookieHeader("http://example.com/")).not.toContain(
      "secure=3",
    );
    expect(jar.getCookieHeader("https://example.com/accounting")).not.toContain(
      "account=2",
    );
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
});
