# venera-runtime

本项目的目标是让[venera](https://github.com/venera-app/venera)的核心能够在 Node.js 和 JSBox 上运行。

## 现状与目标

（可以修改本部分，以反应实时进度）

### 现状

已完成平台 API 边界与 Node.js 实现。Node 类型检查、17 项模块/API 测试和 31 个真实配置的无网络加载测试已经通过。JSBox 真机复测 8/8 通过，报告与 Node 完全匹配。外部 HTTP 测试原先使用 httpbin，真机耗时约 38 秒，现已改用轻量 204 连通性端点。项目可通过本地目录或 tarball 作为 npm 包安装，并已验证 CommonJS、ESM 和 TypeScript 消费方式。

兼容目标固定为 Venera 1.6.3，配置脚本看到的平台固定为 iOS。本项目不管理配置文件。

## 目标

让 venera 核心在 Node.js 和 JSBox 上均可运行，并实现完整的测试。

1. [x] 基于目前 JSBox 端的代码，将 JSBox 的专用 API 抽离到 `src/api.ts`。
2. [x] 为 `src/api.ts` 添加 Node.js 实现，并使用中立数据类型保证双方接口一致。
3. [x] 添加 API、数据库、网络、Cookie、编码、HTML、图片、配置运行时和真实配置加载测试。
4. [x] Node.js 的 UI 模块使用 CLI 文本和标准输入代替原生 UI。
5. [x] 在 JSBox 真机运行测试应用，导出结果并与 Node 报告比较。

## 背景知识

### JSBox

JSBox 是一个可以用来运行 JavaScript 脚本的 iOS 应用，它的强大之处在于可以调用 iOS 的原生接口，创建 iOS 原生 UI 控件。

JSBox 的重要概念：

- JSBox 使用了 JavaScriptCore 作为引擎，可以使用现代 JS 语法。
- JSBox 对 UIKit 进行了简单的封装和抽象，让用户可以通过 JavaScript 在 JSBox 里面绘制界面。
- 视图的布局是基于 Masonry 的封装。
- JSBox 有自己的一套 API，比如网络、数据库、文件系统等，不能使用 NodeJS 和 浏览器环境的 API。

JSBox 文档本地位置: /Users/agni/Projects/Github/jsbox-docs

### Venera

venera 是一个可以使用自定义配置的漫画阅读工具。venera-configs 是它的配置文件。

venera本地位置: /Users/agni/Projects/Github/venera

venera-configs本地位置: /Users/agni/Projects/Github/venera-configs

现在已经完成一个让 venera 在浏览器环境中运行的Demo: /Users/agni/Projects/Github/venera-browser-demo
