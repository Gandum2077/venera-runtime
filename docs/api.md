# API 参考

[首页](../README.md) · [Node.js](node.md) · [JSBox](jsbox.md) · [适配器](platform-adapters.md)

本文描述应用接入时的公开接口。完整类型随 npm 包的 `.d.ts` 发布；配置对象的可选能力以 `VeneraConfigSource` 为准。

## 包入口

| 入口                            | 公开内容                                                                  |
| ------------------------------- | ------------------------------------------------------------------------- |
| `venera-runtime`                | 配置加载、Venera 能力、数据库、配置数据、Cookie、日志、图片处理及相关类型 |
| `venera-runtime/platform`       | 平台能力契约、适配器注册和环境查询，以及能力调用入口                      |
| `venera-runtime/adapters/node`  | `nodeAdapter`、`createNodeAdapter()`、`setCliIo()` 和 `CliIo` 类型        |
| `venera-runtime/adapters/jsbox` | `jsboxAdapter`、`createJsBoxAdapter()`                                    |

普通应用优先使用根入口。不要引用 `dist/` 内部文件；这些文件不是公开子路径。`Comic`、`ComicSource`、`HtmlDocument` 等配置脚本全局对象由 `createVeneraRuntime()` 提供，不是根入口的具名导出。

## 加载与初始化

```ts
loadVeneraConfig(sourceCode: string, options?: LoadVeneraConfigOptions): VeneraConfigSource
createVeneraRuntime(): RuntimeGlobals
loadVeneraConfigBySourceCode(sourceCode: string, globals: RuntimeGlobals, runInit?: boolean): VeneraConfigSource
loadVeneraConfigBySourceCodeAsync(sourceCode: string, globals: RuntimeGlobals, runInit?: boolean): Promise<VeneraConfigSource>
```

`LoadVeneraConfigOptions` 包含 `globals?: RuntimeGlobals` 和 `runInit?: boolean`。默认创建新的 globals，且 runInit 为 true。

| 接口                                                | 返回和初始化行为                                    | 错误行为                                                               |
| --------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------- |
| `loadVeneraConfig` / `loadVeneraConfigBySourceCode` | 同步返回实例；约 50ms 后在后台调用 init，不等待完成 | 源码执行、构造、校验错误同步抛出；后台 init 错误交给宿主 console.error |
| `loadVeneraConfigBySourceCodeAsync`                 | 注册实例后立即调用 init，等待完成再返回             | 执行、校验或 init 错误使 Promise reject                                |
| 任一加载接口设置 `runInit: false`                   | 执行源码、构造、校验和注册，但不调用 init           | 仍会执行顶层代码与构造函数，不是静态解析或安全检查                     |

源码应包含可识别的 `class Name extends ComicSource` 声明。加载器检查非空 name、key、version；key 只接受字母、数字和下划线；version 和可选的 minAppVersion 需要符合加载器的版本格式，minAppVersion 不能高于 `APP.version`。

依赖 init 结果时使用异步入口，不要用固定延时猜测完成时间：

```js
import {
  createVeneraRuntime,
  loadVeneraConfigBySourceCodeAsync,
} from "venera-runtime";

// sourceCode 是调用方已读取的可信配置源码。
const source = await loadVeneraConfigBySourceCodeAsync(
  sourceCode,
  createVeneraRuntime(),
);
if (source.search?.load) {
  const result = await source.search.load("keyword", [], 1);
  console.log(result.comics);
}
```

init 失败不会自动注销已注册实例或回滚它产生的数据、网络等副作用。不要在默认加载后再次手动调用 init，以免初始化两次。

## 多配置与共享状态

```js
import { createVeneraRuntime, loadVeneraConfig } from "venera-runtime";

const globals = createVeneraRuntime();
const sourceA = loadVeneraConfig(codeA, { globals, runInit: false });
const sourceB = loadVeneraConfig(codeB, { globals, runInit: false });
console.log(globals.ComicSource.sources[sourceA.key] === sourceA);
```

codeA、codeB 由调用方读取。同一 globals 中重复的 key 会覆盖注册表里的旧实例，旧实例不会被销毁。

**globals 分离不等于数据隔离。** 同一包实例共用平台适配器、默认数据库、configManager、cookieJar 和 logger。配置数据/设置按源 key 区分；同 key 的不同配置实例会访问相同数据。Cookie 按 URL 规则共享。需要多租户隔离的应用不能仅靠多次 `createVeneraRuntime()` 实现。

配置功能均可能缺失。搜索选项由该源的 `search.optionList` 决定；章节、详情、发现页等以相应类型定义为准。配置源码的动态执行不保证其实际返回值符合 TypeScript 声明，调用方仍需处理源站错误和异常数据。

## 数据库与配置数据

`initializeDatabase(path?)` 打开默认共享数据库并初始化表，返回 `dbManager`。默认路径为 `assets/database.db`；Node 相对路径以数据目录为根，JSBox 相对路径属于当前应用。`:memory:` 可用于临时示例或测试。

同一个路径可重复初始化；连接打开后指定其他路径会抛错。`dbManager.close()` 是终止操作，关闭后不能再初始化该实例，配置持久化和 Cookie 操作也将无法继续。

| 接口                                                  | 用途                                              |
| ----------------------------------------------------- | ------------------------------------------------- |
| `dbManager.query(sql, args?)`                         | 返回行对象数组；BLOB 为 ArrayBuffer               |
| `dbManager.update(sql, args?)`                        | 执行一条更新语句                                  |
| `dbManager.batchUpdate(sql, manyArgs)`                | 同一 SQL 多组参数，在一个事务内执行               |
| `dbManager.transactionUpdate(statements)`             | 多条 `{ sql, args? }` 在一个事务内执行            |
| `dbManager.batchInsert(tableName, columns, manyArgs)` | 分批插入；整个调用并非一个原子事务                |
| `new DBManager(path?, { lazy? })`                     | 创建独立连接；默认立即初始化，lazy 为 true 时延后 |

