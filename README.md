# venera-runtime

让 Venera 1.6.3 的配置运行时同时工作在 Node.js 和 JSBox 中。配置脚本看到的 `APP.platform` 固定为 `ios`。

本项目只负责执行配置源码并提供 Venera API，不下载、保存或更新配置文件。调用方需要自行决定从哪里读取 `venera-configs` 中的 `.js` 文件。

> [!WARNING]
> 本运行时不提供配置脚本安全隔离。配置源码会直接在宿主 JavaScript 环境中执行，因此**只能加载完全可信的配置**；不要加载来源不明、未经审核或可能被篡改的配置文件。

加载器会校验配置的 `name`、`key`、`version` 和 `minAppVersion`，但配置查找、重复 `key` 管理、图片加载链、阅读器及其他应用层能力应由上级应用负责。

## 运行要求

- Node.js `^20.18.1 || ^22.0.0 || ^24.0.0 || ^26.0.0`
- npm
- JSBox SDK 2.22.0 或更高（在 JSBox 项目中使用时）

Node 依赖中包含 `better-sqlite3` 和 `sharp` 等平台相关模块，因此应在实际运行项目所在的系统上执行 `npm install`，不要复制另一台机器的 `node_modules`。

## 作为本地 npm 包安装

下面的命令都只使用本地文件，不会上传到 npm 官网。

### 方式一：使用 `file:` 本地依赖（开发时推荐）

先准备本仓库：

```bash
cd /absolute/path/to/venera-runtime
npm install
npm run typecheck
```

然后在调用方项目中安装本地目录：

```bash
cd /absolute/path/to/consumer-project
npm install --save /absolute/path/to/venera-runtime
```

npm 会在调用方的 `package.json` 中写入类似内容：

```json
{
  "dependencies": {
    "venera-runtime": "file:../venera-runtime"
  }
}
```

本包的 `prepare` 脚本会在本地安装时生成 `dist`。修改本仓库源码后，重新执行下面两步即可让调用方得到最新代码：

```bash
cd /absolute/path/to/venera-runtime
npm run build:node

cd /absolute/path/to/consumer-project
npm install
```

如果 npm 没有刷新本地依赖，可再次执行 `npm install --save /absolute/path/to/venera-runtime`。

### 方式二：安装本地 tarball（固定一个快照）

这种方式更接近将来从 npm registry 安装的效果，适合验证包中实际包含了哪些文件：

```bash
cd /absolute/path/to/venera-runtime
npm pack

cd /absolute/path/to/consumer-project
npm install /absolute/path/to/venera-runtime/venera-runtime-1.0.0.tgz
```

源码更新后需要重新 `npm pack` 并重新安装新的 tarball。

## Node 数据目录

运行时会持久化以下状态：

- 配置源通过 `saveData()` 保存的数据；
- 配置源设置；
- Cookie；
- locale。

Node 默认在当前工作目录下使用 `assets/database.db`。建议每个调用方显式设置独立目录：

```bash
VENERA_RUNTIME_DATA_DIR=/absolute/path/to/consumer-data node app.js
```

此时数据库位于：

```text
/absolute/path/to/consumer-data/assets/database.db
```

仅导入包不会打开或创建数据库。默认数据库会在首次查询、持久化配置或处理 Cookie 时初始化，因此 `VENERA_RUNTIME_DATA_DIR` 只需在第一次数据库操作前设置。CommonJS 示例：

```js
process.env.VENERA_RUNTIME_DATA_DIR = "/absolute/path/to/consumer-data";
const runtime = require("venera-runtime");
```

原生 ESM 可以在导入后、首次数据库操作前设置：

```js
import { loadVeneraConfig } from "venera-runtime";

process.env.VENERA_RUNTIME_DATA_DIR = "/absolute/path/to/consumer-data";
const source = loadVeneraConfig(sourceCode);
```

也可以不依赖 `process.env`，直接主动初始化默认共享数据库：

```js
import { initializeDatabase } from "venera-runtime";

const database = initializeDatabase("/absolute/path/to/app.db");
```

上级应用可以通过具名导出的 `dbManager` 使用运行时创建的同一个跨平台数据库连接。应用自己的表应使用独立前缀，并且不要绕过运行时 API 直接修改运行时负责的表：

```js
import { dbManager } from "venera-runtime";

dbManager.update(`
  CREATE TABLE IF NOT EXISTS app_favorites (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL
  )
`);
```

## 日志

包根入口具名导出共享 `logger`：

```ts
import { logger } from "venera-runtime";

logger.error("Image task failed", error);
```

