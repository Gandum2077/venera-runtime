export type LogLevel = "info" | "warning" | "error";
export type LogLevelInput = LogLevel | "warn";

const DEBUG_CONFIG_PATH = "assets/debug";
const LOG_ROOT_PATH = "logs";

function normalizeLogLevel(value: string): LogLevel | "off" {
  const normalized = value.trim().toLowerCase();
  switch (normalized) {
    case "on":
    case "info":
      return "info";
    case "warn":
    case "warning":
      return "warning";
    case "error":
      return "error";
    default:
      return "off";
  }
}

function readDebugLevel(): LogLevel | "off" {
  if (!$file.exists(DEBUG_CONFIG_PATH)) {
    return "off";
  }
  return normalizeLogLevel($file.read(DEBUG_CONFIG_PATH).string ?? "off");
}

function padNumber(value: number, length = 2): string {
  return value.toString().padStart(length, "0");
}

function formatTimestamp(date: Date, forFileName = false): string {
  const year = date.getFullYear();
  const month = padNumber(date.getMonth() + 1);
  const day = padNumber(date.getDate());
  const hour = padNumber(date.getHours());
  const minute = padNumber(date.getMinutes());
  const second = padNumber(date.getSeconds());
  const millisecond = padNumber(date.getMilliseconds(), 3);
  const dateSeparator = forFileName ? "_" : " ";
  const timeSeparator = forFileName ? "-" : ":";
  return `${year}-${month}-${day}${dateSeparator}${hour}${timeSeparator}${minute}${timeSeparator}${second}.${millisecond}`;
}

function ensureDirectory(path: string): boolean {
  if ($file.exists(path)) {
    return $file.isDirectory(path);
  }

  const absolute = path.startsWith("/");
  const parts = path.split("/").filter(Boolean);
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : absolute ? `/${part}` : part;
    if (!$file.exists(current) && !$file.mkdir(current)) {
      return false;
    }
  }
  return true;
}

const debugLevel = readDebugLevel();
const logOn = debugLevel !== "off";
const logLevel: LogLevel = logOn ? debugLevel : "info";
const logDirectory = logOn ? `${LOG_ROOT_PATH}/log_${formatTimestamp(new Date(), true)}` : null;

if (logDirectory) {
  ensureDirectory(logDirectory);
}

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  info: 10,
  warning: 20,
  error: 30,
};

function toLogLevel(level: LogLevelInput): LogLevel {
  return level === "warn" ? "warning" : level;
}

export function shouldLogLevel(level: LogLevelInput, minimumLevel: LogLevelInput): boolean {
  return LOG_LEVEL_ORDER[toLogLevel(level)] >= LOG_LEVEL_ORDER[toLogLevel(minimumLevel)];
}

function stringifyError(error: Error): string {
  if (error.stack) {
    return error.stack;
  }
  return `${error.name}: ${error.message}`;
}

function stringifyContent(content: unknown): string {
  if (content === undefined) {
    return "";
  }
  if (typeof content === "string") {
    return content;
  }
  if (content instanceof Error) {
    return stringifyError(content);
  }
  if (typeof content === "function") {
    return `[function ${content.name || "anonymous"}]`;
  }

  const seen = new WeakSet<object>();
  try {
    const json = JSON.stringify(
      content,
      (_key, value: unknown) => {
        if (typeof value === "bigint") {
          return value.toString();
        }
        if (typeof value === "function") {
          return `[function ${value.name || "anonymous"}]`;
        }
        if (value instanceof Error) {
          return {
            name: value.name,
            message: value.message,
            stack: value.stack,
          };
        }
        if (value && typeof value === "object") {
          if (seen.has(value)) {
            return "[Circular]";
          }
          seen.add(value);
        }
        return value;
      },
      2,
    );
    if (json !== undefined) {
      return json;
    }
  } catch (error) {
    if (error instanceof Error) {
      return `[Unserializable content]\n${stringifyError(error)}`;
    }
  }

  try {
    return String(content);
  } catch {
    return "[Unserializable content]";
  }
}

function createLogText(level: LogLevel, title: string, content: unknown): string {
  return [
    `time: ${formatTimestamp(new Date())}`,
    `level: ${level}`,
    `title: ${title}`,
    "content:",
    stringifyContent(content),
  ].join("\n");
}

class Logger {
  private _level: LogLevel = logLevel;
  private logIndex = 0;

  constructor() {}

  get level(): LogLevel {
    return this._level;
  }

  set level(newLevel: LogLevelInput) {
    this._level = toLogLevel(newLevel);
  }

  get enabled(): boolean {
    return logOn;
  }

  get directory(): string | null {
    return logDirectory;
  }

  log(level: LogLevelInput, title: string, content?: unknown): void {
    if (!logOn) return;
    const normalizedLevel = toLogLevel(level);
    if (shouldLogLevel(normalizedLevel, this._level)) {
      switch (normalizedLevel) {
        case "info":
          console.info(`[${title}]`);
          console.info(content);
          break;
        case "warning":
          console.warn(`[${title}]`);
          console.warn(content);
          break;
        case "error":
          console.error(`[${title}]`);
          console.error(content);
          break;
        default:
          console.log(`[${title}]`);
          console.log(content);
      }

      this.writeFile(normalizedLevel, title, content);
    }
  }

  info(title: string, content?: unknown): void {
    this.log("info", title, content);
  }

  warn(title: string, content?: unknown): void {
    this.log("warning", title, content);
  }

  warning(title: string, content?: unknown): void {
    this.log("warning", title, content);
  }

  error(title: string, content?: unknown): void {
    this.log("error", title, content);
  }

  private writeFile(level: LogLevel, title: string, content: unknown): void {
    if (!logDirectory || !$file.exists(logDirectory)) {
      return;
    }
    const index = padNumber(this.logIndex++, 6);
    const path = `${logDirectory}/${formatTimestamp(new Date(), true)}_${index}_${level}.log`;
    $file.write({
      data: $data({ string: createLogText(level, title, content) }),
      path,
    });
  }
}

export const logger = new Logger();
