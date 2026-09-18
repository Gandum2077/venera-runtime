import { setCliIo } from "../src/adapters/node";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runApiTestSuite } from "../src/api-test-suite";
import { decodeText, httpRequest, runtimeUi } from "../src/platform";
import { createServer, type Server } from "node:http";
import { Network, veneraFetch } from "../src/network";

let server: Server;
let baseUrl = "";

beforeAll(async () => {
  server = createServer((request, response) => {
    if (request.url === "/empty") {
      response.writeHead(204, {
        "Set-Cookie": "session=test; Path=/; HttpOnly",
      });
      response.end();
      return;
    }
    if (request.url === "/set-cookie") {
      response.writeHead(200, {
        "Set-Cookie": ["first=1; Path=/; HttpOnly", "second=2; Path=/"],
        "Content-Type": "text/plain",
      });
      response.end("ok");
      return;
    }
    if (request.url === "/cookie") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ cookie: request.headers.cookie || "" }));
      return;
    }
    if (request.url === "/slow") {
      setTimeout(() => response.end("late"), 100);
      return;
    }
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    request.on("end", () => {
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          method: request.method,
          body: Buffer.concat(chunks).toString("utf8"),
        }),
      );
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Failed to start test server");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  if (!server?.listening) return;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

describe("shared API contract", () => {
  it("passes the same deterministic suite used by the JSBox app", async () => {
    const report = await runApiTestSuite({ networkUrl: `${baseUrl}/empty` });
    expect(report.totals.failed).toBe(0);
    expect(report.totals.skipped).toBe(0);
  });

  it("normalizes JSON and form request bodies", async () => {
    const json = await httpRequest({
      method: "POST",
      url: `${baseUrl}/echo`,
      body: { value: "漫画" },
    });
    expect(JSON.parse(decodeText(json.body, "utf8"))).toEqual({
      method: "POST",
      body: '{"value":"漫画"}',
    });

    const form = await httpRequest({
      method: "POST",
      url: `${baseUrl}/echo`,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: { value: "漫画", page: 2 },
    });
    expect(JSON.parse(decodeText(form.body, "utf8"))).toEqual({
      method: "POST",
      body: "value=%E6%BC%AB%E7%94%BB&page=2",
    });
  });

  it("implements Venera Network, fetch and Cookie behavior", async () => {
    const setCookieResponse = await Network.get(`${baseUrl}/set-cookie`);
    expect(setCookieResponse.body).toBe("ok");
    const cookieResponse = await Network.get(`${baseUrl}/cookie`);
    expect(JSON.parse(cookieResponse.body).cookie).toContain("first=1");
    expect(JSON.parse(cookieResponse.body).cookie).toContain("second=2");

    const fetchResponse = await veneraFetch(`${baseUrl}/echo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: 1 }),
    });
    expect(fetchResponse.ok).toBe(true);
    expect(await fetchResponse.json()).toEqual({
      method: "POST",
      body: '{"value":1}',
    });
    await expect(
      Network.get(`${baseUrl}/slow`, {}, { timeout: 10 }),
    ).rejects.toThrow("Network request failed");
  });

  it("renders Node UI operations as a CLI transcript", async () => {
    const output: string[] = [];
    const input = ["bad", "accepted", "invalid", "2"];
    const restore = setCliIo({
      write(message) {
        output.push(message);
      },
      async read() {
        return input.shift() ?? null;
      },
    });
    try {
      runtimeUi.showMessage("hello");
      const value = await runtimeUi.showInputDialog("name", (candidate) =>
        candidate === "accepted" ? null : "retry",
      );
      const selected = await runtimeUi.showSelectDialog("source", ["A", "B"]);
      runtimeUi.launchUrl("https://example.com");
      expect(value).toBe("accepted");
      expect(selected).toBe(1);
      expect(output.join("\n")).toContain("[Message] hello");
      expect(output.join("\n")).toContain("[Validation error] retry");
      expect(output.join("\n")).toContain("[Invalid choice]");
      expect(output.join("\n")).toContain("[Open URL] https://example.com");
    } finally {
      restore();
    }
  });

  it("executes dialog actions and supports user-cancelable CLI loading", async () => {
    const output: string[] = [];
    const input = ["invalid", "2", ""];
    let selected = "";
    let canceled = false;
    const restore = setCliIo({
      write(message) {
        output.push(message);
      },
      async read() {
        return input.shift() ?? null;
      },
    });
    try {
      await runtimeUi.showDialog("action", "choose", [
        {
          text: "first",
          callback: () => {
            selected = "first";
          },
        },
        { text: "second", callback: async () => void (selected = "second") },
      ]);
      expect(selected).toBe("second");

      runtimeUi.showLoading(() => {
        canceled = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(canceled).toBe(true);
      expect(output.join("\n")).toContain("canceled");
    } finally {
      restore();
    }
  });
});
