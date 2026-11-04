/**
 * Unit checks for the Host half: config normalization, the type/structure
 * helpers, and the file operations driven by a fake filesystem provider.
 *
 * These run with plain `node --test` — no DSH host, no schemastery.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULTS, resolveConfig } from "../lib/config.js";
import { countLines, extensionOf, looksBinary, mimeOf, readDocument, searchFiles, listDirectory } from "../lib/files.js";
import { DEFAULT_BLOCKED_EXTENSIONS, isBlockedExtension, openCommandFor } from "../lib/open.js";
import { joinDisplay } from "../lib/roots.js";

/* ------------------------------------------------------------------ */
/* config                                                              */
/* ------------------------------------------------------------------ */

test("resolveConfig falls back to defaults", () => {
  const settings = resolveConfig(undefined);
  assert.equal(settings.enabled, true);
  assert.equal(settings.routePath, DEFAULTS.routePath);
  assert.deepEqual(settings.extraRoots, []);
  assert.equal(settings.maxTextBytes, DEFAULTS.maxTextBytes);
});

test("resolveConfig rejects a route outside /api", () => {
  assert.equal(resolveConfig({ routePath: "/explorer" }).routePath, DEFAULTS.routePath);
  assert.equal(resolveConfig({ routePath: "api/explorer" }).routePath, "/api/explorer");
  assert.equal(resolveConfig({ routePath: "/api/x///" }).routePath, "/api/x");
});

test("resolveConfig caps text at the raw limit and normalizes lists", () => {
  const settings = resolveConfig({ maxTextBytes: 9_000_000, maxRawBytes: 1024, ignored: ["node_modules", "a/b", ""] });
  assert.equal(settings.maxTextBytes, 1024);
  assert.deepEqual(settings.ignored, ["node_modules"]);
  assert.deepEqual(resolveConfig({ extraRoots: [" /tmp ", "/tmp", 42] }).extraRoots, ["/tmp"]);
});

test("resolveConfig normalizes the open-with-default-app settings", () => {
  const defaults = resolveConfig({});
  assert.equal(defaults.allowOpenWithDefaultApp, true);
  assert.deepEqual(defaults.blockedOpenExtensions, DEFAULT_BLOCKED_EXTENSIONS);
  assert.deepEqual(resolveConfig({ blockedOpenExtensions: [".EXE", "bat", "exe"] }).blockedOpenExtensions, ["exe", "bat"]);
  assert.deepEqual(resolveConfig({ blockedOpenExtensions: [] }).blockedOpenExtensions, []);
  assert.equal(resolveConfig({ allowOpenWithDefaultApp: false }).allowOpenWithDefaultApp, false);
});

/* ------------------------------------------------------------------ */
/* open with the default application                                   */
/* ------------------------------------------------------------------ */

test("openCommandFor picks the platform opener without quoting bugs", () => {
  const win = openCommandFor("C:\\a b\\x.txt", "win32");
  assert.equal(win.command, process.env.ComSpec || "cmd.exe");
  assert.deepEqual(win.args, ["/c", "start", "", "C:\\a b\\x.txt"]);
  assert.deepEqual(openCommandFor("/a/x.txt", "darwin"), { command: "open", args: ["/a/x.txt"] });
  assert.deepEqual(openCommandFor("/a/x.txt", "linux"), { command: "xdg-open", args: ["/a/x.txt"] });
});

test("executable suffixes are refused by default", () => {
  assert.equal(isBlockedExtension("exe"), true);
  assert.equal(isBlockedExtension("TXT"), false);
  assert.equal(isBlockedExtension("exe", []), false);
  assert.ok(DEFAULT_BLOCKED_EXTENSIONS.includes("bat"));
  assert.ok(DEFAULT_BLOCKED_EXTENSIONS.includes("ps1"));
});

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

test("extensionOf handles dots, separators and dotfiles", () => {
  assert.equal(extensionOf("a/b/c.ts"), "ts");
  assert.equal(extensionOf("C:\\x\\y.JSON"), "json");
  assert.equal(extensionOf("Makefile"), "");
  assert.equal(extensionOf(".gitignore"), "");
  assert.equal(extensionOf("trailing."), "");
});

test("mimeOf only inlines images", () => {
  assert.equal(mimeOf("png"), "image/png");
  assert.equal(mimeOf("SVG"), "image/svg+xml");
  assert.equal(mimeOf("exe"), "application/octet-stream");
});

test("looksBinary flags NUL bytes and control runs", () => {
  assert.equal(looksBinary(new TextEncoder().encode("hello world\n")), false);
  assert.equal(looksBinary(new Uint8Array([104, 105, 0, 1])), true);
  assert.equal(looksBinary(new Uint8Array([1, 2, 3, 4])), true);
  assert.equal(looksBinary(new Uint8Array([])), false);
});

test("countLines counts a trailing newline as an empty last line", () => {
  assert.equal(countLines(""), 1);
  assert.equal(countLines("a"), 1);
  assert.equal(countLines("a\nb"), 2);
  assert.equal(countLines("a\n"), 2);
});

test("joinDisplay keeps the filesystem root addressable", () => {
  assert.equal(joinDisplay("/", "etc"), "/etc");
  assert.equal(joinDisplay("/a/b/", "c.txt"), "/a/b/c.txt");
  assert.equal(joinDisplay("C:/a", "b"), "C:/a/b");
});

/* ------------------------------------------------------------------ */
/* fake filesystem                                                     */
/* ------------------------------------------------------------------ */

/**
 * A tiny in-memory fs provider: absolute path to entry.
 * @param entries - `{ '/a': { type, content } }`
 */
