/**
 * 这个文件集中定义了“兼容版 Venera 运行时”使用到的全部核心类型。
 *
 * 设计目标有两个：
 * 1. 尽量沿用 Venera 原项目里的命名，让两个项目在概念上保持一致。
 * 2. 把配置文件需要暴露的数据结构，明确地映射成 TypeScript 类型。
 *
 * 这是整个项目的“契约层”：
 * - 配置文件应该返回什么
 * - 运行时会提供什么
 * - 页面状态会消费什么
 *
 */
export type EntityId = string | number;

/** 某些配置既可能同步返回结果，也可能返回 Promise，所以统一用这个工具类型表示。 */
export type MaybePromise<T> = T | Promise<T>;

/** 标签通常是“命名空间 -> 标签数组”的结构，例如 `artist -> ["xxx"]`。 */
export type TagsRecord = Map<string, string[]> | Record<string, string[]>;

/** 章节最简单的形式：`章节 id -> 章节标题`。 */
export type ComicChapterMap = Map<string, string> | Record<string, string>;

/**
 * 漫画章节的完整形态：
 * - 既可能是简单的一层 map
 * - 也可能是“分组标题 -> 章节 map”的二层结构
 */
export type ComicChapters = ComicChapterMap | Map<string, ComicChapterMap> | Record<string, Record<string, string>>;

/** 页面跳转目标的标准结构。 */
export interface PageJumpTarget {
  page: string;
  attributes?: Record<string, unknown> | null;
}

/**
 * 实际配置文件里，跳转目标可能写成好几种形式：
 * - 标准对象
 * - 简写字符串
 * - 带 action/keyword/param 的旧格式对象
 */
export type PageJumpTargetLike =
  | PageJumpTarget
  | string
  | {
      action?: string;
      page?: string;
      keyword?: string;
      param?: string | null;
      attributes?: Record<string, unknown> | null;
    };

/** Cookie 的最小描述结构。 */
export interface CookieRecord {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: string | null;
  secure?: boolean;
  httpOnly?: boolean;
}

/** 网络请求统一返回结构。 */
export interface NetworkResponse<TBody> {
  status: number;
  headers: Record<string, string>;
  body: TBody;
}

/** 用来兼容配置文件中 `fetch()` 返回值的简化版响应对象。 */
export interface FetchCompatResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
  json(): Promise<unknown>;
}

/** 漫画列表卡片使用的基础数据结构。 */
export interface ComicShape {
  id: EntityId;
  title: string;
  subtitle?: string;
  subTitle?: string;
  cover: string;
  tags?: string[];
  description?: string;
  maxPage?: number;
  language?: string;
  favoriteId?: string;
  stars?: number;
}

/** 评论列表使用的数据结构。 */
export interface CommentShape {
  userName: string;
  avatar?: string;
  content: string;
  time?: string;
  replyCount?: number;
  id?: string;
  score?: number;
  isLiked?: boolean;
  voteStatus?: number;
}

/** 漫画详情页所需的完整数据结构。 */
export interface ComicDetailsShape {
  title: string;
  subtitle?: string;
  subTitle?: string;
  cover: string;
  description?: string;
  tags?: TagsRecord | null;
  chapters?: ComicChapters | null;
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
}

/**
 * `comic.onImageLoad()` / `comic.onThumbnailLoad()` 的返回值。
 *
 * 它既能修改最终请求地址和请求头，也能通过 `modifyImage`
 * 把一段图片处理脚本传回阅读器执行。
 */
export interface ImageLoadingConfigShape {
  url?: string;
  method?: string;
  data?: BodyInit | null;
  headers?: Record<string, string>;
  onResponse?: ((data: ArrayBuffer) => ArrayBuffer) | null;
  modifyImage?: string;
  onLoadFailed?: (() => ImageLoadingConfigShape) | null;
}

/** 打包下载时可能会出现的归档信息。 */
export interface ArchiveInfo {
  title: string;
  description: string;
  id: string;
}

/** 通过网页登录的配置。 */
export interface AccountLoginWithWebview {
  url: string;
  checkStatus(url: string, title: string): boolean;
  onLoginSuccess?: () => MaybePromise<void>;
}

/** 通过 Cookie 字段登录的配置。 */
export interface AccountLoginWithCookies {
  fields: string[];
  validate(values: string[]): Promise<boolean>;
}

