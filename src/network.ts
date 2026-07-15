import { CookieRecord, NetworkApi, NetworkResponse } from "./venera-types";
import { cookieJar } from "./cookiejar";
import { toUint8Array } from "./tools";

function normalizeHeaders(headers: Record<string, string> = {}): Record<string, string> {
  // 过滤掉 null / undefined，并保证所有 header 值都是字符串。
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value !== null && value !== undefined) {
      result[key] = String(value);
    }
  }
  return result;
}

export const Network: NetworkApi = {
  /**
   * Sends an HTTP request.
   * @param {string} method - The HTTP method (e.g., GET, POST, PUT, PATCH, DELETE).
   * @param {string} url - The URL to send the request to.
   * @param {Object} headers - The headers to include in the request.
   * @param data - The data to send with the request.
   * @param {Object} extra - Extra options to pass to the interceptor.
   * @returns {Promise<{status: number, headers: {}, body: ArrayBuffer}>} The response from the request.
   */
  async fetchBytes(
    method: string,
    url: string,
    headers?: Record<string, string>,
    data?: Record<string, unknown> | ArrayBuffer | Uint8Array | ArrayBufferView | null,
    extra?: Record<string, unknown>,
  ): Promise<NetworkResponse<ArrayBuffer>> {
    let body: Record<string, unknown> | NSData | undefined = undefined;
    if (data instanceof ArrayBuffer || ArrayBuffer.isView(data) || data instanceof Uint8Array) {
      body = $data({ byteArray: toUint8Array(data) });
    } else if (data && typeof data === "object") {
      body = data as Record<string, unknown>;
    }
    const mergedHeaders = normalizeHeaders(headers);
    const cookieHeader = cookieJar.getCookieHeader(url);
    if (cookieHeader && !mergedHeaders.cookie && !mergedHeaders.Cookie) {
      mergedHeaders.Cookie = cookieHeader;
    }
    const response = await $http.request({
      method,
      url,
      header: mergedHeaders,
      body,
      timeout: typeof extra?.timeout === "number" ? extra.timeout : undefined,
    });
    if (response.error) {
      throw new Error(`Network request failed: ${response.error.localizedDescription}`);
    }
    if (response.response?.headers?.["Set-Cookie"]) {
      const setCookieHeader = response.response.headers["Set-Cookie"];
      cookieJar.applySetCookieHeader(response.response.url || url, setCookieHeader);
    }
    return {
      status: response.response.statusCode,
      headers: response.response.headers,
      body: new Uint8Array(response.rawData.byteArray).buffer,
    };
  },

  /**
   * Sends an HTTP request.
   * @param {string} method - The HTTP method (e.g., GET, POST, PUT, PATCH, DELETE).
   * @param {string} url - The URL to send the request to.
   * @param {Object} headers - The headers to include in the request.
   * @param data - The data to send with the request.
   * @param {Object} extra - Extra options to pass to the interceptor.
   * @returns {Promise<{status: number, headers: {}, body: string}>} The response from the request.
   */
  async sendRequest(
    method: string,
    url: string,
    headers?: Record<string, string>,
    data?: Record<string, unknown> | ArrayBuffer | Uint8Array | ArrayBufferView | null,
    extra?: Record<string, unknown>,
  ): Promise<NetworkResponse<string>> {
    let body: Record<string, unknown> | NSData | undefined = undefined;
    if (data instanceof ArrayBuffer || ArrayBuffer.isView(data) || data instanceof Uint8Array) {
      body = $data({ byteArray: toUint8Array(data) });
    } else if (data && typeof data === "object") {
      body = data as Record<string, unknown>;
    }
    const mergedHeaders = normalizeHeaders(headers);
    const cookieHeader = cookieJar.getCookieHeader(url);
    if (cookieHeader && !mergedHeaders.cookie && !mergedHeaders.Cookie) {
      mergedHeaders.Cookie = cookieHeader;
    }
    const response = await $http.request({
      method,
      url,
      header: mergedHeaders,
      body,
    });
    if (response.error) {
      throw new Error(`Network request failed: ${response.error.localizedDescription}`);
    }
    if (response.response?.headers?.["Set-Cookie"]) {
      const setCookieHeader = response.response.headers["Set-Cookie"];
      cookieJar.applySetCookieHeader(response.response.url || url, setCookieHeader);
    }

    return {
      status: response.response.statusCode,
      headers: response.response.headers,
      body: response.rawData.string || "",
    };
  },

  async get(url, headers, extra): Promise<NetworkResponse<string>> {
    return this.sendRequest("GET", url, headers, null, extra);
  },

  async post(url, headers, data, extra): Promise<NetworkResponse<string>> {
    return this.sendRequest("POST", url, headers, data ?? null, extra);
  },

  async put(url, headers, data, extra): Promise<NetworkResponse<string>> {
    return this.sendRequest("PUT", url, headers, data ?? null, extra);
  },

  async patch(url, headers, data, extra): Promise<NetworkResponse<string>> {
    return this.sendRequest("PATCH", url, headers, data ?? null, extra);
  },

  async delete(url, headers, extra): Promise<NetworkResponse<string>> {
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

/**
 * [fetch] function for sending HTTP requests. Same api as the browser fetch.
 * @param {string} url
 * @param {{method?: string, headers?: Object, body?: any}} [options]
 * @returns {Promise<{ok: boolean, status: number, statusText: string, headers: {}, arrayBuffer: (function(): Promise<ArrayBuffer>), text: (function(): Promise<string>), json: (function(): Promise<any>)}>}
 * @since 1.2.0
 */
export async function veneraFetch(
  url: string,
  options?: { method?: string; headers?: Record<string, string>; body?: any },
): Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  headers: {};
  arrayBuffer: () => Promise<ArrayBuffer>;
  text: () => Promise<string>;
  json: () => Promise<any>;
}> {
  const method = options?.method ?? "GET";
  const headers = options?.headers;
  const data = options?.body;
  let body: Record<string, unknown> | NSData | undefined = undefined;
  if (data instanceof ArrayBuffer || ArrayBuffer.isView(data) || data instanceof Uint8Array) {
    body = $data({ byteArray: toUint8Array(data) });
  } else if (data && typeof data === "object") {
    body = data as Record<string, unknown>;
  }
  const mergedHeaders = normalizeHeaders(headers);
  const cookieHeader = cookieJar.getCookieHeader(url);
  if (cookieHeader && !mergedHeaders.cookie && !mergedHeaders.Cookie) {
    mergedHeaders.Cookie = cookieHeader;
  }
  const response = await $http.request({
    method,
    url,
    header: mergedHeaders,
    body,
  });
  if (response.error) {
    throw new Error(`Network request failed: ${response.error.localizedDescription}`);
  }

  if (response.response?.headers?.["Set-Cookie"]) {
    const setCookieHeader = response.response.headers["Set-Cookie"];
    cookieJar.applySetCookieHeader(response.response.url || url, setCookieHeader);
  }

  const jsonData = response.data;

  return {
    ok: response.response.statusCode >= 200 && response.response.statusCode < 300,
    status: response.response.statusCode,
    statusText: "",
    headers: response.response.headers,
    arrayBuffer: async () => new Uint8Array(response.rawData.byteArray).buffer,
    text: async () => response.rawData.string || "",
    json: async () => (typeof jsonData === "object" ? jsonData : undefined),
  };
}
