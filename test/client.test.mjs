/**
 * Structural checks for the browser half.
 *
 * The bundle is a plain script that hands a factory to
 * `window.__ModuleLoader__`; this file runs it with a stub loader, a stub React
 * and a stub client context, so the slot registrations (which are the only
 * contract that makes the UI appear at all) are verified without a browser.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const SOURCE = await readFile(new URL("../lib/client.js", import.meta.url), "utf8");

/** Minimal React: `apply` registers components but never renders them. */
const ReactStub = {
  Fragment: Symbol("Fragment"),
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat() }),
  useState: () => {
    throw new Error("useState called during registration");
  },
  useEffect: () => {
    throw new Error("useEffect called during registration");
  },
  useMemo: (fn) => fn(),
  useRef: (value) => ({ current: value }),
  useCallback: (fn) => fn,
};

/** Run the bundle and return the definition it handed to the loader. */
function loadBundle() {
  let definition;
  const windowStub = {
    __ModuleLoader__: {
      load(value) {
        definition = value;
        return value;
      },
    },
  };
  const globalStub = {
    localStorage: { getItem: () => null, setItem: () => undefined },
    navigator: {},
    __DSH_FILE_EXPLORER_CONFIG__: { routePath: "/api/custom", defaultShowHidden: true },
  };
  const run = new Function("window", "globalThis", SOURCE + "\n;");
  run(windowStub, globalStub);
  assert.ok(definition, "the bundle must call window.__ModuleLoader__.load");
  return definition;
}

test("the bundle identifies itself with the package name", () => {
  const definition = loadBundle();
  assert.equal(definition.id, "@vfvrpq/dsh-file-explorer");
  assert.equal(typeof definition.factory, "function");
});

test("apply registers the rail icon and the main panel under one id", () => {
  const definition = loadBundle();
  const registered = [];
  let styleTags = 0;
  const ctx = {
    effect(run) {
      return run();
    },
    locale: {
      register() {
        return () => undefined;
      },
      bind() {
        return (key) => key;
      },
    },
    slots: {
      inject(_name, callback) {
        return callback();
      },
      register(options, component) {
        registered.push({ options, component });
        return () => undefined;
      },
    },
  };
  const documentStub = {
    querySelector: () => null,
    createElement: () => ({ dataset: {}, appendChild: () => undefined, textContent: "" }),
    head: { appendChild: () => undefined },
  };
  const previousDocument = globalThis.document;
  globalThis.document = documentStub;
  try {
    const client = definition.factory((name) => {
      if (name === "react") return ReactStub;
      throw new Error("unexpected require: " + name);
    });
    client.apply(ctx);
    styleTags += 1;
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }

  const rail = registered.find((entry) => entry.options.name === "sidebar.panellist");
  const main = registered.find((entry) => entry.options.name === "main");
  assert.ok(rail, "a sidebar.panellist entry is required for the rail icon");
  assert.ok(main, "a main entry is required for the panel");
  assert.equal(rail.options.id, main.options.key, "the rail cell id must address the main panel key");
  assert.equal(typeof rail.component, "function");
  assert.equal(typeof main.component, "function");
  assert.equal(styleTags, 1);
});

test("apiUrl keeps the configured route and encodes the path", () => {
  const client = loadBundle().factory((name) => (name === "react" ? ReactStub : undefined));
  assert.equal(
    client.apiUrl("/api/file-explorer", "read", { path: "C:/a b/x.md" }),
    "/api/file-explorer?op=read&path=C%3A%2Fa+b%2Fx.md"
  );
});

test("crumbsOf starts at the root name and keeps the filesystem root", () => {
  const client = loadBundle().factory((name) => (name === "react" ? ReactStub : undefined));
  assert.deepEqual(client.crumbsOf("/a/b", "/a/b/c/d.txt"), ["b", "c", "d.txt"]);
  assert.deepEqual(client.crumbsOf("/", "/etc/hosts"), ["/", "etc", "hosts"]);
  assert.deepEqual(client.crumbsOf("C:/a", "C:/a/x.txt"), ["a", "x.txt"]);
});

test("formatBytes and colorOf behave", () => {
  const client = loadBundle().factory((name) => (name === "react" ? ReactStub : undefined));
  assert.equal(client.formatBytes(0), "0 B");
  assert.equal(client.formatBytes(1536), "1.5 KB");
  assert.equal(client.formatBytes(undefined), "");
  assert.equal(client.colorOf({ type: "directory" }), "var(--fe-muted)");
  assert.equal(client.colorOf({ type: "file", ext: "ts" }), "#4a90d9");
  assert.equal(client.colorOf({ type: "file", ext: "weird" }), "#8b949e");
});

test("renderMarkdown produces headings, lists, quotes and fences", () => {
  const client = loadBundle().factory((name) => (name === "react" ? ReactStub : undefined));
  const nodes = client.renderMarkdown("# Title\n\n- one\n- two\n\n> quoted\n\n```js\nconst a = 1;\n```\n", {
    routePath: "/api/file-explorer",
    baseDir: "/root/docs",
  });
  const kinds = nodes.map((node) => node.type);
  assert.deepEqual(kinds, ["h1", "ul", "blockquote", "pre"]);
  assert.equal(nodes[1].children.length, 2);
});

test("markdownTarget maps relative assets onto the raw route", () => {
  const client = loadBundle().factory((name) => (name === "react" ? ReactStub : undefined));
  assert.equal(client.markdownTarget("https://x.dev/a.png", "/root", "/api/file-explorer"), "https://x.dev/a.png");
  assert.equal(
    client.markdownTarget("./img/a.png", "/root/docs", "/api/file-explorer"),
    "/api/file-explorer?op=raw&path=%2Froot%2Fdocs%2Fimg%2Fa.png"
  );
});
