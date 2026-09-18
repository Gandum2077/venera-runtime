# 贡献指南

[项目首页](README.md) · [API 参考](docs/api.md) · [环境适配器](docs/platform-adapters.md)

## 开发准备

开发和 lint 建议使用 Node 24 或 26。ESLint 10 要求 `^20.19.0 || ^22.13.0 || >=24`，高于包消费者的最低 Node 版本；CI 把 lint/格式检查放在 Node 24 的独立任务中，原有运行时版本矩阵继续负责兼容性验证。

初始化并检查：

```bash
npm ci
npm run lint
npm run format:check
npm run typecheck
npm test
```

npm ci 的 prepare 会构建 dist。依赖包含原生模块，切换 Node 版本后需要重新安装或重建对应模块。
JSBox 的 .box 打包脚本还需要 POSIX shell 和 zip；当前 CI 在 Ubuntu 上执行。

## 目录和边界

| 路径                               | 职责                                   |
| ---------------------------------- | -------------------------------------- |
| src/api.ts                         | 纯类型的必需能力契约，不导入宿主实现   |
| src/platform.ts                    | 注册、检测、验证和转发平台能力         |
| src/adapters/                      | Node、JSBox 实现；宿主专有类型留在这里 |
| src/runtime.ts、src/load-config.ts | 配置全局对象、加载和初始化             |
| src/venera-types.ts                | Venera 配置接口和模型类型              |
| src/index.ts                       | 显式列出的应用公共 API                 |
| test/                              | Node 确定性测试与 JSBox 模拟测试       |
| src/api-test-suite.ts              | 两种环境使用的共用能力测试             |
| examples/、docs/                   | 可运行示例和使用文档                   |

新增环境时实现 RuntimeAdapter 和同步 detect 规则，通过注册接入。共享核心不应增加环境名称分支。
新增公共接口时同步更新类型、公开导出、相关文档与示例；修改初始化或持久化行为时添加针对性回归测试。

## 检查命令

| 命令                       | 范围                                                                    |
| -------------------------- | ----------------------------------------------------------------------- |
| `npm run lint`             | ESLint flat config，源码、测试、示例和构建脚本；警告也导致失败          |
| `npm run lint:fix`         | 自动修复可修复的 lint 问题，会写入文件                                  |
| `npm run format:check`     | 只检查 Prettier 格式，不写入文件                                        |
| `npm run typecheck`        | 源码与测试类型检查                                                      |
| `npm test`                 | 本地确定性测试，包含临时 HTTP 服务；不依赖真实配置仓库                  |
| `npm run test:coverage`    | 同一组测试的覆盖率报告                                                  |
| `npm run test:examples`    | 重建包、检查 Node/JSBox TypeScript 示例、运行离线示例和 README 快速上手 |
| `npm run test:compat`      | 外部真实配置的加载和元数据验证，不运行网络 init                         |
| `npm run test:package`     | 独立临时目录安装 tarball，检查 CJS、ESM、类型、原生模块及 Node 示例     |
| `npm run build:node`       | 清理并重新生成 dist 和声明文件                                          |
| `npm run build:jsbox-test` | 生成 JSBox 真机测试应用                                                 |
| `npm run format`           | 用 Prettier 格式化仓库，会写入文件                                      |

包消费者测试需要安装依赖；首次可能访问 npm registry。测试进程需要允许本地回环端口监听。
不要因为环境无法启动 HTTP 服务或原生模块 ABI 不匹配，就把测试失败当作实现回归；先修复测试环境。

## ESLint 与格式化

`eslint.config.mjs` 使用 flat config。JavaScript 使用 ESLint 推荐规则，TypeScript 使用 typescript-eslint 推荐规则，并开启悬空 Promise、Promise 误用、await 非 Promise 和类型导入检查。格式继续由 Prettier 管理，eslint-config-prettier 关闭冲突规则。

当前开发编译器固定在 TypeScript 6.0 系列：typescript-eslint 8.70 支持 `>=4.8.4 <6.1.0`，尚不支持原来的 TypeScript 7 编译器。升级编译器时需一起验证解析器兼容性，不能跳过 peer dependency 检查。

类型感知检查显式使用 `tsconfig.eslint.json`，覆盖 src、test、TypeScript 示例和 Vitest 配置，解决测试/示例分别使用命名 tsconfig 的问题。它不生成产物，也不改变发布构建的包含范围。

Node JavaScript 脚本、JSBox 应用脚本和 Venera 配置示例分别声明全局变量。TypeScript 的未声明标识符由 tsc 检查。dist、覆盖率、测试报告、外部配置样本等生成内容不参与 lint/格式检查。

动态 Node 模块解析、可信配置执行和 JSBox 原生 UI 延迟加载使用逐行例外，并在注释中写明原因。新增例外也应限制到具体语句；未使用的 eslint-disable 会报错。保留未使用的位置参数时可以用 `_` 前缀，不需要的参数则直接删除。

## 真实配置兼容性

基础测试与外部配置测试独立。准备可信的 venera-configs 仓库并运行：

```bash
VENERA_CONFIGS_DIR=/absolute/path/to/venera-configs npm run test:compat
```

未设置时默认查找仓库旁的 `../Github/venera-configs`。缺少 index.json 时测试会失败，不会跳过。
CI 使用固定配置提交以保证可复现；更新该提交时需要重新验证。此测试不会覆盖所有网站的登录、搜索、图片下载等功能。

## JSBox 真机与报告比较

1. 在仓库执行 `npm run build:jsbox-test`，将生成的 venera-runtime.box 导入 JSBox。
2. 在真机运行测试应用，确认完成情况；使用分享按钮导出 jsbox-api-report.json 和 Markdown 报告。
3. 把 JSON 保存到仓库的 test-results/jsbox-api-report.json。
4. 在同一源码版本运行 Node 报告，再比较：

```bash
npm run test:node-report
npm run test:compare
```

Node 默认写入 test-results/node-api-report.json。若设置 VENERA_RUNTIME_DATA_DIR，报告会写入该根目录下的 test-results；此时向比较命令传入实际路径：

```bash
npm run test:compare -- /path/to/node-api-report.json /path/to/jsbox-api-report.json
```

报告测试会访问连通性端点，Node 可通过 VENERA_TEST_NETWORK_URL 覆盖。JSBox 测试使用源码中配置的默认端点；比较时要考虑网络条件。

**比较成功只说明两边的用例状态相同**，并不保证两份报告都成功。还应检查两份报告的 failed 和 skipped 数量。真机报告保存在 JSBox 的 shared://venera-runtime-api-report.json 和同名 .md 文件中。

调试构建使用 `npm run build:jsbox-test:debug`，生成 venera-runtime-debug.box。本仓库的 `npm run build` 默认入口是库本身；需要测试界面时使用明确的 build:jsbox-test 命令。

## CI 与发布前验证

.github/workflows/ci.yml 对 Node 20.18.1、22、24、26 执行类型、基础测试、示例和 tarball 验证；另有真实配置兼容与 JSBox 构建任务。
CI 不能替代 JSBox 真机验证。

发布前依次检查：

```bash
npm run lint
npm run format:check
npm run typecheck
npm test
npm run test:examples
npm run test:compat
npm run test:package
npm run build:jsbox-test
npm pack --dry-run
```

确认版本、CHANGELOG、支持环境和包文件清单与本次发布一致；归档对应的真机报告。
本地 npm pack 与 test:package 不会发布到 registry。实际发布是单独的维护者操作，不在检查命令中执行。
