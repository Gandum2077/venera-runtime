import {
  DatabasePrimitive,
  DatabaseStatement,
  openDatabase,
  RuntimeDatabase,
} from "./api";
import { VENERA_CONFIG_DATABASE_PATH } from "./constants";

// 当前数据库版本，写在数据库文件中。出现不兼容更新时再提升版本并提供迁移。
const CURRENT_USER_VERSION = 0;

const CREATE_TABLE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS locale (
    key TEXT NOT NULL PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS cookiejar (
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

function initializeDatabase(database: RuntimeDatabase): void {
  database.transaction(CREATE_TABLE_STATEMENTS.map((sql) => ({ sql })));
  const cookieColumns = new Set(
    database
      .query("PRAGMA table_info(cookiejar)")
      .map((column) => String(column.name)),
  );
  if (!cookieColumns.has("hostOnly")) {
    // Existing databases cannot reveal whether an old row was host-only, so
    // default to the previous domain-cookie behavior for those rows.
    database.update(
      "ALTER TABLE cookiejar ADD COLUMN hostOnly INTEGER NOT NULL DEFAULT 0",
    );
  }
  if (!cookieColumns.has("maxAge")) {
    database.update("ALTER TABLE cookiejar ADD COLUMN maxAge INTEGER");
  }
}

/** 初始化本项目负责的数据表；配置文件本身不由本项目管理。 */
export function createDB(path = VENERA_CONFIG_DATABASE_PATH): void {
  const database = openDatabase(path);
  try {
    initializeDatabase(database);
  } finally {
    database.close();
  }
}

export class DBManager {
  private readonly database: RuntimeDatabase;

  constructor(path = VENERA_CONFIG_DATABASE_PATH) {
    this.database = openDatabase(path);
    initializeDatabase(this.database);
    this.checkDBUpdate();
  }

  close(): void {
    this.database.close();
  }

  private checkDBUpdate(): void {
    const userVersion =
      (this.query("PRAGMA user_version;") as Array<{ user_version: number }>)[0]
        ?.user_version ?? 0;
    if (userVersion !== CURRENT_USER_VERSION) {
      throw new Error(
        `未找到从数据库版本 ${userVersion} 到 ${CURRENT_USER_VERSION} 的升级方案`,
      );
    }
  }

  query(sql: string, args?: DatabasePrimitive[]): Record<string, unknown>[] {
    return this.database.query(sql, args);
  }

  update(sql: string, args?: DatabasePrimitive[]): void {
    this.database.update(sql, args);
  }

  batchUpdate(sql: string, manyArgs: DatabasePrimitive[][]): void {
    this.database.transaction(manyArgs.map((args) => ({ sql, args })));
  }

  transactionUpdate(statements: DatabaseStatement[]): void {
    this.database.transaction(statements);
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
      this.database.update(sql, batch.flat());
    }
  }
}

export const dbManager = new DBManager();