/** 一个配置源的登录能力。 */
export interface AccountConfig {
  login?: (account: string, pwd: string) => MaybePromise<unknown>;
  loginWithWebview?: AccountLoginWithWebview;
  loginWithCookies?: AccountLoginWithCookies;
  logout?: () => void;
  registerWebsite?: string | null;
}

/** 发现页中的一个分块，例如“热门更新”“本周推荐”。 */
export interface ExplorePagePart {
  title: string;
  comics: ComicShape[];
  viewMore?: PageJumpTargetLike | null;
}

/** `explore` 页支持的几种返回模式。 */
export type ExplorePageType = "singlePageWithMultiPart" | "multiPartPage" | "multiPageComicList" | "mixed" | "override";

/** 普通分页漫画列表。 */
export interface ExploreComicListResult {
  comics: ComicShape[];
  maxPage?: number;
  next?: string | null;
}

/** 混合结果：既可能有纯数组，也可能有带标题的分块。 */
export interface ExploreMixedResult {
  data: Array<ComicShape[] | ExplorePagePart>;
  maxPage?: number;
}

export type ExploreMultiPartResult = ExplorePagePart[] | Record<string, ComicShape[]>;

/** 发现页加载函数可能返回的所有结果类型。 */
export type ExploreLoadResult = ExploreMultiPartResult | ExploreComicListResult | ExploreMixedResult;

/** 单个 discover/explore 页面定义。 */
export interface ExplorePageData {
  title: string;
  type: ExplorePageType;
  load?: (page: number | null) => Promise<ExploreLoadResult>;
  loadNext?: (next: string | null) => Promise<{ comics: ComicShape[]; next?: string | null }>;
}

/** 搜索页选项支持的三种表现形式。 */
export type SearchOptionType = "select" | "multi-select" | "dropdown";

/** 一个搜索筛选项。 */
export interface SearchOptions {
  type?: SearchOptionType;
  options: string[];
  label?: string;
  default?: string | string[] | null;
}

/** 搜索页返回值。 */
export interface SearchPageResult {
  comics: ComicShape[];
  maxPage?: number;
}

/** 搜索页能力定义。 */
export interface SearchPageData {
  load?: (keyword: string, options: string[], page: number) => Promise<SearchPageResult>;
  loadNext?: (
    keyword: string,
    options: string[],
    next: string | null,
  ) => Promise<{ comics: ComicShape[]; next?: string | null }>;
  optionList?: SearchOptions[];
  enableTagsSuggestions?: boolean;
  onTagSuggestionSelected?: (namespace: string, tag: string) => string;
}

/** 分类页里一个可点击项目。 */
export interface CategoryPartItem {
  label: string;
  target: PageJumpTargetLike;
}

/** 分类分组支持固定、随机、动态三种来源。 */
export type CategoryPartType = "fixed" | "random" | "dynamic";

/** 分类页中的一个分组定义。 */
export interface CategoryPart {
  name: string;
  type: CategoryPartType;
  categories?: Array<string | CategoryPartItem>;
  itemType?: string;
  categoryParams?: Array<string | null>;
  groupParam?: string | null;
  randomNumber?: number;
  loader?: () => MaybePromise<CategoryPartItem[]>;
}

/** 分类页顶部可以额外放一些动作按钮。 */
export interface CategoryButton {
  label: string;
  onTap?: () => MaybePromise<void>;
}

/** 分类页整体定义。 */
export interface CategoryData {
  title: string;
  parts: CategoryPart[];
  enableRankingPage?: boolean;
  buttons?: CategoryButton[];
}

/** 分类结果页的筛选项。 */
export interface CategoryComicsOptions {
  options: string[];
  label?: string;
  notShowWhen?: string[] | null;
  showWhen?: string[] | null;
}

/** 排行页能力。 */
export interface RankingData {
  options: string[];
  load?: (option: string, page: number) => Promise<SearchPageResult>;
  loadNext?: (option: string, next: string | null) => Promise<{ comics: ComicShape[]; next?: string | null }>;
}

/** “分类 -> 漫画列表”的加载能力。 */
export interface CategoryComicsData {
  load(category: string, param: string | null | undefined, options: string[], page: number): Promise<SearchPageResult>;
  optionList?: CategoryComicsOptions[];
  optionLoader?: (category: string, param: string | null | undefined) => Promise<CategoryComicsOptions[]>;
  ranking?: RankingData;
}

