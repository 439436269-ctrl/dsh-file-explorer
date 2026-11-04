/**
 * The authenticated explorer API: one route, dispatched by `?op=`.
 *
 * `GET <routePath>?op=roots|list|read|search|raw`
 *
 * The route lives under `/api/`, so the composition's connection service has
 * already fenced and authenticated the request before this handler runs. Every
 * path is resolved and proved to live under a browsable root (see `roots.js`),
 * so this route cannot be turned into an arbitrary file reader.
 *
 * @module dsh-file-explorer/route
 */
import { extensionOf, listDirectory, mimeOf, readDocument, readRaw, searchFiles } from "./files.js";
import { isBlockedExtension, openCommandFor, spawnDetached } from "./open.js";
import { displayPath, httpError, locate, resolveRoots } from "./roots.js";

/** Headers shared by every JSON answer. */
const JSON_HEADERS = {
  "Cache-Control": "private, no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
};

/** Headers shared by the byte answer. */
const RAW_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "sandbox; default-src 'none'",
};

/** Directories one search may open, mirrored for the client's help text. */
const SEARCH_LIMIT_DEFAULT = 200;

/**
 * Register the explorer route for the plugin's lifetime.
 * @param ctx - host context carrying `fs` and `connection`.
 * @param config - resolved configuration.
 * @returns the disposer removing the route.
 */
export function registerExplorerRoute(ctx, config) {
  return ctx.connection.fetch.register({
    path: config.routePath,
    methods: ["GET", "HEAD", "POST"],
    requestBody: "buffered",
    fetch: (request) => serve(request, ctx, config),
  });
}

/**
 * Answer one request.
 * @param request - fetch request built by the bridge.
 * @param ctx - host context carrying `fs`.
 * @param config - resolved configuration.
 * @returns the response.
 */
async function serve(request, ctx, config) {
  if (!config.enabled) return json({ ok: false, error: "explorer 已禁用" }, 503);
  const url = new URL(request.url);
  const op = url.searchParams.get("op") ?? "roots";
  const signal = request.signal;
  const method = request.method === "HEAD" ? "HEAD" : "GET";
  try {
    switch (op) {
      case "roots":
        return json(await rootsAnswer(ctx, config, signal));
      case "list":
        return json(await listAnswer(ctx, config, url, signal));
      case "read":
        return json(await readAnswer(ctx, config, url, signal));
      case "search":
        return json(await searchAnswer(ctx, config, url, signal));
      case "raw":
        return await rawAnswer(ctx, config, url, signal, method);
      case "open":
        return json(await openAnswer(ctx, config, url, request, signal));
      default:
        throw httpError(400, "UNKNOWN_OP", `未知操作: ${op}`);
    }
  } catch (error) {
    return failure(error);
  }
}

/** The root picker, plus the default selection. */
async function rootsAnswer(ctx, config, signal) {
  const roots = await resolveRoots(ctx, config, signal);
  return {
    ok: true,
    roots: roots.map((root) => ({ path: root.path, title: root.title, kind: root.kind })),
    defaultRoot: roots[0]?.path,
  };
}

/** One directory listing. */
async function listAnswer(ctx, config, url, signal) {
  const { target } = await locate(ctx, config, url.searchParams.get("path"), signal);
  const basePath = displayPath(ctx, target);
  const listing = await listDirectory(ctx, target, basePath, {
    hidden: boolParam(url, "hidden", config.defaultShowHidden),
    ignored: config.ignored,
    signal,
  });
  return { ok: true, ...listing };
}

/** One file preview. */
async function readAnswer(ctx, config, url, signal) {
  const { target } = await locate(ctx, config, url.searchParams.get("path"), signal);
  const filePath = displayPath(ctx, target);
  const document = await readDocument(ctx, target, filePath, config, signal);
  return { ok: true, path: filePath, ...document };
}

