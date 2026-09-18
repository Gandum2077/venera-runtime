# 可运行示例

[返回项目首页](../README.md)

示例导入包名 `venera-runtime`，不依赖 `src/` 内部路径。仓库内运行时，先生成 `dist`，Node 会通过本包的 exports 解析入口：

```bash
npm ci
npm run build:node
node examples/node/basic.cjs
node examples/node/basic.mjs
node examples/node/initialized.mjs
```

前两个示例输出 `Local demo: Venera`；第三个输出 `Initialized: true`。
示例不请求外部网站。前两个关闭 init，第三个使用内存数据库并显式等待初始化，均不创建持久化数据库。

| 文件                                    | 用途                                         |
| --------------------------------------- | -------------------------------------------- |
| [demo-source.js](demo-source.js)        | 供运行时读取的配置脚本，不是 Node 模块       |
| [basic.cjs](node/basic.cjs)             | CommonJS 加载和搜索                          |
| [basic.mjs](node/basic.mjs)             | 原生 ESM 加载和搜索                          |
| [initialized.mjs](node/initialized.mjs) | 等待初始化后读取配置数据                     |
| [inspect.mts](node/inspect.mts)         | TypeScript 元数据检查，可传入可信配置路径    |
| [main.ts](jsbox/main.ts)                | JSBox 入口，读取 assets/config.js 并执行搜索 |

TypeScript 示例可在调用方安装 `typescript`、`@types/node` 和 `tsx` 后运行：

```bash
npx tsx examples/node/inspect.mts
npx tsx examples/node/inspect.mts /absolute/path/to/trusted-config.js
```

JSBox 示例需要编译打包，具体命令见 [JSBox 指南](../docs/jsbox.md)。复制示例到其他项目时，保留 `demo-source.js` 与入口之间的相对路径，或自行调整读取路径。

维护者执行 `npm run test:examples` 可检查两种环境的 TypeScript 示例，并运行 README、CJS、ESM 和初始化示例；JSBox 真机运行仍需单独验证。
