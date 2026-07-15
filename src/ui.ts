import { listDialog } from "jsbox-cview";
import { UIApi } from "./venera-types";
import { showLoading } from "./show-loading";
import { showInputDialog } from "./show-input-dialog";

let loadingIdCounter = 0;

export const UI: UIApi = {
  /**
   * Show a message
   * @param {string} message
   */
  showMessage: (message: string): void => {
    $ui.toast(message);
  },
  /**
   * Show a dialog. Any action will close the dialog.
   * @param {string} title
   * @param {string} content
   * @param {{text:string, callback: () => void | Promise<void>, style: "text"|"filled"|"danger"}[]} actions - If callback returns a promise, the button will show a loading indicator until the promise is resolved.
   * @returns {Promise<void>} - Resolved when the dialog is closed.
   * @since 1.2.1
   */
  showDialog: async (
    title: string,
    content: string,
    actions: { text: string; callback: () => void | Promise<void>; style?: "text" | "filled" | "danger" }[],
  ): Promise<void> => {
    $ui.alert({
      title,
      message: content,
      actions: actions.map((action) => ({
        title: action.text,
        style: action.style === "danger" ? $alertActionType.destructive : $alertActionType.default,
        handler: async () => {
          await action.callback();
        },
      })),
    });
  },

  /**
   * Open [url] in external browser
   * @param {string} url
   */
  launchUrl: (url: string) => {
    $app.openURL(url);
  },

  /**
   * Show a loading dialog.
   * @param {(() => void) | null | undefined} onCancel - Called when the loading dialog is canceled. If [onCancel] is null, the dialog cannot be canceled by the user.
   * @returns {number} - A number that can be used to cancel the loading dialog.
   * @since 1.2.1
   */
  showLoading: (onCancel?: (() => void) | null): number => {
    const id = loadingIdCounter++;
    showLoading(id, onCancel);
    return id;
  },

  /**
   * Cancel a loading dialog.
   * @param {number} id - returned by [showLoading]
   * @since 1.2.1
   */
  cancelLoading: (id: number) => {
    const vid = "loading-mask-" + id;
    $ui.get(vid)?.remove();
  },

  /**
   * Show an input dialog
   * @param {string} title
   * @param {(value: string) => string | null | undefined} validator - A function that validates the input. If the function returns a string, the dialog will show the error message.
   * @param {string | ArrayBuffer | null | undefined} image - Since 1.4.6, you can pass an image url to show an image in the dialog. Since 1.5.3, you can also pass an ArrayBuffer to show a custom image.
   * @returns {Promise<string | null>} - The input value. If the dialog is canceled, return null.
   */
  showInputDialog: (
    title: string,
    validator?: (value: string) => string | null,
    image?: string | ArrayBuffer | null,
  ): Promise<string | null> => {
    return showInputDialog(title, validator, image || undefined);
  },

  /**
   * Show a select dialog
   * @param {string} title
   * @param {string[]} options
   * @param {number | null | undefined} initialIndex
   * @returns {Promise<number | null>} - The selected index. If the dialog is canceled, return null.
   */
  showSelectDialog: async (title: string, options: string[], initialIndex?: number): Promise<number | null> => {
    try {
      const index = await listDialog({ title, items: options, value: initialIndex });
      return index;
    } catch (e) {
      if (e === "cancel") {
        return null;
      } else {
        throw e;
      }
    }
  },
};
