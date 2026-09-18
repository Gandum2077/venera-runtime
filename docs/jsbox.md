# JSBox 接入

[首页](../README.md) · [API 参考](api.md) · [示例入口](../examples/jsbox/main.ts)

运行时在 JSBox 中使用 `$http`、`$sqlite`、`$file`、`$data`、原生 UI 和图片 API。
本仓库测试应用的最低设置为 JSBox SDK 2.22.0、iOS 17.0，配置见仓库 app/config.json。默认检测规则是在宿主同时存在 `$http`、`$sqlite`、`$file` 时选择 JSBox。

## 在现有项目中使用

在桌面端构建项目里安装本包；发布前使用本地 tarball，安装过程见 [Node 安装指南](node.md#安装和模块格式)。

从 `venera-runtime` 具名导入，并通过现有 webpack 工程打包。不要把 Node 的 node_modules 直接复制到手机，也不要把此包的 CommonJS dist 当作可独立运行的 JSBox 脚本。

```ts
import { initializeDatabase, loadVeneraConfig } from "venera-runtime";

if (!$file.exists("assets")) $file.mkdir("assets");
initializeDatabase("assets/database.db");
const code = $file.read("assets/config.js")?.string;
if (!code) throw new Error("Missing assets/config.js");
const source = loadVeneraConfig(code, { runInit: false });
$ui.alert(`${source.name} v${source.version}`);
```

这里不执行 init。需要初始化后再使用数据时，参考[完整示例](../examples/jsbox/main.ts)中的异步加载方式。

## 从最小工程构建

下面命令在调用方工程中执行，适用于已安装本包、没有现成构建配置的项目。shell 打包命令适用于 macOS/Linux，需要 zip。

```bash
npm install --save-dev typescript jsbox-types webpack webpack-cli
mkdir -p src app/assets
```

将本仓库的 examples/jsbox/main.ts 复制为 src/main.ts，把 examples/demo-source.js 复制为 app/assets/config.js。创建 tsconfig.json：

```json
{
  "compilerOptions": {
    "target": "ES2021",
    "module": "NodeNext",
    "rootDir": "src",
    "outDir": "dist",
    "strict": true,
    "skipLibCheck": true,
    "types": ["jsbox-types"],
    "lib": ["ES2023", "DOM"]
  },
  "include": ["src/**/*.ts"]
}
```

上面的 NodeNext 用于桌面编译时解析包 exports，不代表在 JSBox 中运行 Node。此示例调用方 package.json 使用 `"type": "commonjs"`，或不设置 type。

创建 app/config.json：

```json
{
  "info": { "name": "Venera runtime demo", "version": "1.0.0" },
  "settings": { "minSDKVer": "2.22.0", "minOSVer": "17.0.0" }
}
```

编译、打包并生成 .box：

```bash
npx tsc
npx webpack --mode production --entry ./dist/main.js --output-path "$PWD/app" --output-filename main.js
(cd app && zip -r ../venera-demo.box .)
```

把 venera-demo.box 导入 JSBox 并运行。离线示例会初始化数据库并显示 `Local demo: Venera`。
webpack 应使用默认 web 目标，不要把 jsbox-cview 等运行依赖配置为需要手机端 require 的 externals。

## 数据与平台差异

- 文件路径相对于 JSBox 当前应用；不使用 process.env 或 VENERA_RUNTIME_DATA_DIR。
- 在首次数据库操作前准备父目录，并通过 initializeDatabase 指定路径。SQLite、源数据、Cookie 的共享规则与 Node 相同。
- 公共二进制类型是 ArrayBuffer / ArrayBufferView。原生 NSData 只应留在应用或适配器边界。
- HTTP 超时在原生接口中使用秒，适配器会将正的毫秒超时向上取整为至少 1 秒。
- UI 使用 JSBox 原生控件；输入和选择取消返回 null，交互失败会抛错或 reject。

NSData 转换示例：

```ts
import { modifyImage } from "venera-runtime";

async function rotateCover(): Promise<void> {
  const data = $file.read("assets/cover.png");
  if (!data) throw new Error("Missing cover image");
  const png = await modifyImage(
    Uint8Array.from(data.byteArray),
    `
    function modifyImage(image) { return image.copyAndRotate90(); }
  `,
  );
  $file.write({
    path: "assets/rotated.png",
    data: $data({ byteArray: Array.from(new Uint8Array(png)) }),
  });
}
```

调用 `rotateCover()` 时由应用处理 Promise 的异常。不要将 NSData 直接传给 modifyImage。

## 验证

在运行时仓库执行 `npm run build:jsbox-test` 生成真机测试应用；运行后导出 JSON 报告，与 Node 报告比较。完整步骤见 [贡献指南](../CONTRIBUTING.md#jsbox-真机与报告比较)。

Node 模拟测试和 webpack 构建不能验证 iOS 原生 API、布局或真实交互。接入或修改适配器后仍需在 JSBox 真机运行。
