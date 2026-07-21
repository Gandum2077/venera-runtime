import { CookieRecord } from "./venera-types";
import { DBManager, dbManager } from "./database";
import UrlParse from "url-parse";

/**
 * 将合并的Set-Cookie重新分开（修复JSBox的特殊问题）
 * @param setCookieStr string
 * @returns string[]
 */
function isWhitespace(char: string | undefined): boolean {
  return char === " " || char === "\t";
}

function isCookieSeparator(setCookieStr: string, startIndex: number): boolean {
  let index = startIndex;

  while (index < setCookieStr.length && isWhitespace(setCookieStr[index])) {
    index += 1;
  }

  let hasCookieName = false;
  while (index < setCookieStr.length) {
    const char = setCookieStr[index];
    if (char === "=") {
      return hasCookieName;
    }
    if (char === ";" || char === "," || isWhitespace(char)) {
      return false;
    }
    hasCookieName = true;
    index += 1;
  }

  return false;
}

function splitCookiesString(setCookieStr: string): string[] {
  if (!setCookieStr) return [];

  const cookies: string[] = [];
  let cookieStart = 0;

  for (let i = 0; i < setCookieStr.length; i++) {
    if (setCookieStr[i] !== "," || !isCookieSeparator(setCookieStr, i + 1)) {
      continue;
    }

    const cookie = setCookieStr.slice(cookieStart, i).trim();
    if (cookie) {
      cookies.push(cookie);
    }

    cookieStart = i + 1;
    while (
      cookieStart < setCookieStr.length &&
      isWhitespace(setCookieStr[cookieStart])
    ) {
      cookieStart += 1;
    }
  }

  const trailingCookie = setCookieStr.slice(cookieStart).trim();
  if (trailingCookie) {
    cookies.push(trailingCookie);
  }

  return cookies;
}

/**
 * 将单个的setCookie分解为格式化的数据
 * @param cookieStr string
 * @returns ParsedCookie
 */
function parseCookieString(cookieStr: string): CookieRecord {
  // 将单个 cookie 字符串以分号拆分成各部分
  const parts = cookieStr.split(";").map((part) => part.trim());
  const [nameValue, ...attributes] = parts;
  // 考虑 cookie value 可能包含 '=' 号
  const [name, ...valueParts] = nameValue.split("=");
  const value: string = valueParts.join("=");
  const cookieObj: CookieRecord = { name, value };
  let maxAge: number | undefined;

  // 解析其他属性（例如 expires、path、domain 等）
  attributes.forEach((attr) => {
    const [key, ...rest] = attr.split("=");
    const keyLower: string = key.trim().toLowerCase();
    const val: string = rest.join("=").trim();

    switch (keyLower) {
      case "domain":
        if (val) {
          cookieObj.domain = val;
        }
        break;
      case "path":
        if (val) {
          cookieObj.path = val;
        }
        break;
      case "expires":
        if (val) {
          cookieObj.expires = val;
        }
        break;
      case "max-age": {
        const seconds = Number(val);
        if (Number.isFinite(seconds)) {
          maxAge = Math.trunc(seconds);
          cookieObj.maxAge = maxAge;
        }
        break;
      }
      case "secure":
        cookieObj.secure = true;
        break;
      case "httponly":
        cookieObj.httpOnly = true;
        break;
      default:
        // 其它未知属性可忽略或按需处理
        break;
    }
  });

  // Max-Age takes precedence over Expires regardless of attribute order.
  if (maxAge !== undefined) {
    cookieObj.expires =
      maxAge <= 0
        ? new Date(0).toUTCString()
        : new Date(Date.now() + maxAge * 1_000).toUTCString();
  }

  return cookieObj;
}

function parseSetCookieHeader(setCookieHeader: string): CookieRecord[] {
  const cookieStrings = splitCookiesString(setCookieHeader);
  return cookieStrings.map(parseCookieString);
}

