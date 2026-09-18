import { afterEach, describe, expect, it, vi } from "vitest";
import { createJsBoxAdapter } from "../src/adapters/jsbox";
import { createNodeAdapter } from "../src/adapters/node";

afterEach(() => vi.unstubAllGlobals());

describe("database capability contract", () => {
  it("throws on JSBox update failures and rolls back instead of committing", () => {
    const native = {
      update: vi
        .fn()
        .mockReturnValueOnce({ result: true })
        .mockReturnValue({ result: false, error: "constraint failed" }),
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
    };
    vi.stubGlobal("$sqlite", { open: () => native });
    const database = createJsBoxAdapter().openDatabase(":memory:");
    expect(() =>
      database.transaction([{ sql: "first" }, { sql: "second" }]),
    ).toThrow("constraint failed");
    expect(native.rollback).toHaveBeenCalledOnce();
    expect(native.commit).not.toHaveBeenCalled();
    expect(() => database.update("invalid")).toThrow("constraint failed");
  });

  it("rolls back SQLite writes in Node as well", () => {
    const database = createNodeAdapter().openDatabase(":memory:");
    try {
      database.update("CREATE TABLE sample (id INTEGER PRIMARY KEY)");
      expect(() =>
        database.transaction([
          { sql: "INSERT INTO sample VALUES (?)", args: [1] },
          { sql: "INSERT INTO sample VALUES (?)", args: [1] },
        ]),
      ).toThrow();
      expect(database.query("SELECT * FROM sample")).toEqual([]);
    } finally {
      database.close();
    }
  });

  it("normalizes JSBox booleans, NULLs and sliced binary inputs/outputs", () => {
    const update = vi.fn(() => ({ result: true }));
    const close = vi.fn();
    const result = {
      next: vi.fn().mockReturnValueOnce(true).mockReturnValue(false),
      close,
      values: { blob: { byteArray: [3, 4] }, bool: true, empty: null },
    };
    vi.stubGlobal("$data", (value: unknown) => value);
    vi.stubGlobal("$sqlite", {
      open: () => ({
        update,
        query: (
          _sql: unknown,
          callback: (rs: unknown, error?: string) => void,
        ) => callback(result),
      }),
    });
    const database = createJsBoxAdapter().openDatabase(":memory:");
    database.update("INSERT", [
      true,
      false,
      undefined,
      new Uint8Array([1, 2, 3, 4]).subarray(1, 3),
    ]);
    expect(update).toHaveBeenCalledWith({
      sql: "INSERT",
      args: [1, 0, null, { byteArray: [2, 3] }],
    });
    const rows = database.query("SELECT");
    expect(rows[0]).toEqual({
      blob: new Uint8Array([3, 4]).buffer,
      bool: 1,
      empty: null,
    });
    expect(close).toHaveBeenCalledOnce();
  });
});

describe("JSBox UI contract", () => {
  it("rejects the dialog promise when an action callback fails", async () => {
    vi.stubGlobal("$alertActionType", { default: 0, destructive: 1 });
    vi.stubGlobal("$ui", {
      alert: ({ actions }: { actions: { handler: () => Promise<void> }[] }) => {
        void actions[0].handler();
      },
    });
    await expect(
      createJsBoxAdapter().ui.showDialog("Test", "Content", [
        {
          text: "Fail",
          callback: () => {
            throw new Error("action failed");
          },
        },
      ]),
    ).rejects.toThrow("action failed");
  });
});
