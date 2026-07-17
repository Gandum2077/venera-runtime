# venera-runtime

让 Venera 1.6.3 的配置运行时同时工作在 Node.js 和 JSBox 中。配置脚本看到的 `APP.platform` 固定为 `ios`。

本项目只负责执行配置源码并提供 Venera API，不下载、保存或更新配置文件。调用方需要自行决定从哪里读取 `venera-configs` 中的 `.js` 文件。

## 运行要求

- Node.js `^20.9.0 || >=22.0.0`
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

包在首次导入时会打开数据库，因此 `VENERA_RUNTIME_DATA_DIR` 必须在 `require()` / `import` 之前设置。CommonJS 可以在代码中设置：

```js
process.env.VENERA_RUNTIME_DATA_DIR = "/absolute/path/to/consumer-data";
const runtime = require("venera-runtime");
```

原生 ESM 如需在代码中设置，请使用动态导入：

```js
process.env.VENERA_RUNTIME_DATA_DIR = "/absolute/path/to/consumer-data";
const runtime = await import("venera-runtime");
```

## 最小可运行示例

推荐使用异步的 `loadVeneraConfig()`。它会创建运行时、执行配置源码，并等待配置源的 `init()` 完成。

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
  const source = await loadVeneraConfig(sourceCode);

  console.log(source.name); // Local demo
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

const source: VeneraConfigSource = await loadVeneraConfig(sourceCode);

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

const source = await runtime.loadVeneraConfig(sourceCode);
```

## 加载真实配置文件并调用功能

下面示例从调用方指定的路径读取配置。运行时不会替你查找或更新该文件：

```js
const { readFile } = require("node:fs/promises");
const { loadVeneraConfig } = require("venera-runtime");

async function main() {
  const code = await readFile(process.argv[2], "utf8");
  const source = await loadVeneraConfig(code);

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

const sourceA = await loadVeneraConfig(codeA, { globals });
const sourceB = await loadVeneraConfig(codeB, { globals });

console.log(globals.ComicSource.sources[sourceA.key] === sourceA); // true
console.log(globals.ComicSource.sources[sourceB.key] === sourceB); // true
```

如果只想解析配置结构，不想执行可能包含网络或数据初始化的 `init()`：

```js
const source = await loadVeneraConfig(sourceCode, { runInit: false });
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

// 等待 init 完成；推荐用于普通业务代码。
const readySource = await loadVeneraConfigBySourceCodeAsync(
  sourceCode,
  globals,
  true,
);

// 同步返回，并在后台调度 init；用于兼容原有调用方式。
const legacySource = loadVeneraConfigBySourceCode(
  anotherSourceCode,
  globals,
  true,
);
```

## 在 JSBox 项目中作为依赖使用

JSBox TypeScript 项目也可以使用同一个本地依赖：

```bash
cd /absolute/path/to/jsbox-project
npm install --save /absolute/path/to/venera-runtime
```

然后在项目入口中导入，并交给现有 webpack 构建：

```ts
import { loadVeneraConfig } from "venera-runtime";

const sourceCode = $file.read("assets/config.js")?.string;
if (!sourceCode) throw new Error("Failed to read config source");

const source = await loadVeneraConfig(sourceCode);

$ui.alert(`${source.name} v${source.version}`);
```

在 JSBox 中会自动使用 `$http`、`$sqlite`、`$file`、`$data`、原生 UI 和图片 API，不需要设置 `VENERA_RUNTIME_DATA_DIR`。

## 常用导出

| 导出                                | 用途                                |
| ----------------------------------- | ----------------------------------- |
| `loadVeneraConfig`                  | 推荐的高层加载入口，会等待 `init()` |
| `createVeneraRuntime`               | 手动创建注入给配置脚本的全局对象    |
| `loadVeneraConfigBySourceCodeAsync` | 使用指定 globals 加载并等待初始化   |
| `loadVeneraConfigBySourceCode`      | 兼容旧调用方式，初始化在后台执行    |
| `APP`                               | 固定的 Venera 1.6.3 / iOS 元数据    |
| `Network`、`Convert`、`UI`          | Venera 对应能力的直接实现           |
| `configManager`                     | locale、源数据和设置的持久化管理器  |
| `modifyImage`                       | 执行配置中的图片处理脚本            |

Node 端 UI 不创建图形窗口：消息、对话框、加载状态和链接会输出到 CLI，输入框和选择框从标准输入读取。

`Convert.decryptRsa` 暂未实现；当前测试的配置集合没有调用它。

## 本仓库开发与验证

```bash
npm run typecheck
npm test
npm run test:coverage
npm run build:node
npm run build:jsbox-test
```

真实配置兼容测试默认查找 `../Github/venera-configs`，也可以指定：

```bash
VENERA_CONFIGS_DIR=/path/to/venera-configs npm test
```

生成和比较 Node/JSBox API 报告：

```bash
npm run test:node-report
npm run test:compare
```

## 架构

`src/api.ts` 是平台边界。数据库 BLOB、HTTP 响应体和图片处理输入输出都在边界处统一为 `ArrayBuffer`，避免 `NSData`、`SqliteTypes` 或 Node `Buffer` 泄漏到共享核心。

```text
Node primitives ─┐
                 ├─ src/api.ts ─ shared runtime ─ Venera config
JSBox globals ───┘
```