logger 在首次读取其状态或写日志时读取 `assets/debug`。文件内容可以是 `on`、`info`、`warn`、`warning` 或 `error`；文件不存在或内容不受支持时关闭日志。启用后，日志同时写入控制台和 `logs/log_<时间>` 目录。`VENERA_RUNTIME_DATA_DIR` 会作为 Node 环境下 `assets` 和 `logs` 相对路径的根目录。

调用方可以通过 `logger.level` 调整当前实例的最低日志级别。`logger.enabled` 表示首次使用时是否成功开启日志。应在首次使用 logger 之前准备好 `assets/debug`，初始化后新增该文件不会重新初始化 logger。

## 最小可运行示例

推荐使用 `loadVeneraConfig()`。它会创建运行时并执行配置源码，然后像 Venera 1.6.3 一样，在加载后异步启动配置源的 `init()`。加载函数本身同步返回，不会等待 `init()` 完成。

### CommonJS

```js
// demo.cjs
process.env.VENERA_RUNTIME_DATA_DIR = `${process.cwd()}/runtime-data`;

const { loadVeneraConfig } = require("venera-runtime");

const sourceCode = `
class DemoSource extends ComicSource {
  name = "Local demo";
  key = "local_demo";
  version = "1.0.0";

  async init() {
    this.saveData("initialized", true);
  }

  search = {
    load: async (keyword, options, page) => ({
      comics: [
        new Comic({
          id: "demo-1",
          title: keyword,
          cover: "https://example.com/cover.jpg"
        })
      ],
      maxPage: 1
    })
  };
}
`;

async function main() {
  const source = loadVeneraConfig(sourceCode);

  console.log(source.name); // Local demo

  // init() 在后台执行；这里等待只是为了演示读取它写入的数据。
  await new Promise((resolve) => setTimeout(resolve, 100));
  console.log(source.loadData("initialized")); // true

  const result = await source.search.load("Venera", [], 1);
  console.log(result.comics[0].title); // Venera
}

main().catch(console.error);
```

运行：

```bash
node demo.cjs
```

### TypeScript / ESM

Node TypeScript 项目应自行安装编译器和 Node 类型：

```bash
npm install --save-dev typescript @types/node
```

```ts
// demo.ts
import { readFile } from "node:fs/promises";
import { loadVeneraConfig, type VeneraConfigSource } from "venera-runtime";

const sourceCode = await readFile(
  "/absolute/path/to/venera-configs/manga_dex.js",
  "utf8",
);

const source: VeneraConfigSource = loadVeneraConfig(sourceCode);

console.log({
  name: source.name,
  key: source.key,
  version: source.version,
  canSearch: typeof source.search?.load === "function",
  hasComicPage: Boolean(source.comic),
});
```

在启动命令中设置数据目录：

```bash
VENERA_RUNTIME_DATA_DIR="$PWD/runtime-data" npx tsx demo.ts
```

原生 JavaScript ESM 也可以默认导入常用 API：

```js
import runtime from "venera-runtime";

const source = runtime.loadVeneraConfig(sourceCode);
```

## 加载真实配置文件并调用功能

下面示例从调用方指定的路径读取配置。运行时不会替你查找或更新该文件：

```js
const { readFile } = require("node:fs/promises");
const { loadVeneraConfig } = require("venera-runtime");

async function main() {
  const code = await readFile(process.argv[2], "utf8");
  const source = loadVeneraConfig(code);

  console.log(`Loaded ${source.name} (${source.key}) v${source.version}`);

  if (source.search?.load) {
    // options 的具体含义由该配置的 search.optionList 决定。
    const result = await source.search.load("one piece", [], 1);
    for (const comic of result.comics) {
      console.log(comic.id, comic.title, comic.cover);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

```bash
node app.cjs /absolute/path/to/venera-configs/manga_dex.js
```

不同配置可能只实现部分能力，调用前应检查对应字段：

```js
// 搜索
const searchResult = await source.search?.load?.("keyword", [], 1);

// 漫画详情
const details = await source.comic?.loadInfo("comic-id");

// 某章节的图片列表
const imageList = await source.comic?.loadEp("comic-id", "chapter-id");

// 发现页
const exploreResult = await source.explore?.[0]?.load?.(1);
```

参数、返回结构以及账号、收藏、评论、分类等能力可通过包导出的 `VeneraConfigSource`、`ComicDetailsShape`、`SearchPageResult` 等 TypeScript 类型查看。

## 加载多个配置源

默认每次 `loadVeneraConfig()` 都创建一套独立运行时。如果希望多个源注册到同一个 `ComicSource.sources`，应复用 `globals`：

```js
const { createVeneraRuntime, loadVeneraConfig } = require("venera-runtime");