function domainMatches(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function defaultCookiePath(pathname: string): string {
  if (!pathname.startsWith("/") || pathname === "/") return "/";
  const lastSlash = pathname.lastIndexOf("/");
  return lastSlash <= 0 ? "/" : pathname.slice(0, lastSlash);
}

function normalizeCookie(
  cookie: CookieRecord,
  url: string,
): CookieRecord | null {
  const target = new UrlParse(url);
  const hostname = target.hostname.toLowerCase();
  const suppliedDomain = cookie.domain?.trim();
  const domain = (suppliedDomain || hostname).toLowerCase().replace(/^\.+/, "");
  if (!hostname || !domain || !domainMatches(hostname, domain)) return null;

  const hostOnly = cookie.hostOnly ?? !suppliedDomain;
  let expires = cookie.expires || null;
  if (cookie.maxAge != null && Number.isFinite(cookie.maxAge)) {
    expires =
      cookie.maxAge <= 0
        ? new Date(0).toUTCString()
        : new Date(Date.now() + cookie.maxAge * 1_000).toUTCString();
  }
  return {
    name: cookie.name,
    value: cookie.value,
    domain,
    path: cookie.path || defaultCookiePath(target.pathname || "/"),
    expires,
    secure: Boolean(cookie.secure),
    httpOnly: Boolean(cookie.httpOnly),
    hostOnly,
    maxAge: cookie.maxAge ?? null,
  };
}

function cookieMatches(cookie: CookieRecord, url: string): boolean {
  // 发请求前，根据目标地址筛一遍当前可用的 Cookie。
  const target = new UrlParse(url);
  const hostname = target.hostname.toLowerCase();
  const pathname = target.pathname || "/";

  const domain = cookie.domain ?? "";
  if (
    (cookie.hostOnly && hostname !== domain) ||
    (!cookie.hostOnly && !domainMatches(hostname, domain))
  ) {
    return false;
  }
  const cookiePath = cookie.path || "/";
  if (!pathname.startsWith(cookiePath)) {
    return false;
  }
  if (
    cookiePath !== "/" &&
    !cookiePath.endsWith("/") &&
    pathname.length > cookiePath.length &&
    pathname[cookiePath.length] !== "/"
  ) {
    return false;
  }
  if (cookie.secure && target.protocol !== "https:") {
    return false;
  }
  if (cookie.expires && Number.isFinite(Date.parse(cookie.expires))) {
    if (Date.now() > Date.parse(cookie.expires)) {
      return false;
    }
  }
  return true;
}

function isCookieExpired(cookie: CookieRecord): boolean {
  if (!cookie.expires || !Number.isFinite(Date.parse(cookie.expires))) {
    return false;
  }
  return Date.now() > Date.parse(cookie.expires);
}

function getCookieKey(cookie: CookieRecord): string {
  return `${cookie.name}\n${cookie.domain ?? ""}\n${cookie.path ?? "/"}`;
}

function isSameCookieKey(left: CookieRecord, right: CookieRecord): boolean {
  return (
    left.name === right.name &&
    (left.domain ?? "") === (right.domain ?? "") &&
    (left.path ?? "/") === (right.path ?? "/")
  );
}

function isSameCookieValue(left: CookieRecord, right: CookieRecord): boolean {
  return (
    isSameCookieKey(left, right) &&
    left.value === right.value &&
    (left.expires ?? null) === (right.expires ?? null) &&
    Boolean(left.secure) === Boolean(right.secure) &&
    Boolean(left.httpOnly) === Boolean(right.httpOnly) &&
    Boolean(left.hostOnly) === Boolean(right.hostOnly) &&
    (left.maxAge ?? null) === (right.maxAge ?? null)
  );
}

export class BrowserCookieJar {
  private _cookies: CookieRecord[] | null = null;
  private readonly database: DBManager;

  constructor(database: DBManager = dbManager) {
    this.database = database;
  }

  private get cookies(): CookieRecord[] {
    this._cookies ??= this.loadCookies();
    return this._cookies;
  }

  private loadCookies(): CookieRecord[] {
    const rows = this.database.query(
      `SELECT name, value, domain, path, expires, secure, httpOnly, hostOnly, maxAge FROM venera_runtime_cookiejar`,
    ) as Array<{
      name: string;
      value: string;
      domain: string;
      path: string;
      expires: string | null;
      secure: number;
      httpOnly: number;
      hostOnly: number;
      maxAge: number | null;
    }>;
    return rows.map((row) => ({
      name: row.name,
      value: row.value,
      domain: row.domain,
      path: row.path,
      expires: row.expires,
      secure: Boolean(row.secure),
      httpOnly: Boolean(row.httpOnly),
      hostOnly: Boolean(row.hostOnly),
      maxAge: row.maxAge,
    }));
  }

  private persist(
    upserts: CookieRecord[] = [],
    deletions: CookieRecord[] = [],
  ): void {
    if (upserts.length === 0 && deletions.length === 0) {
      return;
    }

    const statements: {
      sql: string;
      args?: (string | number | boolean | null)[];
    }[] = [];
    for (const cookie of deletions) {
      statements.push({
        sql: `DELETE FROM venera_runtime_cookiejar WHERE name = ? AND domain = ? AND path = ?`,
        args: [cookie.name, cookie.domain ?? "", cookie.path ?? "/"],
      });
    }
    for (const cookie of upserts) {
      statements.push({
        sql: `INSERT OR REPLACE INTO venera_runtime_cookiejar (name, value, domain, path, expires, secure, httpOnly, hostOnly, maxAge) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          cookie.name,
          cookie.value,
          cookie.domain ?? "",
          cookie.path ?? "/",
          cookie.expires ?? null,
          cookie.secure ? 1 : 0,
          cookie.httpOnly ? 1 : 0,
          cookie.hostOnly ? 1 : 0,
          cookie.maxAge ?? null,
        ],
      });
    }
    this.database.transactionUpdate(statements);
  }

  private pruneExpired(): void {
    const expired: CookieRecord[] = [];
    this._cookies = this.cookies.filter((cookie) => {
      if (isCookieExpired(cookie)) {
        expired.push(cookie);
        return false;
      }
      return true;
    });
    if (expired.length > 0) {
      this.persist([], expired);
    }
  }

  getCookies(url: string): CookieRecord[] {
    this.pruneExpired();
    return this.cookies
      .filter((cookie) => cookieMatches(cookie, url))
      .sort(
        (left, right) => (right.path ?? "/").length - (left.path ?? "/").length,
      )
      .map((cookie) => ({
        ...cookie,
        "max-age": cookie.maxAge ?? null,
        session: cookie.expires == null,
      }));
  }

  getCookieHeader(url: string): string {
    return this.getCookies(url)
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join("; ");
  }

  setCookies(url: string, cookies: CookieRecord[]): void {
    const storedCookies = this.cookies;
    const upserts = new Map<string, CookieRecord>();
    const deletions = new Map<string, CookieRecord>();
    for (const cookie of cookies) {
      const normalized = normalizeCookie(cookie, url);
      if (!normalized) continue;
      const key = getCookieKey(normalized);
      const currentIndex = storedCookies.findIndex((current) =>
        isSameCookieKey(current, normalized),
      );
      const current = currentIndex >= 0 ? storedCookies[currentIndex] : null;

      if (isCookieExpired(normalized)) {
        if (currentIndex >= 0) {
          storedCookies.splice(currentIndex, 1);
          upserts.delete(key);
          deletions.set(key, current!);
        }
        continue;
      }

      if (current && isSameCookieValue(current, normalized)) {
        continue;
      }

      if (currentIndex >= 0) {
        storedCookies[currentIndex] = normalized;
      } else {
        storedCookies.push(normalized);
      }
      deletions.delete(key);
      upserts.set(key, normalized);
    }
    this.persist([...upserts.values()], [...deletions.values()]);
  }

  deleteCookies(url: string): void {
    const target = new UrlParse(url);
    const deleted: CookieRecord[] = [];
    this._cookies = this.cookies.filter((cookie) => {
      const hostname = target.hostname.toLowerCase();
      const domain = cookie.domain ?? "";
      const shouldDelete = cookie.hostOnly
        ? hostname === domain
        : domainMatches(hostname, domain);
      if (shouldDelete) {
        deleted.push(cookie);
      }
      return !shouldDelete;
    });
    this.persist([], deleted);
  }

  applySetCookieHeader(url: string, cookieHeader: string | null): void {
    const cookies = parseSetCookieHeader(cookieHeader || "");
    if (cookies.length > 0) {
      this.setCookies(url, cookies);
    }
  }
}

/** 默认 Cookie 容器；首次 Cookie 操作时才从数据库读取。 */
export const cookieJar = new BrowserCookieJar();