/** 把站外链接解析回漫画 id 的能力。 */
export interface LinkHandler {
  domains: string[];
  linkToId(url: string): string | null;
}

/** 某些源支持打包下载归档。当前项目暂未完整实现，但保留类型映射。 */
export interface ArchiveDownloader {
  getArchives(cid: string): Promise<ArchiveInfo[]>;
  getDownloadUrl(cid: string, aid: string): Promise<string>;
}

/** 阅读器正文图片列表。 */
export interface ComicImageListResult {
  images: string[];
}

/** 详情页缩略图分页结果。 */
export interface ComicThumbnailListResult {
  thumbnails: string[];
  next?: string | null;
}

/** 收藏夹列表及当前漫画已收藏到哪些夹。 */
export interface FavoriteFoldersResult {
  folders: Record<string, string>;
  favorited?: string[];
}

/** 评论分页结果。 */
export interface CommentPageResult {
  comments: CommentShape[];
  maxPage?: number;
}

/** 网络收藏能力定义。 */
export interface FavoritesSection {
  multiFolder: boolean;
  loadComics?: (page: number, folder?: string | null) => Promise<SearchPageResult>;
  loadNext?: (next: string | null, folder?: string | null) => Promise<{ comics: ComicShape[]; next?: string | null }>;
  loadFolders?: (comicId?: string | null) => Promise<FavoriteFoldersResult>;
  addFolder?: (name: string) => MaybePromise<unknown>;
  deleteFolder?: (folderId: string) => MaybePromise<unknown>;
  addOrDelFavorite?: (
    comicId: string,
    folderId: string,
    isAdding: boolean,
    favoriteId?: string | null,
  ) => MaybePromise<unknown>;
  singleFolderForSingleComic?: boolean;
  isOldToNewSort?: boolean | null;
  allFavoritesId?: string | null;
}

/** 设置项的可选项。 */
export interface SettingOption {
  value: string;
  text?: string;
}

/** 所有设置项共有的最小结构。 */
export interface SettingBaseDefinition {
  title: string;
  default?: string | boolean | null;
}

/** 下拉选择型设置。 */
export interface SettingSelectDefinition extends SettingBaseDefinition {
  type: "select";
  options: SettingOption[];
  default?: string;
}

/** 开关型设置。 */
export interface SettingSwitchDefinition extends SettingBaseDefinition {
  type: "switch";
  default?: boolean;
}

/** 文本输入型设置。 */
export interface SettingInputDefinition extends SettingBaseDefinition {
  type: "input";
  validator?: string | null;
  default?: string;
}

/** 点击按钮后执行回调的设置。 */
export interface SettingCallbackDefinition extends SettingBaseDefinition {
  type: "callback";
  buttonText?: string;
  callback: () => MaybePromise<void>;
}

/** 设置项联合类型。 */
export type SettingDefinition =
  | SettingSelectDefinition
  | SettingSwitchDefinition
  | SettingInputDefinition
  | SettingCallbackDefinition;

export type SettingsMap = Record<string, SettingDefinition>;

/** `venera-configs/index.json` 中的配置文件元信息。 */
export interface ConfigIndexEntry {
  name: string;
  fileName: string;
  key: string;
  version: string;
  description?: string;
}

/**
 * 详情页相关能力集合。
 *
 * 在应用里，漫画详情、阅读器、评论、缩略图、标签跳转等行为，
 * 基本都依赖这个接口。
 */
export interface ComicSection {
  loadInfo(id: string): Promise<ComicDetailsShape>;
  loadEp(comicId: string, epId?: string | null): Promise<ComicImageListResult>;
  loadComments?: (
    comicId: string,
    subId?: string | null,
    page?: number,
    replyTo?: string | null,
  ) => Promise<CommentPageResult>;
  sendComment?: (
    comicId: string,
    subId: string | null | undefined,
    content: string,
    replyTo?: string | null,
  ) => MaybePromise<unknown>;
  loadChapterComments?: (
    comicId: string,
    epId: string,
    page?: number,
    replyTo?: string | null,
  ) => Promise<CommentPageResult>;
  sendChapterComment?: (
    comicId: string,
    epId: string,
    content: string,
    replyTo?: string | null,
  ) => MaybePromise<unknown>;
  voteComment?: (
    comicId: string,
    subId: string | null | undefined,
    commentId: string,
    isUp: boolean,
    isCancel: boolean,
  ) => MaybePromise<number | null | undefined>;
  likeComment?: (
    comicId: string,
    subId: string | null | undefined,
    commentId: string,
    isLiking: boolean,
  ) => MaybePromise<number | null | undefined>;
  loadThumbnails?: (comicId: string, next?: string | null) => Promise<ComicThumbnailListResult>;
  onImageLoad?: (url: string, comicId: string, epId?: string | null) => MaybePromise<ImageLoadingConfigShape>;
  onThumbnailLoad?: (url: string) => MaybePromise<ImageLoadingConfigShape>;
  onClickTag?: (namespace: string, tag: string) => PageJumpTargetLike;
  link?: LinkHandler;
  enableTagsTranslate?: boolean;
}

