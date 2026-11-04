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

test("fileResourceAddress mirrors the shipped session address", () => {
  const client = loadBundle().factory((name) => (name === "react" ? ReactStub : undefined));
  assert.equal(
    client.fileResourceAddress("session-1", "D:\\codes\\a b\\x.md"),
    "dsh-resource://file/session/session-1/D:/codes/a%20b/x.md"
  );
  assert.equal(
    client.fileResourceAddress("s:1", "/home/u/a.md"),
    "dsh-resource://file/session/s:1//home/u/a.md"
  );
});

test("the right-panel bridge degrades instead of throwing", () => {
  const client = loadBundle().factory((name) => (name === "react" ? ReactStub : undefined));

  const opened = [];
  const bridge = client.createRightPanelBridge({
    sidebarRight: {
      commandTarget: () => ({ sessionId: "s1" }),
      openResource: (address) => opened.push(address),
    },
  });
  assert.equal(bridge.available, true);
  assert.equal(bridge.openInRightPanel("D:/a.md"), "opened");
  assert.deepEqual(opened, ["dsh-resource://file/session/s1/D:/a.md"]);

  // No mounted right column: the bridge returns to the conversation, asks the
  // layout to reveal the column, and reports `pending` while it retries.
  let revealed = 0;
  let selected = 0;
  const pending = client.createRightPanelBridge({
    sidebarRight: { commandTarget: () => null, openResource() {} },
    layout: {
      selectPanel() {
        selected += 1;
      },
      openRightbar() {
        revealed += 1;
      },
    },
  });
  const realSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = () => 0;
  try {
    assert.equal(pending.openInRightPanel("D:/a.md"), "pending");
  } finally {
    globalThis.setTimeout = realSetTimeout;
  }
  assert.equal(revealed, 1);
  assert.equal(selected, 1);

  const broken = client.createRightPanelBridge({
    sidebarRight: {
      commandTarget: () => ({ sessionId: "s1" }),
      openResource() {
        throw new Error("no surface");
      },
    },
  });
  assert.equal(broken.openInRightPanel("D:/a.md"), "failed");

  const missing = client.createRightPanelBridge({});
  assert.equal(missing.available, false);
  assert.equal(missing.openInRightPanel("D:/a.md"), "unavailable");
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

test("a linked badge image renders as a link wrapping the image component", () => {
  const client = loadBundle().factory((name) => (name === "react" ? ReactStub : undefined));
  const nodes = client.renderMarkdown("[![npm](https://img/badge.svg)](https://npm.example/pkg)", {
    routePath: "/api/file-explorer",
    baseDir: "/root",
  });
  const paragraph = nodes[0];
  assert.equal(paragraph.type, "p");
  const anchor = paragraph.children[0];
  assert.equal(anchor.type, "a");
  assert.equal(anchor.props.href, "https://npm.example/pkg");
  assert.equal(typeof anchor.children[0].type, "function", "the image must be rendered by the fallback component");
  assert.equal(anchor.children[0].props.src, "https://img/badge.svg");
});

test("a GitHub-style table renders a header and body cells", () => {
  const client = loadBundle().factory((name) => (name === "react" ? ReactStub : undefined));
  const nodes = client.renderMarkdown("| 列 A | 列 B |\n|---|---|\n| 1 | 2 |\n| 3 | **4** |\n", {
    routePath: "/api/file-explorer",
    baseDir: "/root",
  });
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].type, "div");
  assert.equal(nodes[0].props.className, "fe-md-table");
  const table = nodes[0].children[0];
  assert.equal(table.type, "table");
  const thead = table.children[0];
  const tbody = table.children[1];
  assert.equal(thead.children[0].children.length, 2);
  assert.equal(tbody.children.length, 2);
  assert.equal(tbody.children[0].children[0].children[0], "1");
});
