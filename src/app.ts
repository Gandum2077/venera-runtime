import { AppRuntimeInfo } from "./venera-types";
import { VENERA_APP_VERSION, VENERA_RUNTIME_PLATFORM } from "./constants";
import { configManager } from "./config";

export const APP: AppRuntimeInfo = {
  // 配置源有时会根据平台或语言做分支判断，所以这里提供最基本的 APP 信息。
  get version(): string {
    return VENERA_APP_VERSION;
  },
  get locale(): string {
    return configManager.locale;
  },
  get platform(): "android" | "ios" | "windows" | "macos" | "linux" {
    return VENERA_RUNTIME_PLATFORM;
  },
};
