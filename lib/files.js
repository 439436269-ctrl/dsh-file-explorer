/**
 * File operations behind the explorer route: one directory listing, one file
 * preview, one bounded recursive search.
 *
 * Everything here works on the composed filesystem provider, never on `node:fs`
 * directly, so a sandboxed or remote backend keeps working unchanged.
 *
 * @module dsh-file-explorer/files
 */
import { httpError, joinDisplay } from "./roots.js";

/** Suffixes previewed through the raw byte route instead of as text. */
export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "ico", "svg"];

/** Media types for the inline-previewable images. */
const IMAGE_TYPES = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  bmp: "image/bmp",
  ico: "image/x-icon",
  svg: "image/svg+xml",
};

/** Directories a search walks past without listing them. */
const SEARCH_SKIP = new Set(["node_modules", ".git", ".hg", ".svn", ".venv", "__pycache__", ".next", ".turbo"]);

/** Entries returned for one directory before the answer is marked truncated. */
const MAX_ENTRIES = 2000;

/** Directories one search may open. */
const SEARCH_MAX_DIRS = 400;

/** Milliseconds one search may spend walking. */
const SEARCH_BUDGET_MS = 4000;

/** Bytes inspected to decide whether a file is text. */
const SNIFF_BYTES = 8192;

/**
 * List one directory.
 * @param ctx - host context carrying `fs`.
 * @param target - resolved directory target.
 * @param basePath - display path of that directory.
 * @param options - `hidden` (include dotfiles), `ignored` (entry names), `signal`.
 * @returns `{ path, entries, truncated }`.
 */
export async function listDirectory(ctx, target, basePath, options) {
  const info = await ctx.fs.stat(target, options.signal);
  if (info === undefined) throw httpError(404, "PATH_NOT_FOUND", "目录不存在");
  if (info.type !== "directory") throw httpError(400, "NOT_A_DIRECTORY", "这个路径不是文件夹");
  const raw = await ctx.fs.listDir(target, options.signal);
  const ignored = new Set(options.ignored);
  const entries = [];
  for (const entry of raw) {
    if (!options.hidden && entry.name.startsWith(".")) continue;
    if (ignored.has(entry.name)) continue;
    entries.push({
      name: entry.name,
      path: joinDisplay(basePath, entry.name),
      type: entry.type,
      size: typeof entry.size === "number" ? entry.size : undefined,
      ext: extensionOf(entry.name),
      hidden: entry.name.startsWith("."),
    });
  }
  entries.sort(compareEntries);
  const truncated = entries.length > MAX_ENTRIES;
  return { path: basePath, entries: truncated ? entries.slice(0, MAX_ENTRIES) : entries, truncated };
}

/** Folders first, then names in natural order. */
function compareEntries(left, right) {
  const leftDir = left.type === "directory" ? 0 : 1;
  const rightDir = right.type === "directory" ? 0 : 1;
  if (leftDir !== rightDir) return leftDir - rightDir;
  return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" });
}

/**
 * Read one file for preview.
 *
 * Text is returned inline (capped, flagged when cut); images are announced so
 * the browser half can point an `<img>` at the raw route; everything else is
 * reported as binary with no content.
 * @param ctx - host context carrying `fs`.
 * @param target - resolved file target.
 * @param filePath - display path, used for the type decision.
 * @param config - resolved configuration (`maxTextBytes`, `maxRawBytes`).
 * @param signal - aborts the reads.
 * @returns the preview payload.
 */
export async function readDocument(ctx, target, filePath, config, signal) {
  const info = await ctx.fs.stat(target, signal);
  if (info === undefined) throw httpError(404, "PATH_NOT_FOUND", "文件不存在");
  if (info.type !== "file") throw httpError(400, "NOT_A_FILE", "这个路径不是文件");
  const size = typeof info.size === "number" ? info.size : 0;
  const ext = extensionOf(filePath);
  if (IMAGE_EXTENSIONS.includes(ext)) {
    if (size > config.maxRawBytes) {
      return { kind: "too-large", ext, bytes: size, mime: mimeOf(ext), limit: config.maxRawBytes };
    }
    return { kind: "image", ext, bytes: size, mime: mimeOf(ext), lines: 0, truncated: false };
  }
  if (size === 0) return { kind: "text", ext, bytes: 0, text: "", lines: 1, truncated: false, binary: false };

  const head = await ctx.fs.readByteRange(target, { offset: 0, length: Math.min(size, SNIFF_BYTES) }, signal);
  if (looksBinary(head)) return { kind: "binary", ext, bytes: size, mime: mimeOf(ext), lines: 0, truncated: false };

  const truncated = size > config.maxTextBytes;
  const bytes = truncated
    ? await ctx.fs.readByteRange(target, { offset: 0, length: config.maxTextBytes }, signal)
    : await ctx.fs.readBytes(target, signal, config.maxTextBytes);
  const text = normalizeText(decodeText(bytes, head));
  if (text.binary) return { kind: "binary", ext, bytes: size, mime: mimeOf(ext), lines: 0, truncated: false };
  return {
    kind: "text",
    ext,
    bytes: size,
    text: text.value,
    lines: countLines(text.value),
    truncated,
    limit: truncated ? config.maxTextBytes : undefined,
  };
}

/**
 * Read a whole file as bytes for the raw route.
 * @param ctx - host context carrying `fs`.
 * @param target - resolved file target.
 * @param config - resolved configuration.
 * @param signal - aborts the read.
 * @returns `{ bytes, size }` where `bytes` holds at most `maxRawBytes`.
 */
