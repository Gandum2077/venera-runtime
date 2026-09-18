# venera-runtime

在 **Node.js 和 JSBox** 中执行 [Venera](https://github.com/venera-app/venera) 配置脚本，提供配置加载、网络、Cookie、SQLite 持久化、编码、HTML、图片处理和交互能力。

当前对齐 **Venera 1.6.3**，配置脚本看到的 `APP.platform` 固定为 `ios`。新增运行环境可通过[能力契约和适配器](docs/platform-adapters.md)接入。

本项目提供运行时。配置文件的获取、更新、账号流程、图片加载链和阅读器由调用方实现。

> 配置源码和图片处理脚本直接在宿主 JavaScript 环境中执行，没有安全沙箱。只加载完全可信的脚本；`runInit: false` 也不会阻止顶层代码和构造函数执行。

## 安装

Node.js 版本要求：`^20.18.1 || ^22.0.0 || ^24.0.0 || ^26.0.0`。JSBox 接入见 [JSBox 指南](docs/jsbox.md)。

项目目前处于 npm 发布准备阶段，可先从本地仓库生成安装包：

```bash
# 在本仓库中
npm ci
npm pack

# 在调用方项目中，使用 npm pack 输出的实际文件名
npm install /absolute/path/to/venera-runtime/venera-runtime-1.0.0.tgz
```

正式发布后的安装命令为 `npm install venera-runtime`。Node 依赖包含 `better-sqlite3`、`sharp` 等原生模块，应在目标机器上安装。更多方式见 [Node.js 指南](docs/node.md)。

## 快速上手

保存为 `demo.cjs`，在已安装本包的项目中执行 `node demo.cjs`。这个示例不访问网络，也不写入数据库。

```js
const { loadVeneraConfig } = require("venera-runtime");

const source = loadVeneraConfig(
  `class DemoSource extends ComicSource {
    name = "Local demo";
    key = "local_demo";
    version = "1.0.0";
    search = {
      load: async (keyword) => ({
        comics: [new Comic({ id: "demo-1", title: keyword, cover: "" })],
        maxPage: 1
      })
    };
  }`,
  { runInit: false },
);

async function main() {
  const result = await source.search.load("Venera", [], 1);
  console.log(source.name); // Local demo
  console.log(result.comics[0].title); // Venera
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

默认 `loadVeneraConfig(code)` 会同步返回配置实例，然后在后台启动 `init()`。若后续操作依赖初始化结果，使用 `loadVeneraConfigBySourceCodeAsync()` 并等待完成，见 [API 参考](docs/api.md#加载与初始化)。

原生 ESM / TypeScript 使用具名导入：

```ts
import { loadVeneraConfig, type VeneraConfigSource } from "venera-runtime";
```

完整示例见 [examples](examples/README.md)，包括 CommonJS、ESM、等待初始化、TypeScript 和 JSBox。

## 文档

| 文档                                    | 内容                                                   |
| --------------------------------------- | ------------------------------------------------------ |
| [API 参考](docs/api.md)                 | 公开导出、加载时序、数据共享、数据库、网络、图片、日志 |
| [Node.js](docs/node.md)                 | 安装、模块格式、数据目录、CLI、常见问题                |
| [JSBox](docs/jsbox.md)                  | 依赖接入、构建、原生数据转换和真机验证                 |
| [环境适配器](docs/platform-adapters.md) | 必需能力、检测与注册、生命周期和接口迁移               |
| [贡献指南](CONTRIBUTING.md)             | 开发、测试、跨平台报告、发布验证                       |
| [变更记录](CHANGELOG.md)                | 尚未发布的变更与破坏性调整                             |

## 支持边界

- 配置可以只实现部分能力；使用前检查 `source.search`、`source.comic` 等字段。
- 创建多个 `globals` 只分离配置注册表，**不会隔离数据库、Cookie 或平台适配器**。
- Node 的 UI 使用控制台和标准输入；JSBox 使用原生 UI。
- `Convert.decryptRsa` 尚未实现。`veneraFetch` 是兼容接口，不是完整的标准 Fetch API。
- 本项目目前没有内置浏览器适配器。真实配置测试验证加载和元数据，不代表所有网站功能或网络请求都可用。

## 开发

```bash
npm ci
npm run typecheck
npm test
npm run test:examples
```

完整验证流程见 [贡献指南](CONTRIBUTING.md)。

## 许可证

[GPL-3.0-only](LICENSE)。
