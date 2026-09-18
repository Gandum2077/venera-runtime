# 变更记录

## 未发布

以下记录当前工作树的首版发布准备内容，不表示 npm 上已经发布对应版本。

### 功能与发布支持

- 接入 ESLint flat config、类型感知规则、格式检查与独立 lint CI。开发编译器调整至 typescript-eslint 支持的 TypeScript 6.0 系列。

- 支持 Node.js 与 JSBox 执行 Venera 1.6.3 配置，提供网络、Cookie、SQLite、编码、HTML、图片和交互能力。
- 将平台层拆为必需能力契约、独立适配器和注册机制，支持新增环境的同步检测与惰性初始化。
- 显式定义公共导出，补充直接依赖、干净构建、tarball 消费验证和 CI。
- 分离基础测试与真实配置兼容测试，后者缺失输入时明确失败。
- 整理 API、平台接入、贡献指南及离线示例。

### 相对早期本地版本的破坏性调整

- 底层能力入口移至 `venera-runtime/platform`；Node CLI 配置移至 `venera-runtime/adapters/node`。
- 通过 getRuntimeEnvironment() 查询宿主，替代 runtimeEnvironment/isNode/isJsBox 常量。
- 根入口只公开明确列出的应用 API 和类型；移除额外的 default API 对象，建议使用具名导入。
- modifyImage 不再接受 NSData；调用方需转换为标准二进制类型。
- logger 改为首次使用时读取配置；适配器在首次使用后固定，不允许再注册或切换。
- Node 支持范围调整为 `^20.18.1 || ^22.0.0 || ^24.0.0 || ^26.0.0`。

### 修复

- JSBox 原生 alert 返回拒绝时向调用方传播错误。

- 捕获后台 init 的同步抛错和异步拒绝。
- 检查 JSBox SQLite 更新结果，失败时抛错并回滚事务。
- JSBox 对话框回调失败时拒绝 Promise。
- 消除公共图片接口对 JSBox 全局类型的依赖。

迁移和适配器接入说明见 [环境适配器](docs/platform-adapters.md)。
