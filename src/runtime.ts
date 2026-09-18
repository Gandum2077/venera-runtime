import { createUuid } from "./uuid";
import { logger } from "./logger";
import type {
  ComicDetailsShape,
  ComicShape,
  CommentShape,
  CookieRecord,
  ImageLoadingConfigShape,
  RuntimeGlobals,
  SettingsMap,
  VeneraConfigSource,
} from "./venera-types";
import { Convert } from "./convert";
import { UI } from "./ui";
import {
  HtmlDocumentWrapper,
  HtmlElementWrapper,
  HtmlNodeWrapper,
} from "./html-wrapper";
import { Network, veneraFetch } from "./network";
import { APP } from "./app";
import { configManager } from "./config";
import { getClipboardText, setClipboardText } from "./platform";

/** 运行时注入给配置文件的 `Comic` 类。 */
class Comic implements ComicShape {
  id: ComicShape["id"];
  title: string;
  cover: string;
  subtitle?: string;
  subTitle?: string;
  tags?: string[];
  description?: string;
  maxPage?: number;
  language?: string;
  favoriteId?: string;
  stars?: number;

  constructor(data: ComicShape = { id: "", title: "", cover: "" }) {
    this.id = data.id;
    this.title = data.title;
    this.cover = data.cover;
    this.subtitle = data.subtitle;
    this.subTitle = data.subTitle;
    this.tags = data.tags;
    this.description = data.description;
    this.maxPage = data.maxPage;
    this.language = data.language;
    this.favoriteId = data.favoriteId;
    this.stars = data.stars;
  }
}

/** 运行时注入给配置文件的 `ComicDetails` 类。 */
class ComicDetails implements ComicDetailsShape {
  title: string;
  cover: string;
  subtitle?: string;
  subTitle?: string;
  description?: string;
  tags?: ComicDetailsShape["tags"];
  chapters?: ComicDetailsShape["chapters"];
  isFavorite?: boolean | null;
  subId?: string;
  thumbnails?: string[] | null;
  recommend?: ComicShape[] | null;
  commentCount?: number;
  likesCount?: number;
  isLiked?: boolean;
  uploader?: string;
  updateTime?: string;
  uploadTime?: string;
  url?: string;
  stars?: number;
  maxPage?: number;
  comments?: CommentShape[] | null;

  constructor(data: ComicDetailsShape = { title: "", cover: "" }) {
    this.title = data.title;
    this.cover = data.cover;
    this.subtitle = data.subtitle ?? data.subTitle;
    this.subTitle = data.subTitle ?? data.subtitle;
    this.description = data.description;
    this.tags = data.tags;
    this.chapters = data.chapters;
    this.isFavorite = data.isFavorite;
    this.subId = data.subId;
    this.thumbnails = data.thumbnails;
    this.recommend = data.recommend;
    this.commentCount = data.commentCount;
    this.likesCount = data.likesCount;
    this.isLiked = data.isLiked;
    this.uploader = data.uploader;
    this.updateTime = data.updateTime;
    this.uploadTime = data.uploadTime;
    this.url = data.url;
    this.stars = data.stars;
    this.maxPage = data.maxPage;
    this.comments = data.comments;
  }
}

/** 运行时注入给配置文件的 `Comment` 类。 */
class Comment implements CommentShape {
  userName: string;
  content: string;
  avatar?: string;
  time?: string;
  replyCount?: number;
  id?: string;
  score?: number;
  isLiked?: boolean;
  voteStatus?: number;

  constructor(data: CommentShape = { userName: "", content: "" }) {
    this.userName = data.userName;
    this.content = data.content;
    this.avatar = data.avatar;
    this.time = data.time;
    this.replyCount = data.replyCount;
    this.id = data.id;
    this.score = data.score;
    this.isLiked = data.isLiked;
    this.voteStatus = data.voteStatus;
  }
}

/** 运行时注入给配置文件的 `ImageLoadingConfig` 类。 */
class ImageLoadingConfig implements ImageLoadingConfigShape {
  url?: string;
  method?: string;
  data?: unknown;
  headers?: Record<string, string>;
  onResponse?: ((data: ArrayBuffer) => ArrayBuffer) | null;
  modifyImage?: string;
  onLoadFailed?: (() => ImageLoadingConfigShape) | null;

  constructor(data: ImageLoadingConfigShape = {}) {
    this.url = data.url;
    this.method = data.method;
    this.data = data.data;
    this.headers = data.headers;
    this.onResponse = data.onResponse;
    this.modifyImage = data.modifyImage;
    this.onLoadFailed = data.onLoadFailed;
  }
}