单独创建 DBManager 不会替换运行时的默认连接。参数绑定支持 string、number、boolean、ArrayBuffer、ArrayBufferView、null、undefined；boolean 转成 0/1，undefined 转成 NULL。SQL 标识符不属于绑定参数，尤其 batchInsert 的表名和列名应由应用固定定义。

应用可以在共享库中建立自己的表，使用独立前缀，并通过 `?` 绑定用户数据：

```js
import { initializeDatabase } from "venera-runtime";

const db = initializeDatabase("assets/database.db");
db.update(
  "CREATE TABLE IF NOT EXISTS app_favorites (id TEXT PRIMARY KEY, title TEXT NOT NULL)",
);
db.update("INSERT OR REPLACE INTO app_favorites VALUES (?, ?)", [
  "demo-1",
  "Demo",
]);
```

不要直接修改运行时的表；configManager 和 cookieJar 有内存缓存，绕过它们写表会造成状态不一致。

`configManager` 提供 `locale`、`getData/setData/deleteData(sourceKey, key, ...)`、`getSetting/setSetting(sourceKey, key, ...)`。通常使用配置实例的 `loadData/saveData/deleteData/loadSetting` 更方便。未找到的数据返回 undefined；未设置的设置项可回退到源定义的 default。数据应为可 JSON 序列化值或标准二进制类型；二进制读取结果为 ArrayBuffer。locale 会规范为类似 `zh_CN` 的格式。

## 网络与 Cookie

`Network` 方法保留接收者调用，例如 `Network.get(url)`，不要直接解构后调用。

| 方法                                                          | 返回                               |
| ------------------------------------------------------------- | ---------------------------------- |
| `get(url, headers?, extra?)`、`delete(url, headers?, extra?)` | `Promise<NetworkResponse<string>>` |
| `post/put/patch(url, headers?, data?, extra?)`                | `Promise<NetworkResponse<string>>` |
| `sendRequest(method, url, headers?, data?, extra?)`           | UTF-8 文本响应                     |
| `fetchBytes(method, url, headers?, data?, extra?)`            | ArrayBuffer 响应                   |

响应包含 status、headers 和 body。传输失败 reject；4xx/5xx 仍返回响应，由调用方检查 status。超时通过 `extra.timeout` 指定毫秒数。

Network 自动读取共享 Cookie，并保存响应的 Set-Cookie。`Network.setCookies/getCookies/deleteCookies` 可管理 URL 对应的 Cookie；直接导出的 `cookieJar` 还提供 `getCookieHeader(url)` 和 `applySetCookieHeader(url, header)`。`new BrowserCookieJar(database?)` 可使用独立 DBManager，但不会替换 Network 使用的 cookieJar。

`veneraFetch(url, options?)` 是配置脚本 fetch 的公开实现。返回 ok、status、statusText、普通对象 headers，以及异步 text/json/arrayBuffer 方法。虽然参数类型为 RequestInit，当前只读取 method、headers、body；signal、credentials、redirect 等不会按标准 Fetch 的方式处理，也不提供流式 Response。

## 编码、图片与 UI

`Convert` 提供 UTF-8、GBK、Base64、十六进制、哈希、HMAC 和 AES 等配置兼容能力。二进制输入使用 ArrayBuffer / ArrayBufferView；具体算法签名见 `ConvertApi`。`Convert.decryptRsa()` 会抛出未实现错误。

```ts
modifyImage(data: ArrayBuffer | ArrayBufferView, script: string): Promise<ArrayBuffer>
```

script 必须定义同步函数 `modifyImage(image)` 并返回 Image 对象；输出始终为 PNG 字节。脚本可使用 width/height、copyRange、copyAndRotate90、fillImageAt、fillImageRangeAt，以及 `Image.empty(width, height)`。

```js
const png = await modifyImage(
  inputBytes,
  `
  function modifyImage(image) {
    return image.copyAndRotate90();
  }
`,
);
```

inputBytes 为调用方读取的图片字节。图片和脚本不合法时 Promise reject。图片脚本同样没有安全隔离。

`UI` 提供消息、对话框、链接、加载状态、输入和选择。输入/选择取消返回 null；选择结果是从 0 开始的索引。Node 使用 CLI，JSBox 使用原生控件，详见平台指南。

## 日志和应用信息

`logger` 首次读取状态或写日志时读取 `assets/debug`。内容为 on/info/warn/warning/error 时开启；不存在或内容不受支持时关闭。启用后同时输出控制台与 `logs/log_<时间>` 下的文件。

- 方法：`info`、`warn`、`warning`、`error(title, content?)`，以及 `log(level, title, content?)`。
- `level` 可调整最低级别；它不会开启原本关闭的 logger。
- `enabled`、`directory` 是只读状态；关闭时 directory 为 null。
- 初始化后新增/修改 debug 文件不会重新配置当前 logger。

配置脚本中的 console/log 使用这个 logger。后台 init 错误则直接输出宿主 console.error，不依赖日志开关。

`APP.version` 为 `1.6.3`，`APP.platform` 为 `ios`；`APP.locale` 来自共享配置数据。真实宿主名称通过 `venera-runtime/platform` 的 `getRuntimeEnvironment()` 查询，调用时会触发适配器选择。
