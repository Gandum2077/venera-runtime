# 运行环境适配器

`src/api.ts` 是纯类型的能力清单，`RuntimeAdapter` 中的每项能力都必须实现。
`src/adapters/node.ts`、`src/adapters/jsbox.ts` 是内置实现，`src/platform.ts` 负责注册、检测和转发。
共享核心不检查环境名称，也不访问 Node 或 JSBox 原生对象。

## 必须实现的能力

| 能力           | 契约                                                                                                                                                                    |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `openDatabase` | 同步 SQLite 接口，支持参数绑定、查询、更新和原子事务；SQL 错误抛出异常。布尔值绑定为 0/1，undefined 绑定为 NULL。返回值只有 string、number、null 或独立的 ArrayBuffer。 |
| `files`        | 同步文件操作。不存在或不可读取时 read 返回 null，无法列举目录时 list 返回 null；修改操作返回是否成功，宿主抛出的异常可向上传播。相对路径由适配器的存储根目录解释。      |
| `httpRequest`  | 异步 HTTP；timeout 单位为毫秒，响应体为 ArrayBuffer，返回最终 URL 和 Set-Cookie 信息。HTTP 错误状态正常返回，传输错误 reject。                                          |
| `text`         | 同步 UTF-8/GBK 编解码；输入视图必须尊重 byteOffset/byteLength，输出独立的 ArrayBuffer。                                                                                 |
| `clipboard`    | 异步读写文本，空剪贴板返回空字符串，宿主操作失败 reject。                                                                                                               |
| `ui`           | 消息、对话框、链接、加载状态、输入和选择；可以用 CLI 实现。输入/选择取消返回 null，选择结果为从 0 开始的索引；验证失败继续输入。                                        |
| `images`       | 解码、空白图、裁剪、顺时针旋转 90°、填充和 PNG 编码；尺寸使用像素。句柄的 native 字段只允许原适配器解释，PNG 输出为 ArrayBuffer。                                       |

数据库和文件操作保留同步语义，以兼容 Venera 配置中的同步 `saveData()`、`loadData()` 等调用。
只有异步存储 API 的新宿主，需要在适配器内提供同步可用的存储层，不能直接返回 Promise 冒充同步结果。

宿主还需提供 ES2021、console、setTimeout/clearTimeout；依赖包需要通过适合该宿主的构建工具处理。
UUID、哈希、配置模型等纯 JavaScript 逻辑属于共享核心，无需每个宿主重复实现。

## 注册新环境

```ts
import {
  registerRuntimeAdapter,
  type RuntimeAdapterDefinition,
} from "venera-runtime/platform";
import { loadVeneraConfig } from "venera-runtime";
import { createMyHostAdapter, isMyHost } from "./my-host";

const definition = {
  id: "my-host",
  detect: isMyHost,
  create: createMyHostAdapter,
} satisfies RuntimeAdapterDefinition;

registerRuntimeAdapter(definition);
const source = loadVeneraConfig(sourceCode);
```

`createMyHostAdapter(): RuntimeAdapter` 必须返回完整实现。`detect(): boolean` 必须同步、无副作用，且在其他环境中也能安全执行。
只导入包不会检测环境、打开数据库或初始化日志，因此可以使用上面的静态 import 写法。

选择规则：

1. 第一次使用平台能力时，检测已注册的自定义环境；恰好一个匹配时优先使用它。
2. 多个自定义环境同时匹配会报错，不依赖注册顺序隐式选择。
3. 没有自定义匹配时，依次检测 JSBox、Node；都不匹配则明确报错。
4. 只调用选中定义的 create()，检查每项必需方法后保存一份冻结的方法表，保留方法的 this。
5. 选定后不允许再注册或切换环境，以免已有数据库、UI 状态和图片句柄跨宿主混用。

id 只能包含小写字母、数字和连字符，必须以字母开头，不能重复或占用内置的 node、jsbox。
初始化错误直接抛出，不会悄悄回退到其他宿主。完整性检查验证方法存在；行为正确性还需通过适配器测试验证。

## 本次发布准备的接口调整

- 根入口显式导出应用层 API 和 Venera 类型。底层能力、注册和环境查询从 `venera-runtime/platform` 导入。
- 使用 `getRuntimeEnvironment()` 代替旧的 runtimeEnvironment/isNode/isJsBox 常量。
- Node CLI 的 `setCliIo`、`CliIo` 移到 `venera-runtime/adapters/node`；内置工厂分别从 adapters/node、adapters/jsbox 导入。
- TypeScript 使用具名导入。原生 JavaScript ESM 默认导入仍得到 CommonJS 导出对象；不再提供额外的 default API 对象。
- `modifyImage` 只接收 ArrayBuffer 或 ArrayBufferView。JSBox NSData 请先转为 `Uint8Array.from(data.byteArray)`。
- 日志配置在第一次读取 logger 状态或写日志时读取，而非模块导入时读取。

## 验证

- `npm test`：确定性基础测试，包括注册、能力完整性、初始化失败处理和 JSBox 模拟测试。
- `npm run test:compat`：真实配置兼容测试；可设置 VENERA_CONFIGS_DIR，缺失配置仓库时明确失败。
- `npm run test:package`：重新构建并在临时目录安装 tarball，验证 CJS、原生 ESM、SQLite、图片和无 jsbox-types 的消费者类型检查。
- `npm run build:jsbox-test`：构建真机测试应用；Node 模拟和打包成功不能替代 JSBox 真机验证。