/**
 * 一个完整的配置源实例。
 *
 * 配置文件最终 `new` 出来的就是这个对象。
 * 页面切换、搜索、阅读、设置、登录、收藏，都会围绕它展开。
 */
export interface VeneraConfigSource {
  name: string;
  key: string;
  version: string;
  minAppVersion?: string;
  url?: string;
  translation?: Record<string, Record<string, string>>;
  init?(): MaybePromise<void>;
  account?: AccountConfig;
  explore?: ExplorePageData[];
  category?: CategoryData;
  categoryComics?: CategoryComicsData;
  favorites?: FavoritesSection;
  search?: SearchPageData;
  comic?: ComicSection;
  settings?: SettingsMap;
  loadData<T = unknown>(dataKey: string): T | undefined;
  loadSetting<T = unknown>(settingKey: string): T | undefined;
  saveData<T = unknown>(dataKey: string, data: T): void;
  deleteData(dataKey: string): void;
  readonly isLogged: boolean;
  translate(key: string): string;
}

/** 运行时注入给配置文件的 APP 信息。 */
export interface AppRuntimeInfo {
  readonly version: string;
  readonly locale: string;
  readonly platform: string;
}

/**
 * 编码/解码/哈希/加密工具集合。
 *
 * 这是对 Venera 原项目里 `Convert` 能力的 TypeScript 映射。
 */
export interface ConvertApi {
  encodeUtf8(value: string): ArrayBuffer;
  decodeUtf8(value: ArrayBuffer | ArrayBufferView): string;
  encodeBase64(value: ArrayBuffer | ArrayBufferView): string;
  decodeBase64(value: string): ArrayBuffer;
  sha256(value: ArrayBuffer | ArrayBufferView): ArrayBuffer;
  sha1(value: ArrayBuffer | ArrayBufferView): ArrayBuffer;
  sha512(value: ArrayBuffer | ArrayBufferView): ArrayBuffer;
  md5(value: ArrayBuffer | ArrayBufferView): ArrayBuffer;
  hmac(key: ArrayBuffer | ArrayBufferView, value: ArrayBuffer | ArrayBufferView, hash: string): ArrayBuffer;
  hmacString(key: ArrayBuffer | ArrayBufferView, value: ArrayBuffer | ArrayBufferView, hash: string): string;
  encodeGbk(value: string): ArrayBuffer;
  decodeGbk(value: ArrayBuffer | ArrayBufferView): string;
  encryptAesEcb(value: ArrayBuffer | ArrayBufferView, key: ArrayBuffer | ArrayBufferView): ArrayBuffer;
  decryptAesEcb(value: ArrayBuffer | ArrayBufferView, key: ArrayBuffer | ArrayBufferView): ArrayBuffer;
  encryptAesCbc(
    value: ArrayBuffer | ArrayBufferView,
    key: ArrayBuffer | ArrayBufferView,
    iv: ArrayBuffer | ArrayBufferView,
  ): ArrayBuffer;
  decryptAesCbc(
    value: ArrayBuffer | ArrayBufferView,
    key: ArrayBuffer | ArrayBufferView,
    iv: ArrayBuffer | ArrayBufferView,
  ): ArrayBuffer;
  encryptAesCfb(
    value: ArrayBuffer | ArrayBufferView,
    key: ArrayBuffer | ArrayBufferView,
    iv: ArrayBuffer | ArrayBufferView,
    blockSize: number,
  ): ArrayBuffer;
  decryptAesCfb(
    value: ArrayBuffer | ArrayBufferView,
    key: ArrayBuffer | ArrayBufferView,
    iv: ArrayBuffer | ArrayBufferView,
    blockSize: number,
  ): ArrayBuffer;
  encryptAesOfb(
    value: ArrayBuffer | ArrayBufferView,
    key: ArrayBuffer | ArrayBufferView,
    blockSize: number,
  ): ArrayBuffer;
  decryptAesOfb(
    value: ArrayBuffer | ArrayBufferView,
    key: ArrayBuffer | ArrayBufferView,
    blockSize: number,
  ): ArrayBuffer;
  decryptRsa(value: ArrayBuffer | ArrayBufferView, key: string): ArrayBuffer;
  hexEncode(value: ArrayBuffer | ArrayBufferView): string;
}

