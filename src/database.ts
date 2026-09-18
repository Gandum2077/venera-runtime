import type {
  DatabasePrimitive,
  DatabaseStatement,
  RuntimeDatabase,
} from "./platform";
import { openDatabase } from "./platform";
import { VENERA_CONFIG_DATABASE_PATH } from "./constants";

const CREATE_TABLE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS venera_runtime_locale (
    key TEXT NOT NULL PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS venera_runtime_cookiejar (
    name TEXT NOT NULL,
    value TEXT NOT NULL,
    domain TEXT NOT NULL,
    path TEXT NOT NULL,
    expires TEXT,
    secure INTEGER NOT NULL DEFAULT 0,
    httpOnly INTEGER NOT NULL DEFAULT 0,
    hostOnly INTEGER NOT NULL DEFAULT 0,
    maxAge INTEGER,
    PRIMARY KEY (name, domain, path)
  )`,
  `CREATE TABLE IF NOT EXISTS venera_source_data (
    sourceKey TEXT NOT NULL,
    key TEXT NOT NULL,
    type TEXT,
    json TEXT,
    data BLOB,
    PRIMARY KEY (sourceKey, key)
  )`,
  `CREATE TABLE IF NOT EXISTS venera_source_settings (
    sourceKey TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT,
    PRIMARY KEY (sourceKey, key)
  )`,
];

function initializeSchema(database: RuntimeDatabase): void {
  database.transaction(CREATE_TABLE_STATEMENTS.map((sql) => ({ sql })));
  const cookieColumns = new Set(
    database
      .query("PRAGMA table_info(venera_runtime_cookiejar)")
      .map((column) => String(column.name)),
  );
  if (!cookieColumns.has("hostOnly")) {
    // Existing databases cannot reveal whether an old row was host-only, so
    // default to the previous domain-cookie behavior for those rows.
    database.update(
      "ALTER TABLE venera_runtime_cookiejar ADD COLUMN hostOnly INTEGER NOT NULL DEFAULT 0",
    );
  }
  if (!cookieColumns.has("maxAge")) {
    database.update(
      "ALTER TABLE venera_runtime_cookiejar ADD COLUMN maxAge INTEGER",
    );
  }
}

/** 初始化本项目负责的数据表；配置文件本身不由本项目管理。 */
export function createDB(path = VENERA_CONFIG_DATABASE_PATH): void {
  const database = openDatabase(path);
  try {
    initializeSchema(database);
  } finally {
    database.close();
  }
}

export interface DBManagerOptions {
  /** 首次执行数据库操作时再打开连接。 */
  lazy?: boolean;
}

export class DBManager {
  private database: RuntimeDatabase | null = null;
  private closed = false;
  private path: string;

  constructor(
    path = VENERA_CONFIG_DATABASE_PATH,
    options: DBManagerOptions = {},
  ) {
    this.path = path;
    if (!options.lazy) {
      this.initialize();
    }
  }

  private open(): RuntimeDatabase {
    const database = openDatabase(this.path);
    try {
      initializeSchema(database);
      return database;
    } catch (error) {
      database.close();
      throw error;
    }
  }

  private getDatabase(): RuntimeDatabase {
    this.initialize();
    return this.database!;
  }

  /** 主动打开连接并初始化本项目负责的数据表。 */
  initialize(path = this.path): this {
    if (this.closed) {
      throw new Error("Database manager is closed");
    }
    if (this.database) {
      if (path !== this.path) {
        throw new Error(
          `Database is already initialized at ${this.path}; cannot switch to ${path}`,
        );
      }
      return this;
    }
    this.path = path;
    this.database = this.open();
    return this;
  }

  close(): void {
    if (this.closed) return;
    this.database?.close();
    this.database = null;
    this.closed = true;
  }

  query(sql: string, args?: DatabasePrimitive[]): Record<string, unknown>[] {
    return this.getDatabase().query(sql, args);
  }

  update(sql: string, args?: DatabasePrimitive[]): void {
    this.getDatabase().update(sql, args);
  }

  batchUpdate(sql: string, manyArgs: DatabasePrimitive[][]): void {
    this.getDatabase().transaction(manyArgs.map((args) => ({ sql, args })));
  }

  transactionUpdate(statements: DatabaseStatement[]): void {
    this.getDatabase().transaction(statements);
  }

  batchInsert(
    tableName: string,
    columns: string[],
    manyArgs: DatabasePrimitive[][],
  ): void {
    const batchSize = 10_000;
    const columnPlaceholders = `(${columns.map(() => "?").join(",")})`;
    for (let index = 0; index < manyArgs.length; index += batchSize) {
      const batch = manyArgs.slice(index, index + batchSize);
      const sql = `INSERT INTO ${tableName} (${columns.join(",")}) VALUES ${batch
        .map(() => columnPlaceholders)
        .join(",")}`;
      this.getDatabase().update(sql, batch.flat());
    }
  }
}

/** 默认共享数据库；导入模块时不打开连接，首次操作时才初始化。 */
export const dbManager = new DBManager(VENERA_CONFIG_DATABASE_PATH, {
  lazy: true,
});

/**
 * 主动初始化默认共享数据库，并返回上级应用与运行时共同使用的管理器。
 * 必须在任何配置或 Cookie 持久化操作之前指定自定义路径。
 */
export function initializeDatabase(
  path = VENERA_CONFIG_DATABASE_PATH,
): DBManager {
  return dbManager.initialize(path);
}
