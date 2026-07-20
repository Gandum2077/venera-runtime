import { dbManager } from "./database";

function systemLocale(): string {
  return new Intl.DateTimeFormat().resolvedOptions().locale;
}

/** Normalize BCP 47 locale tags to Venera's `language_COUNTRY` format. */
export function normalizeVeneraLocale(value: string): string {
  const input = value.trim().replaceAll("_", "-");
  if (!input) return normalizeVeneraLocale(systemLocale());

  try {
    const locale = new Intl.Locale(input);
    const language = locale.language.toLowerCase();
    let region = locale.region?.toUpperCase();
    if (!region && language === "zh") {
      if (locale.script?.toLowerCase() === "hant") region = "TW";
      if (locale.script?.toLowerCase() === "hans") region = "CN";
    }
    return region ? `${language}_${region}` : language;
  } catch {
    const [language, region] = input.split("-");
    return region
      ? `${language!.toLowerCase()}_${region.toUpperCase()}`
      : language!.toLowerCase();
  }
}

function isBinaryData(value: unknown): value is ArrayBuffer | ArrayBufferView {
  return value instanceof ArrayBuffer || ArrayBuffer.isView(value);
}

class ConfigManager {
  private _locale: string;
  private _veneraData: Map<string, Map<string, unknown>>;
  private _veneraSettings: Map<string, Map<string, unknown>>;
  constructor() {
    this._veneraData = this._queryVeneraData();
    this._veneraSettings = this._queryVeneraSettings();
    this._locale = normalizeVeneraLocale(this._queryLocale() || systemLocale());
  }

  _queryLocale(): string | null {
    const sql = `SELECT value FROM locale WHERE key = 'locale' LIMIT 1`;
    const rows = dbManager.query(sql) as Array<{ value: string }>;
    return rows[0]?.value ?? null;
  }

  get locale() {
    return this._locale;
  }

  set locale(value: string) {
    const normalized = normalizeVeneraLocale(value || systemLocale());
    dbManager.update(
      `INSERT OR REPLACE INTO locale (key, value) VALUES ('locale', ?)`,
      [normalized],
    );
    this._locale = normalized;
  }

  private _queryVeneraData(): Map<string, Map<string, unknown>> {
    const sql = `SELECT sourceKey, key, type, json, data FROM venera_source_data`;
    const rows = dbManager.query(sql) as Array<{
      sourceKey: string;
      key: string;
      type: "json" | "data";
      json: string | null;
      data: unknown;
    }>;
    const result = new Map<string, Map<string, unknown>>();
    for (const row of rows) {
      if (row.type !== "json") {
        continue;
      }
      if (!result.has(row.sourceKey)) {
        result.set(row.sourceKey, new Map());
      }
      result.get(row.sourceKey)!.set(row.key, JSON.parse(row.json ?? "null"));
    }
    return result;
  }

  private _queryBinaryData(
    sourceKey: string,
    key: string,
  ): ArrayBuffer | undefined {
    const sql = `SELECT data FROM venera_source_data WHERE sourceKey = ? AND key = ? AND type = ? LIMIT 1`;
    const rows = dbManager.query(sql, [sourceKey, key, "data"]) as Array<{
      data: ArrayBuffer;
    }>;
    const data = rows[0]?.data;
    return data;
  }

  private _queryVeneraSettings(): Map<string, Map<string, unknown>> {
    const sql = `SELECT sourceKey, key, value FROM venera_source_settings`;
    const rows = dbManager.query(sql) as Array<{
      sourceKey: string;
      key: string;
      value: string | null;
    }>;
    const result = new Map<string, Map<string, unknown>>();
    for (const row of rows) {
      if (!result.has(row.sourceKey)) {
        result.set(row.sourceKey, new Map());
      }
      result.get(row.sourceKey)!.set(row.key, JSON.parse(row.value ?? "null"));
    }
    return result;
  }

  getData(sourceKey: string, key: string): unknown {
    const configMap = this._veneraData.get(sourceKey);
    if (configMap?.has(key)) {
      return configMap.get(key);
    }
    return this._queryBinaryData(sourceKey, key);
  }

  setData(sourceKey: string, key: string, value: unknown) {
    if (isBinaryData(value)) {
      const configMap = this._veneraData.get(sourceKey);
      if (configMap) {
        configMap.delete(key);
        if (configMap.size === 0) {
          this._veneraData.delete(sourceKey);
        }
      }
      dbManager.update(
        `INSERT OR REPLACE INTO venera_source_data (sourceKey, key, type, json, data) VALUES (?, ?, ?, ?, ?)`,
        [sourceKey, key, "data", null, value],
      );
      return;
    }
    if (!this._veneraData.has(sourceKey)) {
      this._veneraData.set(sourceKey, new Map());
    }
    this._veneraData.get(sourceKey)!.set(key, value);
    dbManager.update(
      `INSERT OR REPLACE INTO venera_source_data (sourceKey, key, type, json, data) VALUES (?, ?, ?, ?, ?)`,
      [sourceKey, key, "json", JSON.stringify(value), null],
    );
  }

  deleteData(sourceKey: string, key: string) {
    const configMap = this._veneraData.get(sourceKey);
    if (configMap) {
      configMap.delete(key);
      if (configMap.size === 0) {
        this._veneraData.delete(sourceKey);
      }
    }
    dbManager.update(
      `DELETE FROM venera_source_data WHERE sourceKey = ? AND key = ?`,
      [sourceKey, key],
    );
  }

  getSetting(sourceKey: string, key: string): unknown {
    const configMap = this._veneraSettings.get(sourceKey);
    if (configMap) {
      return configMap.get(key);
    }
    return undefined;
  }

  setSetting(sourceKey: string, key: string, value: unknown) {
    if (!this._veneraSettings.has(sourceKey)) {
      this._veneraSettings.set(sourceKey, new Map());
    }
    this._veneraSettings.get(sourceKey)!.set(key, value);
    dbManager.update(
      `INSERT OR REPLACE INTO venera_source_settings (sourceKey, key, value) VALUES (?, ?, ?)`,
      [sourceKey, key, JSON.stringify(value)],
    );
  }
}

export const configManager = new ConfigManager();