export interface NetworkApi {
  fetchBytes(
    method: string,
    url: string,
    headers?: Record<string, string>,
    data?: unknown,
    extra?: Record<string, unknown>,
  ): Promise<NetworkResponse<ArrayBuffer>>;
  sendRequest(
    method: string,
    url: string,
    headers?: Record<string, string>,
    data?: unknown,
    extra?: Record<string, unknown>,
  ): Promise<NetworkResponse<string>>;
  get(url: string, headers?: Record<string, string>, extra?: Record<string, unknown>): Promise<NetworkResponse<string>>;
  post(
    url: string,
    headers?: Record<string, string>,
    data?: unknown,
    extra?: Record<string, unknown>,
  ): Promise<NetworkResponse<string>>;
  put(
    url: string,
    headers?: Record<string, string>,
    data?: unknown,
    extra?: Record<string, unknown>,
  ): Promise<NetworkResponse<string>>;
  patch(
    url: string,
    headers?: Record<string, string>,
    data?: unknown,
    extra?: Record<string, unknown>,
  ): Promise<NetworkResponse<string>>;
  delete(
    url: string,
    headers?: Record<string, string>,
    extra?: Record<string, unknown>,
  ): Promise<NetworkResponse<string>>;
  setCookies(url: string, cookies: CookieRecord[]): void;
  getCookies(url: string): CookieRecord[];
  deleteCookies(url: string): void;
}

export interface UIApi {
  showMessage(message: string): void;
  showDialog(
    title: string,
    content: string,
    actions: { text: string; callback: () => void | Promise<void>; style?: "text" | "filled" | "danger" }[],
  ): void;
  launchUrl(url: string): void;
  showLoading(onCancel?: (() => void) | null): number;
  cancelLoading(id: number): void;
  showInputDialog(
    title: string,
    validator?: (value: string) => string | null,
    image?: string | ArrayBuffer | null,
  ): Promise<string | null>;
  showSelectDialog(title: string, options: string[], initialIndex?: number | null): Promise<number | null>;
}

/** 注入给配置文件的 console。 */
export interface RuntimeConsoleApi {
  log(content: unknown): void;
  warn(content: unknown): void;
  error(content: unknown): void;
}

/**
 * 执行配置脚本时注入到 `new Function(...)` 里的所有全局对象。
 *
 * 也就是说，配置文件里看到的这些名字，实际上都来自这里。
 */
export interface RuntimeGlobals {
  APP: AppRuntimeInfo;
  Comic: new (data?: ComicShape) => ComicShape;
  ComicDetails: new (data?: ComicDetailsShape) => ComicDetailsShape;
  ComicSource: new () => VeneraConfigSource;
  Comment: new (data?: CommentShape) => CommentShape;
  Convert: ConvertApi;
  Cookie: new (data: CookieRecord) => CookieRecord;
  HtmlDocument: new (html: string) => unknown;
  HtmlElement: new (...args: unknown[]) => unknown;
  HtmlNode: new (...args: unknown[]) => unknown;
  ImageLoadingConfig: new (data?: ImageLoadingConfigShape) => ImageLoadingConfigShape;
  Network: NetworkApi;
  UI: UIApi;
  compute<T = unknown>(func: string, ...args: unknown[]): Promise<T>;
  log: (level: "info" | "warning" | "error", source: string, content: unknown) => void;
  console: RuntimeConsoleApi;
  createUuid(): string;
  fetch(url: string, options?: RequestInit): Promise<FetchCompatResponse>;
  getClipboard(): Promise<string>;
  randomDouble(min: number, max: number): number;
  randomInt(min: number, max: number): number;
  setClipboard(text: string): Promise<void>;
}
