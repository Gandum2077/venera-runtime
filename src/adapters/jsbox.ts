import type {
  DatabaseRow,
  DatabaseValue,
  DatabasePrimitive,
  RuntimeDatabase,
  RuntimeFileApi,
  RuntimeHttpRequest,
  RuntimeHttpResponse,
  RuntimeUiApi,
  RuntimeImageApi,
  RuntimeAdapter,
  RuntimeAdapterDefinition,
} from "../api";
import { exactArrayBuffer } from "./bytes";
export function createJsBoxAdapter(): RuntimeAdapter {
  function normalizeDatabaseOutput(value: unknown): DatabaseValue {
    if (value instanceof ArrayBuffer || ArrayBuffer.isView(value))
      return exactArrayBuffer(value);
    if (value && typeof value === "object" && "byteArray" in value) {
      return exactArrayBuffer((value as { byteArray: number[] }).byteArray);
    }
    if (value === null || value === undefined) return null;
    if (typeof value === "boolean") return value ? 1 : 0;
    if (typeof value === "string" || typeof value === "number") return value;
    throw new TypeError("Unsupported SQLite result value");
  }

  function normalizeDatabaseRow(row: Record<string, unknown>): DatabaseRow {
    return Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        normalizeDatabaseOutput(value),
      ]),
    );
  }

  function normalizeJsBoxDatabaseValue(
    value: DatabasePrimitive,
  ): string | number | boolean | NSData | null {
    if (value === null || value === undefined) return null;
    if (typeof value === "boolean") return value ? 1 : 0;
    if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
      return $data({
        byteArray: Array.from(new Uint8Array(exactArrayBuffer(value))),
      });
    }
    return value;
  }

  function createJsBoxDatabase(path: string): RuntimeDatabase {
    const database = $sqlite.open(path);
    return {
      query(sql, args = []) {
        const rows: DatabaseRow[] = [];
        const options =
          args.length > 0
            ? { sql, args: args.map(normalizeJsBoxDatabaseValue) }
            : sql;
        database.query(options, (resultSet, error) => {
          if (error) {
            throw new Error(String(error) || `SQLite query failed: ${sql}`);
          }
          try {
            while (resultSet.next()) {
              rows.push(
                normalizeDatabaseRow(
                  resultSet.values as unknown as Record<string, unknown>,
                ),
              );
            }
          } finally {
            resultSet.close();
          }
        });
        return rows;
      },
      update(sql, args = []) {
        const options =
          args.length > 0
            ? { sql, args: args.map(normalizeJsBoxDatabaseValue) }
            : sql;
        const result = database.update(options);
        if (!result.result || result.error)
          throw new Error(String(result.error || "SQLite update failed"));
      },
      transaction(statements) {
        database.beginTransaction();
        try {
          for (const statement of statements) {
            const args = statement.args ?? [];
            const options =
              args.length > 0
                ? {
                    sql: statement.sql,
                    args: args.map(normalizeJsBoxDatabaseValue),
                  }
                : statement.sql;
            const result = database.update(options);
            if (!result.result || result.error)
              throw new Error(String(result.error || "SQLite update failed"));
          }
          database.commit();
        } catch (error) {
          database.rollback();
          throw error;
        }
      },
      close() {
        $sqlite.close(database);
      },
    };
  }

  function jsBoxFileApi(): RuntimeFileApi {
    return {
      exists: (path) => $file.exists(path),
      isDirectory: (path) => $file.isDirectory(path),
      mkdir: (path) => $file.mkdir(path),
      list: (path) => $file.list(path) ?? null,
      readText(path) {
        return $file.read(path)?.string ?? null;
      },
      readBytes(path) {
        const data = $file.read(path);
        return data ? exactArrayBuffer(data.byteArray) : null;
      },
      writeText(path, content) {
        return $file.write({ data: $data({ string: content }), path });
      },
      writeBytes(path, content) {
        return $file.write({
          data: $data({
            byteArray: Array.from(new Uint8Array(exactArrayBuffer(content))),
          }),
          path,
        });
      },
      move: (source, destination) =>
        $file.move({ src: source, dst: destination }),
      delete: (path) => !$file.exists(path) || $file.delete(path),
    };
  }

  function encodeText(value: string, encoding: "utf8" | "gbk"): ArrayBuffer {
    const data = $data({
      string: value,
      encoding: encoding === "utf8" ? 4 : 2147485234,
    });
    return exactArrayBuffer(data.byteArray);
  }

  function decodeText(
    value: ArrayBuffer | ArrayBufferView,
    encoding: "utf8" | "gbk",
  ): string {
    const data = $data({
      byteArray: Array.from(new Uint8Array(exactArrayBuffer(value))),
    });
    return $text.decodeData({
      data,
      encoding: encoding === "utf8" ? 4 : 2147485234,
    });
  }

  function getHeader(
    headers: Record<string, string>,
    name: string,
  ): string | undefined {
    const normalizedName = name.toLowerCase();
    return Object.entries(headers).find(
      ([key]) => key.toLowerCase() === normalizedName,
    )?.[1];
  }

  async function jsBoxHttpRequest(
    request: RuntimeHttpRequest,
  ): Promise<RuntimeHttpResponse> {
    let body: Record<string, unknown> | NSData | undefined;
    if (
      request.body instanceof ArrayBuffer ||
      ArrayBuffer.isView(request.body)
    ) {
      body = $data({
        byteArray: Array.from(new Uint8Array(exactArrayBuffer(request.body))),
      });
    } else if (typeof request.body === "string") {
      body = $data({ string: request.body });
    } else if (request.body !== null && request.body !== undefined) {
      body = request.body;
    }
    // JSBox native methods require $http as their receiver.
    const response = await $http.request({
      method: request.method,
      url: request.url,
      header: request.headers,
      body,
      timeout:
        request.timeout === undefined || request.timeout === 0
          ? undefined
          : Math.max(1, Math.ceil(request.timeout / 1000)),
    });
    if (response.error) {
      throw new Error(
        `Network request failed: ${response.error.localizedDescription}`,
      );
    }
    const headers = Object.fromEntries(
      Object.entries(response.response?.headers ?? {}).map(([key, value]) => [
        key,
        String(value),
      ]),
    );
    const setCookie = getHeader(headers, "set-cookie");
    return {
      status: response.response?.statusCode ?? 0,
      headers,
      body: exactArrayBuffer(response.rawData.byteArray),
      url: response.response?.url || request.url,
      setCookieHeaders: setCookie ? [setCookie] : [],
    };
  }

  async function setClipboardText(text: string): Promise<void> {
    $clipboard.text = text;
    return;
  }

  async function getClipboardText(): Promise<string> {
    return $clipboard.text || "";
  }

  let loadingId = 0;

  const loadingCancelCallbacks = new Map<number, (() => void) | null>();

  function showJsBoxLoading(id: number, onCancel?: (() => void) | null): void {
    const viewId = `loading-mask-${id}`;
    const maskView: UiTypes.ViewOptions = {
      type: "view",
      props: { id: viewId, bgcolor: $color("clear") },
      layout: $layout.fill,
      views: [
        {
          type: "blur",
          props: { style: 3, radius: 13 },
          layout: (make, view) => {
            make.center.equalTo(view.super);
            make.size.equalTo($size(250, 151));
          },
          views: [
            {
              type: "spinner",
              props: { loading: true, color: $color("white") },
              layout: (make, view) => {
                make.centerX.equalTo(view.super);
                make.top.inset(28);
              },
            },
            {
              type: "label",
              props: {
                text: "Loading",
                textColor: $color("white"),
                font: $font("bold", 17),
              },
              layout: (make, view) => {
                make.centerX.equalTo(view.super);
                make.top.equalTo(view.prev.bottom).offset(18);
              },
            },
            ...(onCancel
              ? [
                  {
                    type: "view" as const,
                    props: { bgcolor: $color("separator") },
                    layout: (make: MASConstraintMaker) => {
                      make.left.right.inset(0);
                      make.bottom.inset(44);
                      make.height.equalTo(1 / $device.info.screen.scale);
                    },
                  },
                  {
                    type: "button" as const,
                    props: {
                      title: "Cancel",
                      font: $font(16),
                      bgcolor: $color("clear"),
                    },
                    layout: (make: MASConstraintMaker) => {
                      make.left.right.bottom.inset(0);
                      make.height.equalTo(44);
                    },
                    events: {
                      tapped: () => {
                        loadingCancelCallbacks.delete(id);
                        $ui.get(viewId)?.remove();
                        onCancel();
                      },
                    },
                  },
                ]
              : []),
          ],
        },
      ],
    };
    $ui.window.add(maskView);
  }

  async function showJsBoxInputDialog(
    title: string,
    validator?: (value: string) => string | null,
    image?: string | ArrayBuffer | null,
  ): Promise<string | null> {
    const {
      Base,
      DialogSheet,
      Image: CViewImage,
      Input,
      Label,
      searchBarBgcolor,
    } = require("jsbox-cview") as typeof import("jsbox-cview"); // eslint-disable-line @typescript-eslint/no-require-imports -- Load native UI code only in JSBox.
    class LazyImage extends Base<UIView, UiTypes.ViewOptions> {
      private readonly url: string;
      _defineView: () => UiTypes.ViewOptions;

      constructor(url: string) {
        super();
        this.url = url;
        this._defineView = () => ({
          type: "view",
          props: { id: this.id },
          layout: (make, view) => {
            make.top.inset(15);
            make.centerX.equalTo(view.super);
            make.height.equalTo(100);
            make.left.right.inset(25);
          },
          views: [
            {
              type: "image",
              props: {
                id: `${this.id}-image`,
                contentMode: $contentMode.scaleAspectFit,
                bgcolor: $color("clear"),
              },
              layout: $layout.fill,
            },
            {
              type: "label",
              props: {
                id: `${this.id}-loadingLabel`,
                text: "图片正在加载...",
                textColor: $color("secondaryText"),
                font: $font(13),
              },
              layout: (make, view) => make.center.equalTo(view.super),
            },
          ],
          events: { ready: () => void this.load() },
        });
      }

      private async load(): Promise<void> {
        const response = await $http.get(this.url);
        if (
          response.error ||
          response.response.statusCode >= 300 ||
          !response.rawData.image
        ) {
          ($(this.id + "-loadingLabel") as UILabelView).text = "图片加载失败";
          return;
        }
        const nativeImage = response.rawData.image;
        ($(this.id + "-image") as UIImageView).image = nativeImage;
        $(this.id + "-loadingLabel").hidden = true;
        this.view.updateLayout((make) =>
          make.height.equalTo(Math.min(nativeImage.size.height, 300)),
        );
      }
    }
    class InputView extends Base<UIView, UiTypes.ViewOptions> {
      _defineView: () => UiTypes.ViewOptions;
      private readonly input: InstanceType<typeof Input>;
      private readonly errorLabel: InstanceType<typeof Label>;

      constructor(url?: string, nativeImage?: UIImage) {
        super();
        const views: UiTypes.AllViewOptions[] = [];
        const hasImage = Boolean(url || nativeImage);
        this.input = new Input({
          props: {
            bgcolor: searchBarBgcolor,
            font: $font(17),
            textColor: $color("primaryText"),
            align: $align.left,
            placeholder: "请输入",
          },
          layout: (make, view) => {
            if (hasImage) make.top.equalTo(view.prev.bottom).inset(15);
            else make.top.inset(30);
            make.left.right.inset(25);
            make.height.equalTo(44);
          },
          events: { changed: () => (this.errorText = "") },
        });
        this.errorLabel = new Label({
          props: {
            textColor: $color({ light: "#D14343", dark: "#FF8B8B" }),
            font: $font(13),
          },
          layout: (make, view) => {
            make.left.right.equalTo(view.prev);
            make.top.equalTo(view.prev.bottom).inset(5);
          },
        });
        views.push(this.input.definition, this.errorLabel.definition);
        if (nativeImage) {
          views.unshift(
            new CViewImage({
              props: { image: nativeImage },
              layout: (make, view) => {
                make.top.inset(15);
                make.centerX.equalTo(view.super);
                make.height.equalTo(Math.min(nativeImage.size.height, 300));
                make.left.right.inset(25);
              },
            }).definition,
          );
        } else if (url) {
          views.unshift(new LazyImage(url).definition);
        }
        this._defineView = () => ({
          type: "view",
          props: { id: this.id },
          layout: $layout.fill,
          views,
        });
      }

      get text(): string {
        return this.input.view.text;
      }

      set errorText(value: string) {
        this.errorLabel.view.text = value;
      }
    }
    let imageUrl: string | undefined;
    let nativeImage: UIImage | undefined;
    if (typeof image === "string") {
      imageUrl = image;
    } else if (image) {
      nativeImage = $data({
        byteArray: Array.from(new Uint8Array(exactArrayBuffer(image))),
      }).image;
      if (!nativeImage) throw new Error("无效的图片数据");
    }
    const inputView = new InputView(imageUrl, nativeImage);
    try {
      return await new Promise<string>((resolve, reject) => {
        const sheet = new DialogSheet({
          title,
          cview: inputView,
          bgcolor: $color("primarySurface"),
          doneButtonValidator: () => {
            const validationError = validator?.(inputView.text) ?? null;
            inputView.errorText = validationError || "";
            return !validationError;
          },
          doneHandler: () => inputView.text,
        });
        sheet.promisify(resolve, reject);
      });
    } catch (error) {
      if (error === "cancel") return null;
      throw error;
    }
  }

  const runtimeUi: RuntimeUiApi = {
    showMessage(message) {
      $ui.toast(message);
    },
    async showDialog(title, content, actions) {
      await new Promise<void>((resolve, reject) => {
        void Promise.resolve(
          $ui.alert({
            title,
            message: content,
            actions: (actions.length > 0
              ? actions
              : [{ text: "OK", callback: () => {} }]
            ).map((action) => ({
              title: action.text,
              style:
                action.style === "danger"
                  ? $alertActionType.destructive
                  : $alertActionType.default,
              handler: async () => {
                try {
                  await action.callback();
                  resolve();
                } catch (error) {
                  reject(error);
                }
              },
            })),
          }),
        ).catch(reject);
      });
    },
    launchUrl(url) {
      $app.openURL(url);
    },
    showLoading(onCancel) {
      const id = loadingId++;
      loadingCancelCallbacks.set(id, onCancel ?? null);

      showJsBoxLoading(id, onCancel);

      return id;
    },
    cancelLoading(id) {
      if (!loadingCancelCallbacks.has(id)) return;
      loadingCancelCallbacks.delete(id);

      $ui.get(`loading-mask-${id}`)?.remove();
    },
    async showInputDialog(title, validator, image) {
      return showJsBoxInputDialog(title, validator, image);
    },
    async showSelectDialog(title, options, initialIndex) {
      if (options.length === 0) return null;

      const { listDialog } =
        require("jsbox-cview") as typeof import("jsbox-cview"); // eslint-disable-line @typescript-eslint/no-require-imports -- Load native UI code only in JSBox.
      try {
        return await listDialog({
          title,
          items: options,
          value: initialIndex ?? undefined,
        });
      } catch (error) {
        if (error === "cancel") return null;
        throw error;
      }
    },
  };

  const runtimeImages: RuntimeImageApi = {
    async decode(data) {
      const nativeData = $data({
        byteArray: Array.from(new Uint8Array(exactArrayBuffer(data))),
      });
      const image = nativeData.image;
      if (!image) throw new Error("Invalid image data");
      return {
        width: image.size.width,
        height: image.size.height,
        native: image,
      };
    },
    empty(width, height) {
      const image = $imagekit.render({ size: $size(width, height) }, () => {});
      return { width, height, native: image };
    },
    crop(image, x, y, width, height) {
      const source = image.native as UIImage;
      let cropped: UIImage;
      if (x === 0 && y === 0) {
        cropped = $imagekit.cropTo(source, $size(width, height), 0);
      } else {
        const first = $imagekit.cropTo(source, $size(width + x, height + y), 0);
        cropped = $imagekit.cropTo(first, $size(width, height), 5);
      }
      return { width, height, native: cropped };
    },
    rotate90(image) {
      const rotated = $imagekit.rotate(image.native as UIImage, -Math.PI * 0.5);
      return { width: image.height, height: image.width, native: rotated };
    },
    fill(target, x, y, source) {
      const combined = $imagekit.combine(
        target.native as UIImage,
        source.native as UIImage,
        $point(x, y),
      );
      return { width: target.width, height: target.height, native: combined };
    },
    async encodePng(image) {
      const data = (image.native as UIImage).png;
      if (!data) throw new Error("Failed to encode PNG");
      return exactArrayBuffer(data.byteArray);
    },
  };
  return {
    openDatabase: createJsBoxDatabase,
    files: jsBoxFileApi(),
    httpRequest: jsBoxHttpRequest,
    text: { encode: encodeText, decode: decodeText },
    clipboard: { read: getClipboardText, write: setClipboardText },
    ui: runtimeUi,
    images: runtimeImages,
  };
}

export const jsboxAdapter: RuntimeAdapterDefinition = {
  id: "jsbox",
  detect: () =>
    typeof $http !== "undefined" &&
    typeof $sqlite !== "undefined" &&
    typeof $file !== "undefined",
  create: createJsBoxAdapter,
};
