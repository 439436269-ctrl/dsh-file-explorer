/**
 * Host configuration defaults and normalization.
 *
 * Kept separate from the schemastery schema so this module stays importable by
 * plain `node --test` runs (the schema needs the host-supplied
 * `@deepseek-ai/schemastery` package).
 *
 * @module dsh-file-explorer/config
 */

/** Default authenticated route the browser half calls. */
export const DEFAULT_ROUTE_PATH = "/api/file-explorer";

/** Largest file the route returns as text by default (1 MiB). */
export const DEFAULT_MAX_TEXT_BYTES = 1024 * 1024;

/** Largest file the route streams as raw bytes by default (32 MiB). */
export const DEFAULT_MAX_RAW_BYTES = 32 * 1024 * 1024;

/** Fallback when the loader supplies no config object at all. */
export const DEFAULTS = Object.freeze({
  enabled: true,
  routePath: DEFAULT_ROUTE_PATH,
  extraRoots: [],
  includeHome: true,
  ignored: [],
  maxTextBytes: DEFAULT_MAX_TEXT_BYTES,
  maxRawBytes: DEFAULT_MAX_RAW_BYTES,
  defaultShowHidden: false,
});

/**
 * Merge a loader-supplied config over the defaults, normalizing the parts the
 * route depends on. Hand-written rather than schema-driven because the loader
 * may call `apply()` with a raw object while the settings page goes through
 * `Config`.
 * @param config - whatever the loader supplied.
 * @returns a complete, validated-enough config.
 */
export function resolveConfig(config) {
  const input = config !== null && typeof config === "object" ? config : {};
  const maxTextBytes = toPositiveInteger(input.maxTextBytes, DEFAULT_MAX_TEXT_BYTES);
  const maxRawBytes = toPositiveInteger(input.maxRawBytes, DEFAULT_MAX_RAW_BYTES);
  return {
    enabled: input.enabled === undefined ? DEFAULTS.enabled : input.enabled === true,
    routePath: normalizeRoutePath(input.routePath),
    extraRoots: normalizePaths(input.extraRoots),
    includeHome: input.includeHome === undefined ? DEFAULTS.includeHome : input.includeHome === true,
    ignored: normalizeNames(input.ignored),
    // A text preview larger than the raw cap would be pointless: the response
    // is JSON, so keep the text cap the smaller of the two.
    maxTextBytes: Math.min(maxTextBytes, maxRawBytes),
    maxRawBytes,
    defaultShowHidden: input.defaultShowHidden === undefined ? DEFAULTS.defaultShowHidden : input.defaultShowHidden === true,
  };
}

/** Keep the route under /api; anything else would skip the authenticated fence. */
function normalizeRoutePath(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  const candidate = raw === "" ? DEFAULT_ROUTE_PATH : raw;
  const withSlash = candidate.startsWith("/") ? candidate : `/${candidate}`;
  if (!withSlash.startsWith("/api/")) return DEFAULT_ROUTE_PATH;
  return withSlash.replace(/\/+$/, "");
}

/** Absolute directory spellings from an untrusted list. */
function normalizePaths(value) {
  if (!Array.isArray(value)) return [];
  const cleaned = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (trimmed === "" || cleaned.includes(trimmed)) continue;
    cleaned.push(trimmed);
  }
  return cleaned;
}

/** Plain entry names to hide from listings, without path separators. */
function normalizeNames(value) {
  if (!Array.isArray(value)) return [];
  const cleaned = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (trimmed === "" || trimmed.includes("/") || trimmed.includes("\\") || cleaned.includes(trimmed)) continue;
    cleaned.push(trimmed);
  }
  return cleaned;
}

/** A positive integer from an untrusted value, or the fallback. */
function toPositiveInteger(value, fallback) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= 1 ? Math.floor(number) : fallback;
}
