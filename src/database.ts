import { VENERA_CONFIG_DATABASE_PATH } from "./constants";

// 当前数据库版本，写在数据库文件中
// 当出现不兼容更新时，更新数据库版本，并且提供对应的升级方案
// 如果是兼容更新，不升级数据库版本
const CURRENT_USER_VERSION = 0;

// 创建数据库
export function createDB() {
  const db = $sqlite.open(VENERA_CONFIG_DATABASE_PATH);
  // locale
  db.update(`CREATE TABLE IF NOT EXISTS locale (
    key TEXT NOT NULL PRIMARY KEY,
    value TEXT NOT NULL
  )`);
  // cookiejar
  db.update(`CREATE TABLE IF NOT EXISTS cookiejar (
    name TEXT NOT NULL,
    value TEXT NOT NULL,
    domain TEXT NOT NULL,
    path TEXT NOT NULL,
    expires TEXT,
    secure INTEGER NOT NULL DEFAULT 0,
    httpOnly INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (name, domain, path)
  )`);
  // 存储Venera环境中的data数据
  db.update(`CREATE TABLE IF NOT EXISTS venera_source_data (
    sourceKey TEXT NOT NULL,
    key TEXT NOT NULL,
    type TEXT,
    json TEXT,
    data BLOB,
    PRIMARY KEY (sourceKey, key)
  )`);
  // 存储Venera环境中的settings数据
  db.update(`CREATE TABLE IF NOT EXISTS venera_source_settings (
    sourceKey TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT,
    PRIMARY KEY (sourceKey, key)
  )`);
  $sqlite.close(db);
}

// 打开数据库
function openDB() {
  return $sqlite.open(VENERA_CONFIG_DATABASE_PATH);
}

// 关闭数据库
function closeDB(db: SqliteTypes.SqliteInstance) {
  $sqlite.close(db);
}

// 查询数据库
function queryDB(db: SqliteTypes.SqliteInstance, sql: string, args?: any[]) {
  const result: Record<string, any>[] = [];
  const options = args ? { sql, args } : sql;
  db.query(options, (rs, err) => {
    if (rs === null) {
      console.log(options);
    }
    while (rs.next()) {
      const values = rs.values;
      result.push(values);
    }
    rs.close();
  });
  return result;
}

// 更新数据库
function updateDB(db: SqliteTypes.SqliteInstance, sql: string, args?: any[]) {
  const options = args ? { sql, args } : sql;
  db.beginTransaction();
  db.update(options);
  db.commit();
}

function updateDBBatch(db: SqliteTypes.SqliteInstance, sql: string, manyArgs: any[][]) {
  db.beginTransaction();
  for (const args of manyArgs) {
    db.update({ sql, args });
  }
  db.commit();
}

// 批量更新数据库
function transactionUpdateDB(
  db: SqliteTypes.SqliteInstance,
  statements: { sql: string; args?: (string | number | boolean | null | undefined)[] }[],
) {
  db.beginTransaction();
  try {
    for (const statement of statements) {
      const options = statement.args ? { sql: statement.sql, args: statement.args } : statement.sql;
      db.update(options);
    }
    db.commit();
  } catch (error) {
    db.rollback();
    throw error;
  }
}

/**
 * 大规模插入数据(只能执行基本的插入操作)
 * @param db 数据库实例
 * @param tableName 表名
 * @param columns 列名, 需要按照正确的顺序来排列
 * @param manyArgs 数据, 和列名对应
 */
function insertDBBatch(db: SqliteTypes.SqliteInstance, tableName: string, columns: string[], manyArgs: any[][]) {
  const batchSize = 10000;
  const sql0 = `INSERT INTO ${tableName} (${columns.join(",")}) VALUES `;
  const columnQuotes = "(" + columns.map(() => "?").join(",") + ")";
  db.beginTransaction();
  // 分批插入
  for (let i = 0; i < manyArgs.length; i += batchSize) {
    const batchArgs = manyArgs.slice(i, i + batchSize);
    const sql = sql0 + batchArgs.map(() => columnQuotes).join(",");
    db.update({ sql, args: batchArgs.flat() });
  }
  db.commit();
}

class DBManager {
  private _db: SqliteTypes.SqliteInstance;
  constructor() {
    createDB();
    this._db = openDB();
    this.checkDBUpdate();
  }

  close() {
    closeDB(this._db);
  }

  checkDBUpdate() {
    let user_version = (this.query("PRAGMA user_version;") as [{ user_version: number }])[0].user_version;
    if (user_version === CURRENT_USER_VERSION) return;
    // 按照顺序依次提升版本
    if (user_version !== CURRENT_USER_VERSION) {
      throw new Error(`未找到从数据库版本 ${user_version} 到 ${CURRENT_USER_VERSION} 的升级方案`);
    }
  }

  query(sql: string, args?: any[]) {
    return queryDB(this._db, sql, args);
  }

  update(sql: string, args?: (string | number | boolean | NSData | null | undefined)[]) {
    return updateDB(this._db, sql, args);
  }

  batchUpdate(sql: string, manyArgs: (string | number | boolean | null | undefined)[][]) {
    return updateDBBatch(this._db, sql, manyArgs);
  }

  transactionUpdate(statements: { sql: string; args?: (string | number | boolean | null | undefined)[] }[]) {
    return transactionUpdateDB(this._db, statements);
  }

  batchInsert(tableName: string, columns: string[], manyArgs: (string | number | boolean | null | undefined)[][]) {
    return insertDBBatch(this._db, tableName, columns, manyArgs);
  }
}

export const dbManager = new DBManager();