const globals = createVeneraRuntime();

const sourceA = loadVeneraConfig(codeA, { globals });
const sourceB = loadVeneraConfig(codeB, { globals });

console.log(globals.ComicSource.sources[sourceA.key] === sourceA); // true
console.log(globals.ComicSource.sources[sourceB.key] === sourceB); // true
```

如果只想解析配置结构，不想执行可能包含网络或数据初始化的 `init()`：

```js
const source = loadVeneraConfig(sourceCode, { runInit: false });
```

## 底层加载接口

需要完全控制运行时创建和初始化时，可以使用：

```js
const {
  createVeneraRuntime,
  loadVeneraConfigBySourceCode,
  loadVeneraConfigBySourceCodeAsync,
} = require("venera-runtime");

const globals = createVeneraRuntime();

// 只有调用后必须立即依赖 init 结果时，才显式等待它完成。
const readySource = await loadVeneraConfigBySourceCodeAsync(
  sourceCode,
  globals,
  true,
);

// 与 Venera 1.6.3 一致：同步返回，并在后台调度 init。
const source = loadVeneraConfigBySourceCode(anotherSourceCode, globals, true);
```

## 在 JSBox 项目中作为依赖使用

JSBox TypeScript 项目也可以使用同一个本地依赖：

```bash
cd /absolute/path/to/jsbox-project
npm install --save /absolute/path/to/venera-runtime
```

然后在项目入口中导入，并交给现有 webpack 构建：

```ts
import { initializeDatabase, loadVeneraConfig } from "venera-runtime";

// JSBox 不需要 process；在首次持久化操作前直接指定共享数据库路径。
const database = initializeDatabase("assets/database.db");

const sourceCode = $file.read("assets/config.js")?.string;
if (!sourceCode) throw new Error("Failed to read config source");

const source = loadVeneraConfig(sourceCode);

$ui.alert(`${source.name} v${source.version}`);
```

在 JSBox 中会自动使用 `$http`、`$sqlite`、`$file`、`$data`、原生 UI 和图片 API，不需要设置 `VENERA_RUNTIME_DATA_DIR`。

## 常用导出

| 导出                                | 用途                                  |
| ----------------------------------- | ------------------------------------- |
| `loadVeneraConfig`                  | 推荐的高层加载入口，后台执行 `init()` |
| `createVeneraRuntime`               | 手动创建注入给配置脚本的全局对象      |
| `loadVeneraConfigBySourceCode`      | 使用指定 globals 加载，后台执行初始化 |
| `loadVeneraConfigBySourceCodeAsync` | 特殊场景下加载并等待初始化完成        |
| `initializeDatabase`                | 主动初始化并返回默认共享数据库管理器  |
| `APP`                               | 固定的 Venera 1.6.3 / iOS 元数据      |
| `Network`、`Convert`、`UI`          | Venera 对应能力的直接实现             |
| `dbManager`                         | 与运行时共享的惰性数据库管理器        |
| `configManager`                     | locale、源数据和设置的持久化管理器    |
| `modifyImage`                       | 执行配置中的图片处理脚本              |

Node 端 UI 不创建图形窗口：消息、对话框、加载状态和链接会输出到 CLI，输入框、选择框与对话框动作从标准输入读取；非法选项会重新提示，可取消的加载状态可按回车触发取消回调。

`Convert.decryptRsa` 暂未实现；当前测试的配置集合没有调用它。

## 本仓库开发与验证

```bash
npm run typecheck
npm test
npm run test:coverage
npm run test:compat
npm run test:package
npm run build:node
npm run build:jsbox-test
```

真实配置兼容测试独立于 `npm test`，缺少配置文件时明确失败。默认查找 `../Github/venera-configs`，也可以指定：

```bash
VENERA_CONFIGS_DIR=/path/to/venera-configs npm run test:compat
```

生成和比较 Node/JSBox API 报告：

```bash
npm run test:node-report
npm run test:compare
```

## 架构

`src/api.ts` 定义每个环境必须实现的能力契约，`src/platform.ts` 负责惰性选择适配器。
Node.js 与 JSBox 的实现分别位于 `src/adapters/`，共享核心通过中立类型使用这些能力。

新增环境、接口迁移及验证方式见 [运行环境适配器](docs/platform-adapters.md)。

```text
Node adapter ───┐
JSBox adapter ──┼─ RuntimeAdapter contract ─ shared runtime ─ Venera config
Custom adapter ─┘
```