export async function readRaw(ctx, target, config, signal) {
  const info = await ctx.fs.stat(target, signal);
  if (info === undefined) throw httpError(404, "PATH_NOT_FOUND", "文件不存在");
  if (info.type !== "file") throw httpError(400, "NOT_A_FILE", "这个路径不是文件");
  const size = typeof info.size === "number" ? info.size : 0;
  if (size > config.maxRawBytes) throw httpError(413, "FILE_TOO_LARGE", "文件超过原始字节上限");
  const bytes = await ctx.fs.readBytes(target, signal, config.maxRawBytes);
  return { bytes, size };
}

/**
 * Walk a directory tree for names matching a query.
 * @param ctx - host context carrying `fs`.
 * @param target - resolved root target for the walk.
 * @param basePath - display path of that directory.
 * @param query - case-insensitive substring.
 * @param options - `limit`, `hidden`, `ignored`, `signal`.
 * @returns `{ hits, scanned, truncated }`.
 */
export async function searchFiles(ctx, target, basePath, query, options) {
  const needle = query.toLocaleLowerCase();
  const ignored = new Set([...options.ignored, ...SEARCH_SKIP]);
  const hits = [];
  const visited = new Set();
  const deadline = Date.now() + SEARCH_BUDGET_MS;
  const queue = [{ target, base: basePath }];
  let scanned = 0;
  let truncated = false;

  while (queue.length > 0) {
    if (hits.length >= options.limit || scanned >= SEARCH_MAX_DIRS || Date.now() > deadline) {
      truncated = true;
      break;
    }
    const current = queue.shift();
    if (visited.has(current.target.targetKey)) continue;
    visited.add(current.target.targetKey);
    scanned += 1;
    let children;
    try {
      children = await ctx.fs.listDir(current.target, options.signal);
    } catch {
      continue;
    }
    for (const child of children) {
      if (child.name === "." || child.name === "..") continue;
      if (!options.hidden && child.name.startsWith(".")) continue;
      const childPath = joinDisplay(current.base, child.name);
      if (child.type === "directory") {
        if (ignored.has(child.name)) continue;
        queue.push({ target: child.target, base: childPath });
        continue;
      }
      if (child.type !== "file") continue;
      if (ignored.has(child.name)) continue;
      if (!childPath.toLocaleLowerCase().includes(needle)) continue;
      hits.push({
        name: child.name,
        path: childPath,
        rel: childPath.slice(basePath.length).replace(/^\/+/, ""),
        ext: extensionOf(child.name),
        size: typeof child.size === "number" ? child.size : undefined,
      });
      if (hits.length >= options.limit) {
        truncated = true;
        break;
      }
    }
  }
  return { hits, scanned, truncated };
}

/** Lower-case suffix without the dot, or the empty string. */
export function extensionOf(name) {
  const trimmed = String(name).replace(/[\\/]+$/, "");
  const base = trimmed.slice(trimmed.replaceAll("\\", "/").lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "";
  return base.slice(dot + 1).toLocaleLowerCase();
}

/** Media type for an extension; unknown binaries fall back to a download type. */
export function mimeOf(ext) {
  const key = String(ext).toLocaleLowerCase();
  return IMAGE_TYPES[key] ?? "application/octet-stream";
}

/** Whether an extension is previewed as an image. */
export function isImageExtension(ext) {
  return IMAGE_EXTENSIONS.includes(String(ext).toLocaleLowerCase());
}

/** Line count of normalized text. */
export function countLines(text) {
  if (text === "") return 1;
  let lines = 1;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\n") lines += 1;
  }
  return lines;
}

/**
 * Decode bytes as UTF-8, honouring a UTF-16 BOM when the file starts with one.
 * @param bytes - the (possibly truncated) content.
 * @param head - the sniffed prefix, used for BOM detection only.
 * @returns the decoded string.
 */
function decodeText(bytes, head) {
  const prefix = head ?? bytes;
  if (prefix.length >= 2 && prefix[0] === 0xff && prefix[1] === 0xfe) {
    return new TextDecoder("utf-16le", { fatal: false }).decode(bytes);
  }
  if (prefix.length >= 2 && prefix[0] === 0xfe && prefix[1] === 0xff) {
    return new TextDecoder("utf-16be", { fatal: false }).decode(bytes);
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

/**
 * Normalize line endings, drop a UTF-8 BOM, and report replacement characters
 * that suggest the file is not really text.
 * @param text - decoded content.
 * @returns `{ value, binary }`.
 */
function normalizeText(text) {
  let value = text;
  if (value.charCodeAt(0) === 0xfeff) value = value.slice(1);
  value = value.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  const sample = value.slice(0, SNIFF_BYTES);
  let replacement = 0;
  for (let index = 0; index < sample.length; index += 1) {
    if (sample[index] === "\uFFFD") replacement += 1;
  }
  return { value, binary: sample.length > 0 && replacement / sample.length > 0.1 };
}

/**
 * Whether a byte prefix looks like binary content: a NUL byte, or a run of
 * control characters far denser than text ever produces.
 * @param bytes - the sniffed prefix.
 * @returns true when the file should not be shown as text.
 */
export function looksBinary(bytes) {
  if (bytes.length === 0) return false;
  let control = 0;
  for (const byte of bytes) {
    if (byte === 0) return true;
    if (byte < 9 || (byte > 13 && byte < 32)) control += 1;
  }
  return control / bytes.length > 0.3;
}