function fakeFs(entries) {
  const target = (path) => ({ targetKey: path, displayPath: path });
  const listOf = (path) => {
    const prefix = path.replace(/\/+$/, "") + "/";
    const out = [];
    for (const key of Object.keys(entries)) {
      if (!key.startsWith(prefix)) continue;
      const rest = key.slice(prefix.length);
      if (rest === "" || rest.includes("/")) continue;
      out.push(key);
    }
    return out;
  };
  return {
    resolve: async (path) => target(path.replace(/\\/g, "/").replace(/\/+$/, "") || "/"),
    processPath: (t) => t.targetKey,
    stat: async (t) => {
      const entry = entries[t.targetKey];
      if (entry === undefined) return undefined;
      return {
        type: entry.type,
        version: "v1",
        size: entry.type === "file" ? Buffer.byteLength(entry.content ?? "") : undefined,
      };
    },
    listDir: async (t) =>
      listOf(t.targetKey).map((key) => ({
        name: key.slice(key.lastIndexOf("/") + 1),
        type: entries[key].type,
        target: target(key),
        size: entries[key].type === "file" ? Buffer.byteLength(entries[key].content ?? "") : undefined,
      })),
    readBytes: async (t) => Buffer.from(entries[t.targetKey].content ?? "", "utf8"),
    readByteRange: async (t, range) =>
      Buffer.from(entries[t.targetKey].content ?? "", "utf8").subarray(range.offset, range.offset + range.length),
    contains: (parent, child) => child.targetKey === parent.targetKey || child.targetKey.startsWith(parent.targetKey + "/"),
  };
}

const CONFIG = resolveConfig({ includeHome: false, extraRoots: ["/root"] });

test("listDirectory hides dotfiles unless asked and sorts folders first", async () => {
  const fs = fakeFs({
    "/root": { type: "directory" },
    "/root/b.txt": { type: "file", content: "b" },
    "/root/a": { type: "directory" },
    "/root/.hidden": { type: "file", content: "x" },
  });
  const ctx = { fs, get: () => undefined };
  const target = await fs.resolve("/root");
  const visible = await listDirectory(ctx, target, "/root", { hidden: false, ignored: [], signal: undefined });
  assert.deepEqual(visible.entries.map((entry) => entry.name), ["a", "b.txt"]);
  assert.equal(visible.entries[0].type, "directory");
  const all = await listDirectory(ctx, target, "/root", { hidden: true, ignored: [], signal: undefined });
  assert.equal(all.entries.length, 3);
});

test("listDirectory honours the ignore list", async () => {
  const fs = fakeFs({
    "/root": { type: "directory" },
    "/root/node_modules": { type: "directory" },
    "/root/a.js": { type: "file", content: "" },
  });
  const ctx = { fs, get: () => undefined };
  const target = await fs.resolve("/root");
  const listing = await listDirectory(ctx, target, "/root", { hidden: false, ignored: ["node_modules"], signal: undefined });
  assert.deepEqual(listing.entries.map((entry) => entry.name), ["a.js"]);
});

test("readDocument previews text, announces images, rejects binaries", async () => {
  const fs = fakeFs({
    "/root/a.md": { type: "file", content: "# hi\nbody\r\n" },
    "/root/pic.png": { type: "file", content: "not really a png" },
    "/root/bin.dat": { type: "file", content: "a\u0000b" },
  });
  const ctx = { fs, get: () => undefined };
  const text = await readDocument(ctx, await fs.resolve("/root/a.md"), "/root/a.md", CONFIG, undefined);
  assert.equal(text.kind, "text");
  assert.equal(text.text, "# hi\nbody\n");
  assert.equal(text.truncated, false);
  const image = await readDocument(ctx, await fs.resolve("/root/pic.png"), "/root/pic.png", CONFIG, undefined);
  assert.equal(image.kind, "image");
  assert.equal(image.mime, "image/png");
  const binary = await readDocument(ctx, await fs.resolve("/root/bin.dat"), "/root/bin.dat", CONFIG, undefined);
  assert.equal(binary.kind, "binary");
});

test("readDocument flags a cut preview", async () => {
  const fs = fakeFs({ "/root/big.txt": { type: "file", content: "x".repeat(4096) } });
  const ctx = { fs, get: () => undefined };
  const settings = resolveConfig({ maxTextBytes: 1024 });
  const doc = await readDocument(ctx, await fs.resolve("/root/big.txt"), "/root/big.txt", settings, undefined);
  assert.equal(doc.kind, "text");
  assert.equal(doc.truncated, true);
  assert.equal(doc.text.length, 1024);
  assert.equal(doc.bytes, 4096);
});

test("searchFiles walks the tree, skips ignored folders and reports truncation", async () => {
  const fs = fakeFs({
    "/root": { type: "directory" },
    "/root/src": { type: "directory" },
    "/root/src/app.ts": { type: "file", content: "" },
    "/root/src/deep": { type: "directory" },
    "/root/src/deep/app-extra.ts": { type: "file", content: "" },
    "/root/node_modules": { type: "directory" },
    "/root/node_modules/app.ts": { type: "file", content: "" },
  });
  const ctx = { fs, get: () => undefined };
  const target = await fs.resolve("/root");
  const result = await searchFiles(ctx, target, "/root", "app", {
    limit: 10,
    hidden: false,
    ignored: [],
    signal: undefined,
  });
  assert.deepEqual(result.hits.map((hit) => hit.rel), ["src/app.ts", "src/deep/app-extra.ts"]);
  assert.equal(result.truncated, false);
});