/** One bounded recursive name search. */
async function searchAnswer(ctx, config, url, signal) {
  const query = url.searchParams.get("q") ?? "";
  if (query.trim() === "") return { ok: true, hits: [], scanned: 0, truncated: false };
  const { target } = await locate(ctx, config, url.searchParams.get("path"), signal);
  const basePath = displayPath(ctx, target);
  const limit = intParam(url, "limit", SEARCH_LIMIT_DEFAULT, 1, 2000);
  const result = await searchFiles(ctx, target, basePath, query, {
    limit,
    hidden: boolParam(url, "hidden", config.defaultShowHidden),
    ignored: config.ignored,
    signal,
  });
  return { ok: true, base: basePath, ...result };
}

/** Raw bytes for the image preview. */
async function rawAnswer(ctx, config, url, signal, method) {
  const { target } = await locate(ctx, config, url.searchParams.get("path"), signal);
  const filePath = displayPath(ctx, target);
  const { bytes, size } = await readRaw(ctx, target, config, signal);
  const ext = extensionOf(filePath);
  const mime = mimeOf(ext);
  const inline = mime.startsWith("image/");
  const name = filePath.slice(filePath.lastIndexOf("/") + 1);
  const headers = {
    ...RAW_HEADERS,
    "Content-Type": mime,
    "Content-Length": String(bytes.byteLength),
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(name)}`,
  };
  if (method === "HEAD") return new Response(null, { status: 200, headers });
  return new Response(bytes, { status: 200, headers });
}

/**
 * Hand one file to the system default application.
 *
 * POST-only: a GET must never launch a program. `probe=1` answers the command
 * that would run without spawning it, which is what the verification suite uses.
 */
async function openAnswer(ctx, config, url, request, signal) {
  if (request.method !== "POST") throw httpError(405, "METHOD_NOT_ALLOWED", "op=open 只接受 POST");
  if (!config.allowOpenWithDefaultApp) throw httpError(403, "OPEN_DISABLED", "用默认程序打开已关闭");
  const { target } = await locate(ctx, config, url.searchParams.get("path"), signal);
  const info = await ctx.fs.stat(target, signal);
  if (info === undefined) throw httpError(404, "PATH_NOT_FOUND", "文件不存在");
  if (info.type !== "file") throw httpError(400, "NOT_A_FILE", "只能打开普通文件");
  const filePath = displayPath(ctx, target);
  const ext = extensionOf(filePath);
  if (isBlockedExtension(ext, config.blockedOpenExtensions)) {
    throw httpError(400, "OPEN_BLOCKED", `不打开可执行类型 .${ext}`);
  }
  const command = openCommandFor(filePath);
  if (url.searchParams.get("probe") === "1") {
    return { ok: true, probe: true, path: filePath, command: command.command, args: command.args };
  }
  spawnDetached(command.command, command.args);
  return { ok: true, launched: true, path: filePath, command: command.command };
}

/** One JSON answer. */
function json(value, status = 200) {  return new Response(JSON.stringify(value), { status, headers: JSON_HEADERS });
}

/** Map a thrown error onto a status and a message the UI can show. */
function failure(error) {
  const status = typeof error?.status === "number" ? error.status : statusOf(error);
  const message = error instanceof Error && error.message !== "" ? error.message : "读取失败";
  return json({ ok: false, error: message, code: typeof error?.code === "string" ? error.code : undefined }, status);
}

/** Filesystem error codes to HTTP statuses. */
function statusOf(error) {
  const code = typeof error?.code === "string" ? error.code : "";
  switch (code) {
    case "FS_NOT_FOUND":
    case "ENOENT":
      return 404;
    case "FS_PERMISSION_DENIED":
    case "FS_SANDBOX_DENIED":
    case "EACCES":
    case "EPERM":
      return 403;
    case "FS_TOO_LARGE":
      return 413;
    case "FS_ABORTED":
      return 499;
    default:
      return 500;
  }
}

/** A boolean query parameter with a default. */
function boolParam(url, name, fallback) {
  const raw = url.searchParams.get(name);
  if (raw === null) return fallback;
  return raw === "1" || raw === "true";
}

/** A clamped integer query parameter. */
function intParam(url, name, fallback, min, max) {
  const raw = url.searchParams.get(name);
  if (raw === null) return fallback;
  const number = Number(raw);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(Math.floor(number), min), max);
}

/** Size of the largest directory listing, exported for the client help text. */
export const MAX_LISTED_ENTRIES = 2000;
