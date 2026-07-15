import { Base, DialogSheet, Image, Input, Label, searchBarBgcolor } from "jsbox-cview";
import { ArrayBufferLikeInput, toUint8Array } from "./tools";

class LazyImage extends Base<UIView, UiTypes.ViewOptions> {
  private _url: string;
  _defineView: () => UiTypes.ViewOptions;
  constructor(url: string) {
    super();
    this._url = url;
    this._defineView = () => ({
      type: "view",
      props: {
        id: this.id,
      },
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
            id: this.id + "-image",
            contentMode: $contentMode.scaleAspectFit,
            bgcolor: $color("clear"),
          },
          layout: $layout.fill,
        },
        {
          type: "label",
          props: {
            id: this.id + "-loadingLabel",
            text: "图片正在加载...",
            textColor: $color("secondaryText"),
            font: $font(13),
          },
          layout: (make, view) => {
            make.center.equalTo(view.super);
          },
        },
      ],
      events: {
        ready: () => {
          this.load();
        },
      },
    });
  }

  async load() {
    const resp = await $http.get(this._url);
    if (resp.error || resp.response.statusCode >= 300 || !resp.rawData.image) {
      ($(this.id + "-loadingLabel") as UILabelView).text = "图片加载失败";
    } else {
      const img = resp.rawData.image;
      const imageView = $(this.id + "-image") as UIImageView;
      imageView.image = img;
      $(this.id + "-loadingLabel").hidden = true;
      const height = Math.min(img.size.height, 300);
      this.view.updateLayout((make) => {
        make.height.equalTo(height);
      });
    }
  }
}

class InputView extends Base<UIView, UiTypes.ViewOptions> {
  _defineView: () => UiTypes.ViewOptions;
  cviews: { imageView?: Image; lazyImageView?: LazyImage; input: Input; errorLabel: Label };
  constructor(url?: string, image?: UIImage) {
    super();
    this.cviews = {} as { imageView?: Image; lazyImageView?: LazyImage; input: Input; errorLabel: Label };
    const views: UiTypes.AllViewOptions[] = [];
    const hasImage = !!url || !!image;
    this.cviews.input = new Input({
      props: {
        bgcolor: searchBarBgcolor,
        font: $font(17),
        textColor: $color("primaryText"),
        align: $align.left,
        placeholder: "请输入",
      },
      layout: (make, view) => {
        if (hasImage) {
          make.top.equalTo(view.prev.bottom).inset(15);
        } else {
          make.top.inset(30);
        }
        make.left.right.inset(25);
        make.height.equalTo(44);
      },
      events: {
        changed: () => {
          this.errorText = "";
        },
      },
    });
    this.cviews.errorLabel = new Label({
      props: {
        textColor: $color({ light: "#D14343", dark: "#FF8B8B" }),
        font: $font(13),
      },
      layout: (make, view) => {
        make.left.right.equalTo(view.prev);
        make.top.equalTo(view.prev.bottom).inset(5);
      },
    });
    views.push(this.cviews.input.definition, this.cviews.errorLabel.definition);
    if (image) {
      const height = Math.min(image.size.height, 300);
      this.cviews.imageView = new Image({
        props: {
          image: image,
        },
        layout: (make, view) => {
          make.top.inset(15);
          make.centerX.equalTo(view.super);
          make.height.equalTo(height);
          make.left.right.inset(25);
        },
      });
      views.unshift(this.cviews.imageView.definition);
    } else if (url) {
      this.cviews.lazyImageView = new LazyImage(url);
      views.unshift(this.cviews.lazyImageView.definition);
    }

    this._defineView = () => {
      return {
        type: "view",
        props: {
          id: this.id,
        },
        layout: $layout.fill,
        views,
      };
    };
  }

  get text() {
    return this.cviews.input.view.text;
  }

  set errorText(value: string) {
    this.cviews.errorLabel.view.text = value;
  }
}

function dialog(
  title: string,
  validator?: (value: string) => string | null,
  image?: string | ArrayBufferLikeInput,
): Promise<string> {
  let url: string | undefined = undefined;
  let img: UIImage | undefined = undefined;
  if (typeof image === "string") {
    url = image;
  } else if (image) {
    try {
      const data = toUint8Array(image);
      img = $data({ byteArray: data }).image;
      if (!img) {
        throw new Error("无效的图片数据");
      }
    } catch (e) {
      throw e instanceof Error ? e : new Error("无效的图片数据");
    }
  }
  const cview = new InputView(url, img);
  return new Promise((resolve, reject) => {
    const dialog = new DialogSheet({
      title,
      cview,
      bgcolor: $color("primarySurface"),
      doneButtonValidator: () => {
        if (!validator) return true;
        const r = validator(cview.text);
        cview.errorText = r || "";
        return !r;
      },
      doneHandler: () => {
        return cview.text;
      },
    });
    dialog.promisify(resolve, reject);
  });
}

export async function showInputDialog(
  title: string,
  validator?: (value: string) => string | null,
  image?: string | ArrayBufferLikeInput | null,
): Promise<string | null> {
  try {
    const result = await dialog(title, validator, image || undefined);
    return result;
  } catch (e) {
    if (e === "cancel") {
      return null;
    }
    throw e;
  }
}
