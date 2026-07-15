/**
 * 这个文件实现了“图片解扰/二次处理运行时”。
 *
 * 某些配置源（例如 `jm.js`）会在 `comic.onImageLoad()` 里返回：
 * - 自定义请求头
 * - 或者 `modifyImage` 脚本
 *
 * 原版 Venera 会把图片读到内存里，再交给一个自定义 `Image` 类处理。
 * 这里做了同样的事。
 */
function assertInteger(value: number, label: string): void {
  if (!Number.isInteger(value)) {
    throw new Error(`${label} must be an integer`);
  }
}

function assertBounds(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

class RuntimeImage {
  key: number = 0;
  _uiimage: UIImage;

  constructor(
    key: number,
    options?: {
      size?: JBSize;
      image?: UIImage;
    },
  ) {
    this.key = key;
    this._uiimage = options?.image
      ? options.image
      : $imagekit.render({ size: $size(options?.size?.width ?? 100, options?.size?.height ?? 100) }, () => {});
  }

  copyRange(x: number, y: number, width: number, height: number) {
    assertInteger(x, "x");
    assertInteger(y, "y");
    assertInteger(width, "width");
    assertInteger(height, "height");
    assertBounds(x >= 0 && y >= 0, "x and y must be non-negative");
    assertBounds(width > 0 && height > 0, "width and height must be positive");
    assertBounds(x + width <= this.width && y + height <= this.height, "copyRange exceeds image bounds");
    if (x === 0 && y === 0) {
      const s1 = $imagekit.cropTo(this._uiimage, $size(width, height), 0);
      return new RuntimeImage(0, { image: s1 });
    } else {
      const s1 = $imagekit.cropTo(this._uiimage, $size(width + x, height + y), 0);
      const s2 = $imagekit.cropTo(s1, $size(width, height), 5);
      return new RuntimeImage(0, { image: s2 });
    }
  }

  copyAndRotate90() {
    return new RuntimeImage(0, { image: $imagekit.rotate(this._uiimage, -Math.PI * 0.5) });
  }

  fillImageAt(x: number, y: number, image: RuntimeImage) {
    assertInteger(x, "x");
    assertInteger(y, "y");
    assertBounds(x >= 0 && y >= 0, "x and y must be non-negative");
    assertBounds(image instanceof RuntimeImage, "image must be an instance of RuntimeImage");
    this._uiimage = $imagekit.combine(this._uiimage, image._uiimage, $point(x, y));
  }

  fillImageRangeAt(
    x: number,
    y: number,
    image: RuntimeImage,
    srcX: number,
    srcY: number,
    width: number,
    height: number,
  ) {
    assertInteger(x, "x");
    assertInteger(y, "y");
    assertInteger(srcX, "srcX");
    assertInteger(srcY, "srcY");
    assertInteger(width, "width");
    assertInteger(height, "height");
    assertBounds(x >= 0 && y >= 0, "x and y must be non-negative");
    assertBounds(srcX >= 0 && srcY >= 0, "srcX and srcY must be non-negative");
    assertBounds(width > 0 && height > 0, "width and height must be positive");
    assertBounds(srcX + width <= image.width && srcY + height <= image.height, "source range exceeds image bounds");
    assertBounds(x + width <= this.width && y + height <= this.height, "destination range exceeds image bounds");
    if (x === 0 && y === 0) {
      const s1 = $imagekit.cropTo(image._uiimage, $size(width, height), 0);
      this._uiimage = $imagekit.combine(this._uiimage, s1, $point(x, y));
    } else {
      const s1 = $imagekit.cropTo(image._uiimage, $size(width + srcX, height + srcY), 0);
      const s2 = $imagekit.cropTo(s1, $size(width, height), 5);
      this._uiimage = $imagekit.combine(this._uiimage, s2, $point(x, y));
    }
  }

  get width(): number {
    return this._uiimage.size.width;
  }

  get height(): number {
    return this._uiimage.size.height;
  }

  static empty(width: number, height: number): RuntimeImage {
    assertInteger(width, "width");
    assertInteger(height, "height");
    assertBounds(width > 0 && height > 0, "width and height must be positive");
    return new RuntimeImage(0, {
      size: $size(width, height),
    });
  }
}

function createModifyImageFunction(script: string): (image: RuntimeImage) => RuntimeImage {
  /**
   * 这里动态执行配置里给出的 `modifyImage` 脚本。
   *
   * 注意：脚本里访问到的 `Image` 是 `RuntimeImage` 类，这与 Venera 原项目的约定一致。
   */
  const factory = new Function(
    "Image",
    `"use strict";\n${script}\nif (typeof modifyImage !== "function") { throw new Error("modifyImage is not defined"); }\nreturn modifyImage;`,
  ) as (ImageClass: typeof RuntimeImage) => unknown;

  const modifyImage = factory(RuntimeImage);
  if (typeof modifyImage !== "function") {
    throw new Error("modifyImage script did not return a function");
  }

  return (image: RuntimeImage) => {
    const result = (modifyImage as (value: RuntimeImage) => unknown)(image);
    if (!(result instanceof RuntimeImage)) {
      throw new Error("modifyImage must return an Image");
    }
    return result;
  };
}

export function modifyImage(data: NSData, script: string) {
  const image = new RuntimeImage(0, { image: data.image });
  const modifyImage = createModifyImageFunction(script);
  const modified = modifyImage(image);
  return modified._uiimage.png;
}
