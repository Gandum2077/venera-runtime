import { runtimeUi } from "./api";
import type { UIApi } from "./venera-types";

/** Venera 1.6.3 的 UI API；Node 环境由 CLI 文本与输入替代原生界面。 */
export const UI: UIApi = {
  showMessage(message) {
    runtimeUi.showMessage(message);
  },

  showDialog(title, content, actions) {
    return runtimeUi.showDialog(title, content, actions);
  },

  launchUrl(url) {
    runtimeUi.launchUrl(url);
  },

  showLoading(onCancel) {
    return runtimeUi.showLoading(onCancel);
  },

  cancelLoading(id) {
    runtimeUi.cancelLoading(id);
  },

  showInputDialog(title, validator, image) {
    return runtimeUi.showInputDialog(title, validator, image);
  },

  showSelectDialog(title, options, initialIndex) {
    return runtimeUi.showSelectDialog(title, options, initialIndex);
  },
};
