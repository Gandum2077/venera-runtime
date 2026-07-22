export * from "./api";
export * from "./app";
export * from "./config";
export * from "./convert";
export * from "./cookiejar";
export * from "./database";
export * from "./html-wrapper";
export * from "./load-config";
export * from "./modify-image";
export * from "./network";
export * from "./package-api";
export * from "./runtime";
export * from "./ui";
export * from "./venera-types";

import { APP } from "./app";
import { Convert } from "./convert";
import {
  loadVeneraConfigBySourceCode,
  loadVeneraConfigBySourceCodeAsync,
} from "./load-config";
import { Network, veneraFetch } from "./network";
import { loadVeneraConfig } from "./package-api";
import { createVeneraRuntime } from "./runtime";
import { UI } from "./ui";

/** 供原生 ESM 默认导入使用的常用 API 集合。 */
const veneraRuntime = {
  APP,
  Convert,
  Network,
  UI,
  createVeneraRuntime,
  loadVeneraConfig,
  loadVeneraConfigBySourceCode,
  loadVeneraConfigBySourceCodeAsync,
  fetch: veneraFetch,
};

export default veneraRuntime;