export function createVeneraRuntime() {
  /**
   * 每次切换配置源时，`app.ts` 都会调用这里创建一套新的运行时。
   *
   * 这套运行时会被注入到配置文件里，成为配置文件眼中的“全局环境”。
   */

  function log(
    level: "info" | "warning" | "error",
    title: string,
    content?: unknown,
  ): void {
    logger.log(level, title, content);
  }

  const runtimeConsole = {
    log(content: unknown): void {
      log("info", "JS Console", content);
    },
    warn(content: unknown): void {
      log("warning", "JS Console", content);
    },
    error(content: unknown): void {
      log("error", "JS Console", content);
    },
  };

  class ComicSource implements VeneraConfigSource {
    // 这是所有配置源类继承的基类。
    static sources: Record<string, VeneraConfigSource> = {};

    name = "";
    key = "";
    version = "";
    minAppVersion?: string;
    url?: string;
    translation?: Record<string, Record<string, string>> = {};
    init?: () => Promise<void> | void;
    account?: VeneraConfigSource["account"];
    explore?: VeneraConfigSource["explore"];
    category?: VeneraConfigSource["category"];
    categoryComics?: VeneraConfigSource["categoryComics"];
    favorites?: VeneraConfigSource["favorites"];
    search?: VeneraConfigSource["search"];
    comic?: VeneraConfigSource["comic"];
    settings?: SettingsMap;

    loadSetting<T = unknown>(settingKey: string): T | undefined {
      let setting = configManager.getSetting(this.key, settingKey);
      if (setting === undefined) {
        setting = this.settings?.[settingKey]?.default;
      }
      return setting as T | undefined;
    }

    loadData<T = unknown>(dataKey: string): T | undefined {
      return configManager.getData(this.key, dataKey) as T | undefined;
    }

    saveData<T = unknown>(dataKey: string, data: T): void {
      configManager.setData(this.key, dataKey, data);
    }

    deleteData(dataKey: string): void {
      configManager.deleteData(this.key, dataKey);
    }

    get isLogged(): boolean {
      return this.loadData("account") != null;
    }

    translate(key: string): string {
      if (!this.translation) return key;
      const part = this.translation?.[APP.locale];
      if (part) {
        return part?.[key] ?? key;
      } else {
        // 模糊匹配：
        // 比较APP.locale和this.translation中的键值
        // 首先忽略大小写的差异、`-`和`_`的差异
        // 其次只取分隔符前面的字母进行比较
        const normalizedLocale = APP.locale
          .toLocaleLowerCase()
          .replaceAll("-", "_");
        const keys = Object.keys(this.translation);
        const normalizedKeys = keys.map((n) =>
          n.toLocaleLowerCase().replaceAll("-", "_"),
        );
        const index = normalizedKeys.findIndex((n) => n === normalizedLocale);
        if (index !== -1) {
          const part = this.translation[keys[index]];
          return part?.[key] ?? key;
        } else {
          const normalizedLocale2 = normalizedLocale.split("_")[0];
          const index2 = normalizedKeys
            .map((n) => n.split("_")[0])
            .findIndex((n) => n === normalizedLocale2);
          const part2 = this.translation[keys[index2]];
          return part2?.[key] ?? key;
        }
      }
    }
  }

  async function setClipboard(text: string): Promise<void> {
    await setClipboardText(text);
  }

  async function getClipboard(): Promise<string> {
    return getClipboardText();
  }

  async function compute<T = unknown>(
    func: string,
    ...args: unknown[]
  ): Promise<T> {
    // 某些配置会把一段函数源码字符串交给运行时执行，这里做最简兼容。
    // eslint-disable-next-line no-new-func -- compute implements Venera trusted function-source execution.
    const runner = new Function(`return (${func});`)() as (
      ...input: unknown[]
    ) => T;
    return runner(...args);
  }

  class CookieClass implements CookieRecord {
    // 这个类只是为了兼容配置脚本里 `new Cookie(...)` 的写法。
    name: string;
    value: string;
    domain?: string;
    path?: string;
    expires?: string | null;
    secure?: boolean;
    httpOnly?: boolean;
    hostOnly?: boolean;
    maxAge?: number | null;

    constructor(data: CookieRecord) {
      this.name = data.name;
      this.value = data.value;
      this.domain = data.domain;
      this.path = data.path;
      this.expires = data.expires;
      this.secure = data.secure;
      this.httpOnly = data.httpOnly;
      this.hostOnly = data.hostOnly;
      this.maxAge = data.maxAge;
    }
  }

  const globals = {
    // 这些对象会作为参数注入到配置脚本里。
    // setTimeout,  // 环境中有全局的 setInterval，可兼容，但是 Venera 中可传入参数仅限(callback, delay)，也没有返回值。
    Convert,
    createUuid,
    randomInt: (min = 0, max = 1) =>
      Math.floor(min + Math.random() * (max - min)),
    randomDouble: (min = 0, max = 1) => min + Math.random() * (max - min),
    // _Timer,  // 内部类
    // setInterval,  // 环境中有全局的 setInterval，可兼容，但是 Venera 中可传入参数仅限(callback, delay)，也没有返回值。
    Cookie: CookieClass,
    Network,
    fetch: veneraFetch,
    HtmlDocument: HtmlDocumentWrapper,
    HtmlElement: HtmlElementWrapper,
    HtmlNode: HtmlNodeWrapper,
    log,
    console: runtimeConsole,
    Comic,
    ComicDetails,
    Comment,
    ImageLoadingConfig, // 为了兼容老版本，这个类不允许被直接创建，只能创建同属性的对象(当前版本: 1.6.3)
    ComicSource,
    // Image,  // The api can only be used in the comic.onImageLoad.modifyImage function.
    UI,
    APP,
    getClipboard,
    setClipboard,
    compute,
  };

  return globals as unknown as RuntimeGlobals;
}
