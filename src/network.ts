import { httpRequest, RuntimeHttpRequest } from "./platform";
import { cookieJar } from "./cookiejar";
import { decodeUtf8 } from "./convert";
import type {
  CookieRecord,
  FetchCompatResponse,
  NetworkApi,
  NetworkResponse,
} from "./venera-types";

function normalizeHeaders(
  headers: Record<string, string> = {},
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value !== null && value !== undefined) result[key] = String(value);
  }
  return result;
}

function hasHeader(
  headers: Record<string, string>,
  expectedName: string,
): boolean {
  const expected = expectedName.toLowerCase();
  return Object.keys(headers).some((name) => name.toLowerCase() === expected);
}

function normalizeBody(data: unknown): RuntimeHttpRequest["body"] {
  if (data === null || data === undefined) return null;
  if (
    typeof data === "string" ||
    data instanceof ArrayBuffer ||
    ArrayBuffer.isView(data)
  )
    return data;
  if (typeof data === "object" && !Array.isArray(data))
    return data as Record<string, unknown>;
  return String(data);
}

function applyResponseCookies(url: string, headers: string[]): void {
  for (const header of headers) cookieJar.applySetCookieHeader(url, header);
}

async function request(
  method: string,
  url: string,
  headers?: Record<string, string>,
  data?: unknown,
  extra?: Record<string, unknown>,
): Promise<{
  status: number;
  headers: Record<string, string>;
  body: ArrayBuffer;
}> {
  const mergedHeaders = normalizeHeaders(headers);
  const cookieHeader = cookieJar.getCookieHeader(url);
  if (cookieHeader && !hasHeader(mergedHeaders, "cookie"))
    mergedHeaders.Cookie = cookieHeader;

  const response = await httpRequest({
    method,
    url,
    headers: mergedHeaders,
    body: normalizeBody(data),
    timeout: typeof extra?.timeout === "number" ? extra.timeout : undefined,
  });
  applyResponseCookies(response.url || url, response.setCookieHeaders);
  return {
    status: response.status,
    headers: response.headers,
    body: response.body,
  };
}

export const Network: NetworkApi = {
  async fetchBytes(
    method,
    url,
    headers,
    data,
    extra,
  ): Promise<NetworkResponse<ArrayBuffer>> {
    return request(method, url, headers, data, extra);
  },

  async sendRequest(
    method,
    url,
    headers,
    data,
    extra,
  ): Promise<NetworkResponse<string>> {
    const response = await request(method, url, headers, data, extra);
    return { ...response, body: decodeUtf8(response.body) };
  },

  get(url, headers, extra) {
    return this.sendRequest("GET", url, headers, null, extra);
  },

  post(url, headers, data, extra) {
    return this.sendRequest("POST", url, headers, data ?? null, extra);
  },

  put(url, headers, data, extra) {
    return this.sendRequest("PUT", url, headers, data ?? null, extra);
  },

  patch(url, headers, data, extra) {
    return this.sendRequest("PATCH", url, headers, data ?? null, extra);
  },

  delete(url, headers, extra) {
    return this.sendRequest("DELETE", url, headers, null, extra);
  },

  setCookies(url: string, cookies: CookieRecord[]): void {
    cookieJar.setCookies(url, cookies);
  },

  getCookies(url: string): CookieRecord[] {
    return cookieJar.getCookies(url);
  },

  deleteCookies(url: string): void {
    cookieJar.deleteCookies(url);
  },
};

/** 与 Venera 1.6.3 注入的 fetch 兼容。 */
export async function veneraFetch(
  url: string,
  options?: RequestInit,
): Promise<FetchCompatResponse> {
  const headers = new Headers(options?.headers);
  const normalizedHeaders: Record<string, string> = {};
  headers.forEach((value, key) => {
    normalizedHeaders[key] = value;
  });
  const response = await request(
    options?.method ?? "GET",
    url,
    normalizedHeaders,
    options?.body ?? null,
  );

  return {
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    statusText: "",
    headers: response.headers,
    arrayBuffer: async () => response.body.slice(0),
    text: async () => decodeUtf8(response.body),
    json: async () => JSON.parse(decodeUtf8(response.body)) as unknown,
  };
}
