import { runtimeImages, RuntimeImageHandle } from "./platform";

function assertInteger(value: number, label: string): void {
  if (!Number.isInteger(value)) throw new Error(`${label} must be an integer`);
}

function assertBounds(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

class RuntimeImage {
  private handle: RuntimeImageHandle;

  constructor(handle: RuntimeImageHandle) {
    this.handle = handle;
  }

  copyRange(x: number, y: number, width: number, height: number): RuntimeImage {
    assertInteger(x, "x");
    assertInteger(y, "y");
    assertInteger(width, "width");
    assertInteger(height, "height");
    assertBounds(x >= 0 && y >= 0, "x and y must be non-negative");
    assertBounds(width > 0 && height > 0, "width and height must be positive");
    assertBounds(
      x + width <= this.width && y + height <= this.height,
      "copyRange exceeds image bounds",
    );
    return new RuntimeImage(
      runtimeImages.crop(this.handle, x, y, width, height),
    );
  }

  copyAndRotate90(): RuntimeImage {
    return new RuntimeImage(runtimeImages.rotate90(this.handle));
  }

  fillImageAt(x: number, y: number, image: RuntimeImage): void {
    assertInteger(x, "x");
    assertInteger(y, "y");
    assertBounds(x >= 0 && y >= 0, "x and y must be non-negative");
    assertBounds(
      image instanceof RuntimeImage,
      "image must be an instance of RuntimeImage",
    );
    assertBounds(
      x + image.width <= this.width && y + image.height <= this.height,
      "destination range exceeds image bounds",
    );
    this.handle = runtimeImages.fill(this.handle, x, y, image.handle);
  }

  fillImageRangeAt(
    x: number,
    y: number,
    image: RuntimeImage,
    srcX: number,
    srcY: number,
    width: number,
    height: number,
  ): void {
    for (const [value, label] of [
      [x, "x"],
      [y, "y"],
      [srcX, "srcX"],
      [srcY, "srcY"],
      [width, "width"],
      [height, "height"],
    ] as const) {
      assertInteger(value, label);
    }
    assertBounds(
      image instanceof RuntimeImage,
      "image must be an instance of RuntimeImage",
    );
    assertBounds(x >= 0 && y >= 0, "x and y must be non-negative");
    assertBounds(srcX >= 0 && srcY >= 0, "srcX and srcY must be non-negative");
    assertBounds(width > 0 && height > 0, "width and height must be positive");
    assertBounds(
      srcX + width <= image.width && srcY + height <= image.height,
      "source range exceeds image bounds",
    );
    assertBounds(
      x + width <= this.width && y + height <= this.height,
      "destination range exceeds image bounds",
    );
    const source = runtimeImages.crop(image.handle, srcX, srcY, width, height);
    this.handle = runtimeImages.fill(this.handle, x, y, source);
  }

  get width(): number {
    return this.handle.width;
  }

  get height(): number {
    return this.handle.height;
  }

  static empty(width: number, height: number): RuntimeImage {
    assertInteger(width, "width");
    assertInteger(height, "height");
    assertBounds(width > 0 && height > 0, "width and height must be positive");
    return new RuntimeImage(runtimeImages.empty(width, height));
  }

  async encodePng(): Promise<ArrayBuffer> {
    return runtimeImages.encodePng(this.handle);
  }
}

function createModifyImageFunction(
  script: string,
): (image: RuntimeImage) => RuntimeImage {
  const factory = new Function(
    "Image",
    `"use strict";\n${script}\nif (typeof modifyImage !== "function") { throw new Error("modifyImage is not defined"); }\nreturn modifyImage;`,
  ) as (ImageClass: typeof RuntimeImage) => unknown;
  const modify = factory(RuntimeImage);
  if (typeof modify !== "function")
    throw new Error("modifyImage script did not return a function");
  return (image: RuntimeImage) => {
    const result = (modify as (value: RuntimeImage) => unknown)(image);
    if (!(result instanceof RuntimeImage))
      throw new Error("modifyImage must return an Image");
    return result;
  };
}

/** 对齐 Venera 的 Image 脚本能力，双方统一接收和返回图片字节。 */
export async function modifyImage(
  data: ArrayBuffer | ArrayBufferView,
  script: string,
): Promise<ArrayBuffer> {
  const input = new RuntimeImage(await runtimeImages.decode(data));
  return createModifyImageFunction(script)(input).encodePng();
}
