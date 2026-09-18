# Node.js 接入

[首页](../README.md) · [API 参考](api.md) · [示例](../examples/README.md)

## 安装和模块格式

支持范围以 package.json 为准：`^20.18.1 || ^22.0.0 || ^24.0.0 || ^26.0.0`。
本包发布 CommonJS JavaScript 和 TypeScript 声明，支持 require 和原生 ESM 具名导入。

发布前先在运行时仓库生成 tarball：

```bash
npm ci
npm pack
```

在调用方安装生成的实际文件名：

```bash
npm install /absolute/path/to/venera-runtime/venera-runtime-1.0.0.tgz
```

源码变化后重新 pack 和安装，才能得到新的快照。正式发布后可使用 `npm install venera-runtime`。

开发时也可安装本地目录：

```bash
npm install /absolute/path/to/venera-runtime
```

这通常是本地链接。先在运行时仓库安装开发依赖；修改源码后执行 `npm run build:node` 更新 dist。本地链接不替代 tarball 的发布验证。

```js
// CommonJS (.cjs)
const { loadVeneraConfig } = require("venera-runtime");
```

```js
// 原生 ESM (.mjs)
import { loadVeneraConfig } from "venera-runtime";
```

原生 ESM 默认导入得到 CommonJS 导出对象。为保持 TypeScript 和不同构建工具下用法一致，建议具名导入。

## TypeScript

在调用方安装编译器和 Node 类型；若希望直接执行 TypeScript 示例，也安装 tsx：

```bash
npm install --save-dev typescript @types/node tsx
```

一个采用 `.mts` 文件的检查配置：

```json
{
  "compilerOptions": {
    "target": "ES2021",
    "module": "NodeNext",
    "strict": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["*.mts"]
}
```

```bash
npx tsc
npx tsx app.mts
```

`.mts` 始终按 ESM 处理；使用 `.ts` 时还需要结合调用方 package.json 的 type 确定模块格式。Node 消费者不需要安装 jsbox-types。

## 数据目录与连接生命周期

建议在使用任何运行时能力前固定数据根目录：

```bash
VENERA_RUNTIME_DATA_DIR=/absolute/path/to/consumer-data node app.mjs
```

默认根目录是进程当前工作目录。运行时数据库位于 `<根目录>/assets/database.db`，保存源数据、源设置、Cookie 和 locale；日志也使用同一根目录。

也可在代码中指定目录，ESM 的静态 import 不会提前打开数据库：

```js
import { initializeDatabase } from "venera-runtime";

process.env.VENERA_RUNTIME_DATA_DIR = "/absolute/path/to/consumer-data";
const database = initializeDatabase("assets/database.db");
```

若传入绝对数据库路径，数据库使用该路径，但不会改变日志等文件的根目录。
默认数据库在首次使用时打开。`createVeneraRuntime()` 本身不打开库，但配置构造函数、init、Cookie、locale 或持久化操作都可能触发它。

应用启动后保持目录不变。连接已打开时不能切换路径；程序确实不再使用运行时后才能调用 `dbManager.close()`，关闭后该共享实例不能重新打开。仅为一次加载创建并关闭共享连接会影响后续配置。

## 从文件加载配置

下面保存为 `load-config.mjs`，显式等待 init，并在所有操作结束后关闭连接：

```js
import { readFile } from "node:fs/promises";
import {
  createVeneraRuntime,
  dbManager,
  loadVeneraConfigBySourceCodeAsync,
} from "venera-runtime";

if (!process.argv[2]) throw new Error("Pass a trusted configuration path");
const code = await readFile(process.argv[2], "utf8");
try {
  const source = await loadVeneraConfigBySourceCodeAsync(
    code,
    createVeneraRuntime(),
  );
  console.log(`${source.name} (${source.key}) v${source.version}`);
  // 在这里根据该配置提供的能力调用搜索、详情等功能。
} finally {
  dbManager.close();
}
```

```bash
VENERA_RUNTIME_DATA_DIR="$PWD/runtime-data" node load-config.mjs /path/to/trusted-config.js
```

这里只加载配置和等待 init，不会自动登录、搜索或下载漫画。若只检查元数据，使用 `loadVeneraConfig(code, { runInit: false })`；它仍会执行配置源码和构造函数。

## CLI 与日志

Node UI 把消息、链接和加载状态写入控制台；输入、选择和对话框动作从标准输入读取。`launchUrl` 只输出链接，不启动浏览器。无交互输入的进程应避免调用这些操作，或注入适合宿主的输入输出：

```js
import { UI } from "venera-runtime";
import { setCliIo } from "venera-runtime/adapters/node";

const restore = setCliIo({
  write(message) {
    console.log(message);
  },
  async read() {
    return null;
  }, // 用 null 表示取消
});
try {
  await UI.showInputDialog("Name");
} finally {
  restore();
}
```

自定义 read 可接受第二个 AbortSignal 参数；取消加载状态时应响应它，以免留下等待输入的操作。

开启日志时，在首次使用 logger 之前创建数据根目录下的 `assets/debug`，写入 `info` 等级即可。Node 读取该文件的时机和运行期间限制见 [日志参考](api.md#日志和应用信息)。

## 常见问题

| 现象                                 | 检查方式                                                                                                 |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| SQLite 报 NODE_MODULE_VERSION 不匹配 | 确认实际 node 版本，在该版本下重新安装或 `npm rebuild better-sqlite3`；不要复制另一台机器的 node_modules |
| 缺少 dist 或找不到入口               | 本地源码依赖先执行 `npm run build:node`；确认未跳过 prepare 且构建依赖已安装                             |
| `Database manager is closed`         | 不要在仍需使用运行时期间关闭共享连接；关闭不是重置操作                                                   |
| 看不到配置 console 输出              | 配置 console 走 logger，检查数据根目录和 assets/debug                                                    |
| 无桌面环境下剪贴板失败               | clipboardy 需要宿主剪贴板支持；服务进程不应假设它可用                                                    |
| 新适配器无法注册                     | 在首次平台能力调用、日志读取、数据库操作或 getRuntimeEnvironment() 之前注册                              |
