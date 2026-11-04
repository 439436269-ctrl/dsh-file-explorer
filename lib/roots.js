/**
 * The browsable root set and the confinement check every read goes through.
 *
 * The explorer never accepts an arbitrary path: the browser half names a file,
 * the Host resolves it against this provider and then proves the target is a
 * descendant of one of these roots. A root is a registered workspace, the
 * default working directory, the process directory, the home directory, or an
 * operator-configured extra root.
 *
 * @module dsh-file-explorer/roots
 */
import { homedir } from "node:os";
import path from "node:path";

/**
 * Every candidate root, before deduplication and resolution.
 * @param ctx - host context; `workspaceRegistry` and `workingDirectory` are optional.
 * @param config - resolved configuration.
 * @returns candidates in picker order: workspaces, default directory, process directory, home, extras.
 */
export function rootCandidates(ctx, config) {
  const candidates = [];
  const registry = optional(ctx, "workspaceRegistry");
  if (registry !== undefined && typeof registry.list === "function") {
    for (const workspace of registry.list()) {
      if (typeof workspace?.path !== "string") continue;
      candidates.push({ path: workspace.path, title: workspace.title, kind: "workspace" });
    }
  }
  const workingDirectory = optional(ctx, "workingDirectory");
  if (workingDirectory !== undefined && typeof workingDirectory.defaultDirectory === "string") {
    candidates.push({ path: workingDirectory.defaultDirectory, title: undefined, kind: "default" });
  }
  if (typeof process.cwd === "function") {
    candidates.push({ path: process.cwd(), title: undefined, kind: "process" });
  }
  if (config.includeHome) {
    try {
      candidates.push({ path: homedir(), title: undefined, kind: "home" });
    } catch {
      // A platform without a home directory simply offers no home root.
    }
  }
  for (const extra of config.extraRoots) candidates.push({ path: extra, title: undefined, kind: "extra" });
  return candidates;
}

/**
 * Resolve the candidate roots into stable targets, dropping duplicates and
 * directories that do not exist.
 * @param ctx - host context carrying `fs`.
 * @param config - resolved configuration.
 * @param signal - aborts the resolution round-trips.
 * @returns `{ path, title, kind, target }` entries; `path` is display-stable.
 */
export async function resolveRoots(ctx, config, signal) {
  const roots = [];
  const seen = new Set();
  for (const candidate of rootCandidates(ctx, config)) {
    let target;
    try {
      target = await ctx.fs.resolve(candidate.path, { signal });
    } catch {
      continue;
    }
    if (target === undefined) continue;
    const key = target.targetKey;
    if (seen.has(key)) continue;
    let info;
    try {
      info = await ctx.fs.stat(target, signal);
    } catch {
      continue;
    }
    if (info === undefined || info.type !== "directory") continue;
    seen.add(key);
    roots.push({
      path: displayPath(ctx, target),
      title: typeof candidate.title === "string" && candidate.title.trim() !== "" ? candidate.title : undefined,
      kind: candidate.kind,
      target,
    });
  }
  return roots;
}

/**
 * Resolve one requested file or directory and prove it lives under a root.
 * @param ctx - host context carrying `fs`.
 * @param config - resolved configuration.
 * @param requested - absolute or provider-relative path sent by the browser.
 * @param signal - aborts the resolution round-trips.
 * @returns `{ target, roots }`.
 * @throws an error carrying `status`/`code` when the path escapes every root.
 */
export async function locate(ctx, config, requested, signal) {
  if (typeof requested !== "string" || requested.trim() === "") throw httpError(400, "PATH_REQUIRED", "path is required");
  if (requested.includes("\0")) throw httpError(400, "PATH_INVALID", "path must not contain NUL");
  const roots = await resolveRoots(ctx, config, signal);
  if (roots.length === 0) throw httpError(409, "NO_ROOTS", "no browsable root is available");
  let target;
  try {
    target = await ctx.fs.resolve(requested, { signal });
  } catch (error) {
    throw httpError(404, "PATH_NOT_FOUND", describe(error, "path cannot be resolved"));
  }
  if (target === undefined) throw httpError(404, "PATH_NOT_FOUND", "path cannot be resolved");
  for (const root of roots) {
    if (ctx.fs.contains(root.target, target)) return { target, roots };
  }
  throw httpError(
    403,
    "PATH_OUTSIDE_ROOTS",
    `path is outside every browsable root (${roots.map((root) => root.path).join(", ")})`
  );
}

/**
 * The canonical spelling shown to the browser: forward slashes, no trailing
 * separator, so relative joins stay predictable on both platforms.
 * @param ctx - host context carrying `fs`.
 * @param target - resolved target.
 * @returns the display path.
 */
export function displayPath(ctx, target) {
  let raw;
  try {
    raw = ctx.fs.processPath(target);
  } catch {
    raw = target.displayPath;
  }
  const slashed = String(raw).replaceAll("\\", "/");
  return slashed.length > 1 ? slashed.replace(/\/+$/, "") : slashed;
}

/**
 * Join a directory display path and one child name.
 * @param base - directory display path.
 * @param name - direct child name.
 * @returns the child display path.
 */
export function joinDisplay(base, name) {
  const trimmed = String(base).replace(/\/+$/, "");
  return trimmed === "" ? `/${name}` : `${trimmed}/${name}`;
}

/**
 * Read an optional host service without making it a mount requirement.
 * @param ctx - host context.
 * @param key - service key.
 * @returns the service, or `undefined`.
 */
function optional(ctx, key) {
  if (typeof ctx.get !== "function") return undefined;
  try {
    return ctx.get(key);
  } catch {
    return undefined;
  }
}

/**
 * One HTTP-shaped failure the route turns into a status code.
 * @param status - HTTP status.
 * @param code - stable machine code.
 * @param message - human text shown in the UI.
 * @returns the error to throw.
 */
export function httpError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

/** A short message for a non-Error throw. */
function describe(error, fallback) {
  if (error instanceof Error && error.message !== "") return error.message;
  return fallback;
}

/** The platform separator, exported for tests that build expectations. */
export const SEPARATOR = path.sep;
