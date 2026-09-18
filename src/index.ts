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

// Explicit application API. Platform integration lives at venera-runtime/platform.
export {
  APP,
  Convert,
  Network,
  UI,
  createVeneraRuntime,
  loadVeneraConfig,
  loadVeneraConfigBySourceCode,
  loadVeneraConfigBySourceCodeAsync,
  veneraFetch,
};
export { initializeDatabase, dbManager, DBManager } from "./database";
export type { DBManagerOptions } from "./database";
export { configManager } from "./config";
export { cookieJar, BrowserCookieJar } from "./cookiejar";
export { logger } from "./logger";
export type { LogLevel, LogLevelInput } from "./logger";
export { modifyImage } from "./modify-image";
export type { LoadVeneraConfigOptions } from "./package-api";
export type {
  EntityId,
  MaybePromise,
  TagsRecord,
  ComicChapterMap,
  ComicChapters,
  PageJumpTarget,
  PageJumpTargetLike,
  CookieRecord,
  NetworkResponse,
  FetchCompatResponse,
  ComicShape,
  CommentShape,
  ComicDetailsShape,
  ImageLoadingConfigShape,
  ArchiveInfo,
  AccountLoginWithWebview,
  AccountLoginWithCookies,
  AccountConfig,
  ExplorePagePart,
  ExplorePageType,
  ExploreComicListResult,
  ExploreMixedResult,
  ExploreMultiPartResult,
  ExploreLoadResult,
  ExplorePageData,
  SearchOptionType,
  SearchOptions,
  SearchPageResult,
  SearchPageData,
  CategoryPartItem,
  CategoryPartType,
  CategoryPart,
  CategoryButton,
  CategoryData,
  CategoryComicsOptions,
  RankingData,
  CategoryComicsData,
  LinkHandler,
  ArchiveDownloader,
  ComicImageListResult,
  ComicThumbnailListResult,
  FavoriteFoldersResult,
  CommentPageResult,
  FavoritesSection,
  SettingOption,
  SettingBaseDefinition,
  SettingSelectDefinition,
  SettingSwitchDefinition,
  SettingInputDefinition,
  SettingCallbackDefinition,
  SettingDefinition,
  SettingsMap,
  ConfigIndexEntry,
  ComicSection,
  VeneraConfigSource,
  AppRuntimeInfo,
  ConvertApi,
  NetworkApi,
  UIApi,
  RuntimeConsoleApi,
  RuntimeGlobals,
} from "./venera-types";
