/**
 * The browser half of dsh-file-explorer.
 *
 * Two registrations:
 * - `sidebar.panellist` (id `file-explorer`): the rail icon. The sidebar owns
 *   the button; its id addresses the matching `main` panel.
 * - `main` (key `file-explorer`): the explorer page — root picker, lazy file
 *   tree, open-file tabs, and a text / Markdown / image preview.
 *
 * All data comes from the Host route `/api/file-explorer?op=...`; nothing here
 * touches the filesystem directly. Written as a hand-rolled ModuleLoader
 * factory so the package needs no build step.
 */
window.__ModuleLoader__.load({
  id: "@vfvrpq/dsh-file-explorer",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const React = require("react");
    const h = React.createElement;
    const { useState, useEffect, useMemo, useRef, useCallback } = React;

    /** Locale namespace. */
    const NS = "fileExplorer";
    /** Panel id: the `sidebar.panellist` cell id and the `main` slot key. */
    const PANEL_ID = "file-explorer";
    /** Route the Host half registers; the served page overrides it. */
    const DEFAULT_ROUTE = "/api/file-explorer";
    /** Persisted UI preferences. */
    const STORAGE_KEY = "dsh-file-explorer:ui";
    /** Code lines rendered at most; longer files are cut with a notice. */
    const MAX_ROWS = 4000;
    /** Tree width limits for the drag handle. */
    const MIN_TREE_WIDTH = 180;
    const MAX_TREE_WIDTH = 620;

    /* ------------------------------------------------------------------ */
    /* i18n                                                                */
    /* ------------------------------------------------------------------ */

    const zh = {
      panel: "文件浏览",
      title: "资源管理器",
      roots: "根目录",
      refresh: "刷新",
      search: "搜索文件",
      searchPlaceholder: "搜索文件名…",
      searching: "搜索中…",
      noResults: "没有匹配的文件",
      hiddenOn: "隐藏文件：显示",
      hiddenOff: "隐藏文件：隐藏",
      wrap: "自动换行",
      source: "源码",
      preview: "预览",
      close: "关闭",
      copyPath: "复制路径",
      copied: "已复制",
      loading: "加载中…",
      emptyFolder: "空文件夹",
      truncatedTree: "条目过多，仅显示前 2000 个",
      welcomeTitle: "选择文件开始预览",
      welcomeBody: "左侧是当前根目录的文件树。单击文件夹展开，单击文件在右侧预览。",
      welcomeHint: "支持文本、Markdown 与图片；二进制文件只显示元信息。",
      binaryTitle: "无法预览的二进制文件",
      binaryBody: "这个文件不是文本，也不是可内联预览的图片。",
      imageTooLarge: "图片超过原始字节上限，未加载",
      imageFailed: "图片加载失败",
      truncatedLabel: "已截断",
      truncatedRows: "文件较大，仅渲染前 4000 行",
      truncatedText: "仅预览前 {size}",
      lines: "行",
      loadError: "加载失败",
      retry: "重试",
      noRoots: "没有可浏览的根目录",
      kindWorkspace: "工作区",
      kindDefault: "默认目录",
      kindProcess: "进程目录",
      kindHome: "主目录",
      kindExtra: "自定义目录",
      closeAll: "关闭全部",
      open: "打开",
      statusReady: "就绪",
      rootLabel: "根目录",
      relative: "相对路径",
      treeResize: "拖动调整宽度",
      openRight: "在右侧打开",
      openWithApp: "用默认程序打开",
      openWithAppDone: "已交给系统默认程序",
      rightOpened: "已在右侧文档预览中打开",
      rightPending: "正在打开右侧面板…",
      rightNoSession: "右侧面板不可用：先打开一个会话",
      rightFailed: "右侧面板打开失败，已使用内嵌预览",
    };

    const en = {
      panel: "Explorer",
      title: "Explorer",
      roots: "Roots",
      refresh: "Refresh",
      search: "Search files",
      searchPlaceholder: "Search file names…",
      searching: "Searching…",
      noResults: "No matching files",
      hiddenOn: "Dotfiles: shown",
      hiddenOff: "Dotfiles: hidden",
      wrap: "Wrap lines",
      source: "Source",
      preview: "Preview",
      close: "Close",
      copyPath: "Copy path",
      copied: "Copied",
      loading: "Loading…",
      emptyFolder: "Empty folder",
      truncatedTree: "Too many entries; showing the first 2000",
      welcomeTitle: "Pick a file to preview",
      welcomeBody: "The tree on the left is the current root. Click a folder to expand it, a file to preview it here.",
      welcomeHint: "Text, Markdown and images are previewed; binaries show metadata only.",
      binaryTitle: "Binary file, not previewable",
      binaryBody: "This file is neither text nor an inline-previewable image.",
      imageTooLarge: "Image exceeds the raw byte limit and was not loaded",
      imageFailed: "Image failed to load",
      truncatedLabel: "truncated",
      truncatedRows: "Large file; rendering the first 4000 lines only",
      truncatedText: "Previewing the first {size}",
      lines: "lines",
      loadError: "Failed to load",
      retry: "Retry",
      noRoots: "No browsable root",
      kindWorkspace: "Workspace",
      kindDefault: "Default directory",
      kindProcess: "Process directory",
      kindHome: "Home",
      kindExtra: "Custom directory",
      closeAll: "Close all",
      open: "Open",
      statusReady: "Ready",
      rootLabel: "Root",
      relative: "Relative path",
      treeResize: "Drag to resize",
      openRight: "Open on the right",
      openWithApp: "Open with default app",
      openWithAppDone: "Handed to the system default app",
      rightOpened: "Opened in the right document preview",
      rightPending: "Opening the right panel…",
      rightNoSession: "Right panel unavailable: open a Session first",
      rightFailed: "Right panel failed; kept the inline preview",
    };

    /* ------------------------------------------------------------------ */
    /* host config                                                         */
    /* ------------------------------------------------------------------ */

    function hostConfig() {
      const raw = globalThis.__DSH_FILE_EXPLORER_CONFIG__;
      const object = typeof raw === "object" && raw !== null ? raw : {};
      return {
        routePath: typeof object.routePath === "string" && object.routePath !== "" ? object.routePath : DEFAULT_ROUTE,
        defaultShowHidden: object.defaultShowHidden === true,
        openInRightPanel: object.openInRightPanel === true,
        allowOpenWithDefaultApp: object.allowOpenWithDefaultApp !== false,
      };
    }

    /* ------------------------------------------------------------------ */
    /* style                                                               */
    /* ------------------------------------------------------------------ */

    const STYLE = [
      '[data-fe-root]{--fe-border:var(--dsw-alias-border-l1,rgba(0,0,0,.08));--fe-border2:var(--dsw-alias-border-l2,rgba(0,0,0,.14));--fe-label:var(--dsw-alias-label-primary,#1f2329);--fe-muted:var(--dsw-alias-label-secondary,#646a73);--fe-accent:var(--dsw-alias-brand-primary,#2c6ef2);--fe-layer:var(--dsw-alias-bg-layer-1,#fff);--fe-hover:color-mix(in srgb,var(--fe-muted) 12%,transparent);--fe-selected:color-mix(in srgb,var(--fe-accent) 14%,transparent);box-sizing:border-box;display:flex;flex-direction:column;height:100%;min-height:0;width:100%;background:var(--dsw-alias-bg-base,#fff);color:var(--fe-label);font-size:13px;line-height:1.5;overflow:hidden}',
      '[data-fe-root] *{box-sizing:border-box}',
      '[data-fe-root] .fe-head{display:flex;align-items:center;gap:8px;flex:none;height:38px;padding:0 12px;border-bottom:1px solid var(--fe-border)}',
      '[data-fe-root] .fe-head-title{font-size:13px;font-weight:600;white-space:nowrap}',
      '[data-fe-root] .fe-head-root{font-family:var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:10.5px;color:var(--fe-muted);max-width:52%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '[data-fe-root] .fe-head-spacer{flex:1 1 auto}',
      '[data-fe-root] .fe-search input::-webkit-search-cancel-button,[data-fe-root] .fe-search input::-webkit-search-decoration{-webkit-appearance:none;appearance:none}',
      '[data-fe-root] .fe-body{display:flex;flex:1 1 auto;min-height:0}',
      '[data-fe-root] .fe-side{display:flex;flex-direction:column;flex:none;width:var(--fe-tree-w,280px);min-width:0;border-right:1px solid var(--fe-border);background:var(--fe-layer);overflow:hidden}',
      '[data-fe-root] .fe-side-top{display:flex;flex-direction:column;gap:6px;flex:none;padding:8px 10px;border-bottom:1px solid var(--fe-border)}',
      '[data-fe-root] .fe-side-row{display:flex;align-items:center;gap:6px;min-width:0}',
      '[data-fe-root] .fe-select{flex:1 1 auto;min-width:0;appearance:none;border:1px solid var(--fe-border2);background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.03));color:var(--fe-label);border-radius:6px;padding:4px 8px;font:inherit;font-size:12px;cursor:pointer;outline:none}',
      '[data-fe-root] .fe-select:focus-visible{outline:1px solid var(--fe-accent);outline-offset:1px}',
      '[data-fe-root] .fe-iconbtn{flex:none;display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;border:1px solid transparent;border-radius:6px;background:transparent;color:var(--fe-muted);cursor:pointer;transition:background-color .15s ease,color .15s ease}',
      '[data-fe-root] .fe-iconbtn:hover{background:var(--fe-hover);color:var(--fe-label)}',
      '[data-fe-root] .fe-iconbtn[data-on="true"]{color:var(--fe-accent);background:var(--fe-selected)}',
      '[data-fe-root] .fe-iconbtn:focus-visible{outline:1px solid var(--fe-accent);outline-offset:1px}',
      '[data-fe-root] .fe-search{display:flex;align-items:center;gap:6px;border:1px solid var(--fe-border2);border-radius:6px;padding:0 8px;background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.03));min-width:0}',
      '[data-fe-root] .fe-search:focus-within{border-color:var(--fe-accent)}',
      '[data-fe-root] .fe-search input{flex:1 1 auto;min-width:0;border:0;background:transparent;color:var(--fe-label);font:inherit;font-size:12px;padding:5px 0;outline:none}',
      '[data-fe-root] .fe-search input::placeholder{color:var(--fe-muted)}',
      '[data-fe-root] .fe-tree{flex:1 1 auto;min-height:0;overflow:auto;padding:4px 0 12px;scrollbar-gutter:stable}',
      '[data-fe-root] .fe-row{display:flex;align-items:center;gap:4px;height:24px;padding-right:10px;cursor:pointer;white-space:nowrap;user-select:none;color:var(--fe-label)}',
      '[data-fe-root] .fe-row:hover{background:var(--fe-hover)}',
      '[data-fe-root] .fe-row.is-active{background:var(--fe-selected)}',
      '[data-fe-root] .fe-row:focus-visible{outline:1px solid var(--fe-accent);outline-offset:-1px}',
      '[data-fe-root] .fe-chev{flex:none;width:14px;height:14px;display:inline-flex;align-items:center;justify-content:center;color:var(--fe-muted)}',
      '[data-fe-root] .fe-chev::before{content:"";width:0;height:0;border-left:4px solid currentColor;border-top:4px solid transparent;border-bottom:4px solid transparent;transition:transform .12s ease}',
      '[data-fe-root] .fe-chev.is-open::before{transform:rotate(90deg)}',
      '[data-fe-root] .fe-chev.is-empty::before{display:none}',
      '[data-fe-root] .fe-ico{flex:none;width:16px;height:16px;display:inline-flex;align-items:center;justify-content:center}',
      '[data-fe-root] .fe-ext{font:600 8px/1 var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,monospace);letter-spacing:.02em;padding:0 2px;border-radius:3px;background:color-mix(in srgb,currentColor 16%,transparent);display:inline-flex;align-items:center;justify-content:center;min-width:15px;height:15px}',
      '[data-fe-root] .fe-name{overflow:hidden;text-overflow:ellipsis;font-size:12.5px}',
      '[data-fe-root] .fe-note{color:var(--fe-muted);font-size:11.5px;padding:4px 14px;white-space:pre-wrap}',
      '[data-fe-root] .fe-note.is-error{color:var(--dsw-alias-state-error-primary,#d32029)}',
      '[data-fe-root] .fe-resizer{flex:none;width:5px;cursor:col-resize;background:transparent;transition:background-color .15s ease}',
      '[data-fe-root] .fe-resizer:hover,[data-fe-root] .fe-resizer.is-drag{background:color-mix(in srgb,var(--fe-accent) 45%,transparent)}',
      '[data-fe-root] .fe-main{display:flex;flex-direction:column;flex:1 1 auto;min-width:0;min-height:0}',
      '[data-fe-root] .fe-tabs{display:flex;align-items:stretch;flex:none;min-height:36px;border-bottom:1px solid var(--fe-border);overflow-x:auto;overflow-y:hidden;scrollbar-width:thin}',
      '[data-fe-root] .fe-tab{display:inline-flex;align-items:center;gap:6px;max-width:230px;padding:0 8px 0 12px;border-right:1px solid var(--fe-border);color:var(--fe-muted);cursor:pointer;white-space:nowrap;font-size:12px;background:transparent;border-top:2px solid transparent}',
      '[data-fe-root] .fe-tab:hover{background:var(--fe-hover);color:var(--fe-label)}',
      '[data-fe-root] .fe-tab.is-active{background:var(--fe-layer);color:var(--fe-label);border-top-color:var(--fe-accent)}',
      '[data-fe-root] .fe-tab-name{overflow:hidden;text-overflow:ellipsis}',
      '[data-fe-root] .fe-tab-x{flex:none;display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border:0;border-radius:4px;background:transparent;color:inherit;cursor:pointer;opacity:.6;padding:0}',
      '[data-fe-root] .fe-tab-x:hover{background:var(--fe-hover);opacity:1}',
      '[data-fe-root] .fe-tabbar-end{display:flex;align-items:center;gap:2px;padding:0 8px;margin-left:auto;border-left:1px solid var(--fe-border);flex:none}',
      '[data-fe-root] .fe-doc{display:flex;flex-direction:column;flex:1 1 auto;min-height:0;position:relative;background:var(--dsw-alias-bg-layer-1,#fff)}',
      '[data-fe-root] .fe-doc-empty{flex:1 1 auto;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:32px;text-align:center;color:var(--fe-muted)}',
      '[data-fe-root] .fe-doc-empty h2{margin:0;font-size:15px;font-weight:600;color:var(--fe-label)}',
      '[data-fe-root] .fe-doc-empty p{margin:0;max-width:460px;font-size:12.5px;line-height:1.7}',
      '[data-fe-root] .fe-glyph{width:56px;height:56px;opacity:.5;margin-bottom:6px}',
      '[data-fe-root] .fe-crumbs{display:flex;align-items:center;gap:4px;flex:none;min-height:32px;padding:0 12px;border-bottom:1px solid var(--fe-border);color:var(--fe-muted);font-size:11.5px;white-space:nowrap;overflow:hidden}',
      '[data-fe-root] .fe-crumb{overflow:hidden;text-overflow:ellipsis}',
      '[data-fe-root] .fe-crumb:last-child{color:var(--fe-label)}',
      '[data-fe-root] .fe-crumb-sep{flex:none;opacity:.5}',
      '[data-fe-root] .fe-crumbs-spacer{flex:1 1 auto}',
      '[data-fe-root] .fe-code{flex:1 1 auto;min-height:0;overflow:auto;padding:8px 0 24px;font-family:var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:12.5px;line-height:1.6;scrollbar-gutter:stable}',
      '[data-fe-root] .fe-line{display:flex;min-width:max-content;padding-right:24px}',
      '[data-fe-root] .fe-line:hover{background:color-mix(in srgb,var(--fe-muted) 8%,transparent)}',
      '[data-fe-root] .fe-ln{flex:none;width:56px;padding-right:14px;text-align:right;color:var(--fe-muted);opacity:.55;user-select:none;font-variant-numeric:tabular-nums}',
      '[data-fe-root] .fe-lc{white-space:pre;flex:1 1 auto;min-width:0}',
      '[data-fe-root] .fe-code.is-wrap .fe-line{min-width:0}',
      '[data-fe-root] .fe-code.is-wrap .fe-lc{white-space:pre-wrap;overflow-wrap:anywhere}',
      '[data-fe-root] .fe-md{flex:1 1 auto;min-height:0;overflow:auto;padding:18px 24px 48px;font-size:13.5px;line-height:1.75;max-width:none}',
      '[data-fe-root] .fe-md h1,[data-fe-root] .fe-md h2,[data-fe-root] .fe-md h3,[data-fe-root] .fe-md h4,[data-fe-root] .fe-md h5,[data-fe-root] .fe-md h6{margin:18px 0 8px;line-height:1.35;font-weight:600}',
      '[data-fe-root] .fe-md h1{font-size:22px;margin-top:6px}',
      '[data-fe-root] .fe-md h2{font-size:18px;border-bottom:1px solid var(--fe-border);padding-bottom:4px}',
      '[data-fe-root] .fe-md h3{font-size:15.5px}',
      '[data-fe-root] .fe-md p{margin:8px 0}',
      '[data-fe-root] .fe-md ul,[data-fe-root] .fe-md ol{margin:8px 0;padding-left:22px}',
      '[data-fe-root] .fe-md li{margin:2px 0}',
      '[data-fe-root] .fe-md blockquote{margin:10px 0;padding:2px 12px;border-left:3px solid var(--fe-border2);color:var(--fe-muted)}',
      '[data-fe-root] .fe-md code{font-family:var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:12px;background:color-mix(in srgb,var(--fe-muted) 12%,transparent);border-radius:4px;padding:1px 5px}',
      '[data-fe-root] .fe-md pre{margin:10px 0;padding:10px 12px;border:1px solid var(--fe-border);border-radius:8px;background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.03));overflow:auto}',
      '[data-fe-root] .fe-md pre code{background:transparent;padding:0;font-size:12px;line-height:1.6}',
      '[data-fe-root] .fe-md hr{border:0;border-top:1px solid var(--fe-border2);margin:18px 0}',
      '[data-fe-root] .fe-md a{color:var(--fe-accent);text-decoration:none}',
      '[data-fe-root] .fe-md a:hover{text-decoration:underline}',
      '[data-fe-root] .fe-md img{max-width:100%;border-radius:8px;border:1px solid var(--fe-border)}',
      '[data-fe-root] .fe-image{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:20px;background-image:linear-gradient(45deg,var(--fe-hover) 25%,transparent 25%),linear-gradient(-45deg,var(--fe-hover) 25%,transparent 25%),linear-gradient(45deg,transparent 75%,var(--fe-hover) 75%),linear-gradient(-45deg,transparent 75%,var(--fe-hover) 75%);background-size:16px 16px;background-position:0 0,0 8px,8px -8px,-8px 0}',
      '[data-fe-root] .fe-image img{max-width:100%;max-height:100%;object-fit:contain;border-radius:6px;background:var(--dsw-alias-bg-layer-1,#fff);box-shadow:0 4px 24px rgba(0,0,0,.14)}',
      '[data-fe-root] .fe-image-meta{font-size:11.5px;color:var(--fe-muted);font-variant-numeric:tabular-nums}',
      '[data-fe-root] .fe-state{flex:1 1 auto;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:32px;text-align:center;color:var(--fe-muted)}',
      '[data-fe-root] .fe-state h3{margin:0;font-size:14px;font-weight:600;color:var(--fe-label)}',
      '[data-fe-root] .fe-state p{margin:0;max-width:420px;font-size:12.5px;line-height:1.7}',
      '[data-fe-root] .fe-btn{appearance:none;border:1px solid var(--fe-border2);border-radius:6px;padding:4px 12px;background:transparent;color:var(--fe-label);font:inherit;font-size:12px;cursor:pointer}',
      '[data-fe-root] .fe-btn:hover{background:var(--fe-hover)}',
      '[data-fe-root] .fe-status{display:flex;align-items:center;gap:10px;flex:none;height:26px;padding:0 12px;border-top:1px solid var(--fe-border);color:var(--fe-muted);font-size:11px;white-space:nowrap;overflow:hidden}',
      '[data-fe-root] .fe-status-path{overflow:hidden;text-overflow:ellipsis;font-family:var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:10.5px}',
      '[data-fe-root] .fe-status-meta{margin-left:auto;flex:none;display:flex;gap:10px;font-variant-numeric:tabular-nums}',
      '[data-fe-root] .fe-status-notice{flex:none;color:var(--fe-accent);overflow:hidden;text-overflow:ellipsis}',
      '[data-fe-root] .fe-warn{color:var(--dsw-alias-state-warn-primary,#b25e09)}',
      '[data-fe-doc-action].fe-open-app{display:inline-flex;align-items:center;gap:5px;height:24px;padding:0 8px;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.14));border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary,#1f2329);font:inherit;font-size:11.5px;line-height:1;cursor:pointer;white-space:nowrap}',
      '[data-fe-doc-action].fe-open-app:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}',
      '[data-fe-doc-action].fe-open-app:disabled{opacity:.55;cursor:default}',
      '[data-fe-doc-action].fe-open-app[data-fe-open-state="error"]{color:var(--dsw-alias-state-error-primary,#d32029);max-width:220px;overflow:hidden;text-overflow:ellipsis}',
      '[data-fe-doc-action].fe-open-app[data-fe-open-state="done"]{color:var(--dsw-alias-state-success-primary,#2f9e44)}',
      '@container (max-width:640px){[data-fe-root] .fe-side{width:200px}}',
    ].join("\n");

    function installStyle() {
      if (typeof document === "undefined") return;
      const tagId = "dsh-file-explorer/explorer.css";
      if (document.querySelector('style[data-plugin-css="' + tagId + '"]') !== null) return;
      const tag = document.createElement("style");
      tag.dataset.plugin = "dsh-file-explorer";
      tag.dataset.pluginCss = tagId;
      tag.textContent = STYLE;
      document.head.appendChild(tag);
    }

    /* ------------------------------------------------------------------ */
    /* transport                                                           */
    /* ------------------------------------------------------------------ */

    /** Build one route URL. */
    function apiUrl(routePath, op, params) {
      const search = new URLSearchParams();
      search.set("op", op);
      if (params !== undefined && params !== null) {
        for (const key of Object.keys(params)) {
          const value = params[key];
          if (value === undefined || value === null || value === "") continue;
          search.set(key, typeof value === "boolean" ? (value ? "1" : "0") : String(value));
        }
      }
      return routePath + "?" + search.toString();
    }

    /** Fetch one JSON answer, turning a failed answer into an Error. */
    async function request(routePath, op, params, signal) {
      const response = await fetch(apiUrl(routePath, op, params), {
        cache: "no-store",
        signal,
        headers: { accept: "application/json" },
      });
      let body = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      if (!response.ok || body === null || body.ok !== true) {
        const message = body !== null && typeof body.error === "string" ? body.error : "HTTP " + response.status;
        const error = new Error(message);
        error.status = response.status;
        throw error;
      }
      return body;
    }

    /* ------------------------------------------------------------------ */
    /* right-sidebar document preview                                      */
    /* ------------------------------------------------------------------ */

    /** Encode one address segment, keeping `:` literal so drive letters survive. */
    function encodeSegment(segment) {
      return encodeURIComponent(segment).replace(/%3A/gi, ":");
    }

    /** POST one file to the Host's open-with-default-app operation. */
    async function postOpen(routePath, filePath) {
      try {
        const response = await fetch(apiUrl(routePath, "open", { path: filePath }), {
          method: "POST",
          cache: "no-store",
          headers: { accept: "application/json" },
        });
        const body = await response.json().catch(() => null);
        if (!response.ok || body === null || body.ok !== true) {
          const message = body !== null && typeof body.error === "string" ? body.error : "HTTP " + response.status;
          return { ok: false, error: message };
        }
        return { ok: true };
      } catch (error) {
        return { ok: false, error: String((error && error.message) || error) };
      }
    }

    /**
     * The `dsh-resource://file/...` address the right sidebar's file provider
     * reads. Mirrors the shipped `sessionFileAddress` so an absolute path lands
     * in the Session's address even when it sits outside that workspace.
     * @param sessionId - the Session whose Host workspace resolves the path.
     * @param filePath - absolute path in either separator spelling.
     * @returns the resource address.
     */
    function fileResourceAddress(sessionId, filePath) {
      const normalized = String(filePath).replaceAll("\\", "/").replace(/^(?:\.\/)+/, "");
      const encoded = normalized.split("/").map(encodeSegment).join("/");
      return "dsh-resource://file/session/" + encodeSegment(String(sessionId)) + "/" + encoded;
    }

    /**
     * Bridge to the built-in right-panel document preview.
     *
     * The controller is session-scoped: `commandTarget(null)` names the Session
     * whose right column is on screen, and `openResource` then reveals that
     * column with the file. Anything unexpected degrades to a status string, so
     * the caller can keep the in-panel preview as the fallback.
     * @param ctx - client root context.
     * @param enabled - configuration switch.
     * @returns `{ available, openInRightPanel(path) }`.
     */
    function createRightPanelBridge(ctx) {
      const service = ctx.sidebarRight;
      const usable =
        service !== undefined &&
        typeof service.commandTarget === "function" &&
        typeof service.openResource === "function";

      /** The session whose right column is on screen, or undefined. */
      const screenTarget = () => {
        if (!usable) return undefined;
        try {
          const target = service.commandTarget(null);
          return target !== null && target !== undefined && typeof target.sessionId === "string" ? target : undefined;
        } catch {
          return undefined;
        }
      };

      const place = (sessionId, filePath) => {
        service.openResource(fileResourceAddress(sessionId, filePath));
      };

      /** Reveal the conversation's right column, which owns the document preview. */
      const reveal = () => {
        // The column lives on the conversation surface: while a global panel is
        // selected it is not mounted, so returning to the conversation comes first.
        try {
          ctx.layout.selectPanel(null);
        } catch {
          // Layout refuses outside a Session; the retry below simply gives up.
        }
        try {
          ctx.layout.openRightbar(true, false);
        } catch {
          // Same: nothing to reveal without a Session.
        }
      };

      /** Retry placing the resource until the column exists, then stop. */
      const retry = (filePath, attempt) => {
        const target = screenTarget();
        if (target !== undefined) {
          try {
            place(target.sessionId, filePath);
          } catch {
            // Best effort: the in-panel preview already shows the file.
          }
          return;
        }
        if (attempt >= 6) return;
        globalThis.setTimeout?.(() => retry(filePath, attempt + 1), 220);
      };

      return {
        available: usable,
        openInRightPanel(filePath) {
          if (!usable) return "unavailable";
          const target = screenTarget();
          if (target !== undefined) {
            try {
              place(target.sessionId, filePath);
              return "opened";
            } catch {
              return "failed";
            }
          }
          reveal();
          retry(filePath, 0);
          return "pending";
        },
      };
    }

    /* ------------------------------------------------------------------ */
    /* formatting helpers                                                  */
    /* ------------------------------------------------------------------ */

    function basenameOf(path) {
      if (typeof path !== "string") return "";
      const slashed = path.replaceAll("\\", "/").replace(/\/+$/, "");
      return slashed.slice(slashed.lastIndexOf("/") + 1);
    }

    function dirnameOf(path) {
      if (typeof path !== "string") return "";
      const slashed = path.replaceAll("\\", "/").replace(/\/+$/, "");
      const cut = slashed.lastIndexOf("/");
      return cut <= 0 ? slashed : slashed.slice(0, cut);
    }

    /** Slashes forward, trailing separators gone, the filesystem root kept as "/". */
    function trimPath(path) {
      const slashed = String(path).replaceAll("\\", "/");
      const trimmed = slashed.replace(/\/+$/, "");
      return trimmed === "" ? "/" : trimmed;
    }

    /** Root-relative crumbs; the first crumb is the root's own name. */
    function crumbsOf(root, path) {
      const normalizedRoot = trimPath(root);
      const normalizedPath = trimPath(path);
      const rootName = basenameOf(normalizedRoot) || normalizedRoot;
      if (normalizedPath === normalizedRoot) return [rootName];
      const prefix = normalizedRoot === "/" ? "/" : normalizedRoot + "/";
      if (!normalizedPath.startsWith(prefix)) return normalizedPath.split("/");
      return [rootName].concat(normalizedPath.slice(prefix.length).split("/"));
    }

    function formatBytes(bytes) {
      if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) return "";
      const units = ["B", "KB", "MB", "GB", "TB"];
      let value = bytes;
      let unit = 0;
      while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
      }
      return (unit === 0 ? String(Math.round(value)) : value.toFixed(value >= 100 ? 0 : 1)) + " " + units[unit];
    }

    const EXT_COLORS = {
      js: "#e0b341", mjs: "#e0b341", cjs: "#e0b341", jsx: "#e0b341", ts: "#4a90d9", tsx: "#4a90d9",
      json: "#d4a72c", jsonc: "#d4a72c", lock: "#8b949e",
      md: "#4aa3df", mdx: "#4aa3df", markdown: "#4aa3df",
      css: "#c76ddc", scss: "#c76ddc", less: "#c76ddc", sass: "#c76ddc",
      html: "#e07b53", htm: "#e07b53", vue: "#42b883", svelte: "#ff3e00", astro: "#ff5d01",
      py: "#4b8bbe", rb: "#cc342d", php: "#777bb4", lua: "#4b8bbe",
      go: "#3fb6c9", rs: "#c07a4a", java: "#c96f5b", kt: "#a97bff", swift: "#f05138", dart: "#40c4ff",
      c: "#7f8ea3", h: "#7f8ea3", cc: "#7f8ea3", cpp: "#7f8ea3", hpp: "#7f8ea3", cs: "#6ba368",
      sh: "#6cc36c", bash: "#6cc36c", zsh: "#6cc36c", ps1: "#5391c9", bat: "#6cc36c", cmd: "#6cc36c",
      yml: "#a58cd6", yaml: "#a58cd6", toml: "#a58cd6", ini: "#a58cd6", conf: "#a58cd6", env: "#a58cd6",
      png: "#d97aa6", jpg: "#d97aa6", jpeg: "#d97aa6", gif: "#d97aa6", webp: "#d97aa6", svg: "#d97aa6",
      ico: "#d97aa6", avif: "#d97aa6", bmp: "#d97aa6",
      pdf: "#d05b5b", zip: "#b08a55", gz: "#b08a55", tar: "#b08a55", rar: "#b08a55", "7z": "#b08a55",
      mp4: "#c98bc9", mov: "#c98bc9", mkv: "#c98bc9", avi: "#c98bc9", webm: "#c98bc9",
      mp3: "#7fc7a1", wav: "#7fc7a1", flac: "#7fc7a1", m4a: "#7fc7a1",
      txt: "#8b949e", log: "#8b949e", csv: "#6ba368", sql: "#d4a72c", xml: "#e07b53",
    };

    function colorOf(entry) {
      if (entry.type === "directory") return "var(--fe-muted)";
      const color = EXT_COLORS[String(entry.ext || "").toLocaleLowerCase()];
      return typeof color === "string" ? color : "#8b949e";
    }

    function isMarkdownPath(path) {
      const ext = String(path).slice(String(path).lastIndexOf(".") + 1).toLocaleLowerCase();
      return ext === "md" || ext === "mdx" || ext === "markdown";
    }

    /* ------------------------------------------------------------------ */
    /* glyphs                                                              */
    /* ------------------------------------------------------------------ */

    function FolderGlyph(props) {
      const open = props.open === true;
      return h(
        "svg",
        { width: 15, height: 15, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.3, strokeLinejoin: "round", "aria-hidden": true },
        open
          ? h("path", { d: "M1.75 4.25h4.1l1.3 1.5h7.1v7.5h-12.5z" })
          : h("path", { d: "M1.75 4.25h4.1l1.3 1.5h7.1v7.5h-12.5z" })
      );
    }

    function FileGlyph(props) {
      return h(
        "svg",
        { width: 15, height: 15, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.3, strokeLinejoin: "round", "aria-hidden": true, style: { color: props.color } },
        h("path", { d: "M4 1.75h5.2L13 5.4v8.85H4z" }),
        h("path", { d: "M9.1 1.75v3.75H13" })
      );
    }

    function DocGlyph() {
      return h(
        "svg",
        { className: "fe-glyph", viewBox: "0 0 48 48", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinejoin: "round", "aria-hidden": true },
        h("path", { d: "M12 6h16l8 8v28H12z" }),
        h("path", { d: "M28 6v8h8" }),
        h("path", { d: "M18 22h12M18 28h12M18 34h7" })
      );
    }

    function SearchGlyph() {
      return h(
        "svg",
        { width: 13, height: 13, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.5, "aria-hidden": true },
        h("circle", { cx: 7, cy: 7, r: 4.2 }),
        h("path", { d: "M10.2 10.2 14 14" })
      );
    }

    function RefreshGlyph() {
      return h(
        "svg",
        { width: 14, height: 14, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", "aria-hidden": true },
        h("path", { d: "M13 8a5 5 0 1 1-1.5-3.55" }),
        h("path", { d: "M13 2.5v3h-3" })
      );
    }

    function EyeGlyph(props) {
      return h(
        "svg",
        { width: 14, height: 14, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", "aria-hidden": true },
        h("path", { d: "M1.5 8S3.8 3.8 8 3.8 14.5 8 14.5 8 12.2 12.2 8 12.2 1.5 8 1.5 8z" }),
        h("circle", { cx: 8, cy: 8, r: 1.9 }),
        props.off === true ? h("path", { d: "M2.5 13.5 13.5 2.5" }) : null
      );
    }

    function WrapGlyph() {
      return h(
        "svg",
        { width: 14, height: 14, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", "aria-hidden": true },
        h("path", { d: "M2 4h12M2 8h8.5a2 2 0 0 1 0 4H8M2 12h3" }),
        h("path", { d: "M9 6l-2 2 2 2" })
      );
    }

    function OpenExternalGlyph() {
      return h(
        "svg",
        { width: 13, height: 13, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true },
        h("path", { d: "M9 2.5h4.5V7" }),
        h("path", { d: "M13.5 2.5 7.5 8.5" }),
        h("path", { d: "M11.5 9.5v3.2a.8.8 0 0 1-.8.8H3.3a.8.8 0 0 1-.8-.8V5.3a.8.8 0 0 1 .8-.8h3.2" })
      );
    }

    function CloseGlyph() {
      return h(
        "svg",
        { width: 10, height: 10, viewBox: "0 0 10 10", fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", "aria-hidden": true },
        h("path", { d: "M2 2l6 6M8 2l-6 6" })
      );
    }

    /* ------------------------------------------------------------------ */
    /* markdown                                                            */
    /* ------------------------------------------------------------------ */

    const INLINE_PATTERN = /(!\[[^\]]*\]\([^)]*\)|\[[^\]]*\]\([^)]*\)|`[^`]*`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|~~[^~]+~~)/g;

    /** Resolve a Markdown target: absolute stays, relative maps onto the raw route. */
    function markdownTarget(url, baseDir, routePath) {
      if (/^(?:https?:|data:|mailto:|#)/i.test(url)) return url;
      const cleaned = url.replace(/^\.\//, "").replace(/^\/+/, "");
      const absolute = baseDir === "" ? cleaned : baseDir + "/" + cleaned;
      return apiUrl(routePath, "raw", { path: absolute });
    }

    /** Inline Markdown spans. */
    function inlineNodes(text, ctx) {
      const nodes = [];
      let last = 0;
      let index = 0;
      INLINE_PATTERN.lastIndex = 0;
      let match = INLINE_PATTERN.exec(text);
      while (match !== null) {
        if (match.index > last) nodes.push(text.slice(last, match.index));
        const token = match[0];
        const key = "in" + index;
        const image = /^!\[([^\]]*)\]\(([^)\s]*)/.exec(token);
        const link = /^\[([^\]]*)\]\(([^)\s]*)/.exec(token);
        if (image !== null) {
          nodes.push(h("img", { key, src: markdownTarget(image[2], ctx.baseDir, ctx.routePath), alt: image[1] }));
        } else if (link !== null) {
          nodes.push(
            h("a", { key, href: markdownTarget(link[2], ctx.baseDir, ctx.routePath), target: "_blank", rel: "noreferrer noopener" }, link[1])
          );
        } else if (token.startsWith("`")) {
          nodes.push(h("code", { key }, token.slice(1, -1)));
        } else if (token.startsWith("**") || token.startsWith("__")) {
          nodes.push(h("strong", { key }, token.slice(2, -2)));
        } else if (token.startsWith("~~")) {
          nodes.push(h("del", { key }, token.slice(2, -2)));
        } else {
          nodes.push(h("em", { key }, token.slice(1, -1)));
        }
        last = match.index + token.length;
        index += 1;
        match = INLINE_PATTERN.exec(text);
      }
      if (last < text.length) nodes.push(text.slice(last));
      return nodes;
    }

    function startsBlock(line) {
      return (
        /^\s*(#{1,6})\s+/.test(line) ||
        /^\s*```/.test(line) ||
        /^\s*>/.test(line) ||
        /^\s*([-*+]|\d+\.)\s+/.test(line) ||
        /^\s*([-*_])\1{2,}\s*$/.test(line)
      );
    }

    /** A deliberately small Markdown subset: headings, lists, quotes, fences, rules. */
    function renderMarkdown(text, ctx) {
      const lines = String(text).split("\n");
      const blocks = [];
      let index = 0;
      let key = 0;
      while (index < lines.length) {
        const line = lines[index];
        if (/^\s*```/.test(line)) {
          const fence = line.trim().slice(3).trim();
          const body = [];
          index += 1;
          while (index < lines.length && !/^\s*```/.test(lines[index])) {
            body.push(lines[index]);
            index += 1;
          }
          index += 1;
          blocks.push(h("pre", { key: "b" + key }, h("code", { "data-lang": fence }, body.join("\n"))));
          key += 1;
          continue;
        }
        const heading = /^(#{1,6})\s+(.*)$/.exec(line);
        if (heading !== null) {
          const level = Math.min(heading[1].length, 6);
          blocks.push(h("h" + level, { key: "b" + key }, inlineNodes(heading[2], ctx)));
          key += 1;
          index += 1;
          continue;
        }
        if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
          blocks.push(h("hr", { key: "b" + key }));
          key += 1;
          index += 1;
          continue;
        }
        if (/^\s*>/.test(line)) {
          const quoted = [];
          while (index < lines.length && /^\s*>/.test(lines[index])) {
            quoted.push(lines[index].replace(/^\s*>\s?/, ""));
            index += 1;
          }
          blocks.push(h("blockquote", { key: "b" + key }, h("p", null, inlineNodes(quoted.join(" "), ctx))));
          key += 1;
          continue;
        }
        if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
          const ordered = /^\s*\d+\./.test(line);
          const items = [];
          while (index < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[index])) {
            items.push(lines[index].replace(/^\s*([-*+]|\d+\.)\s+/, ""));
            index += 1;
          }
          blocks.push(
            h(
              ordered ? "ol" : "ul",
              { key: "b" + key },
              items.map((item, itemIndex) => h("li", { key: "li" + itemIndex }, inlineNodes(item, ctx)))
            )
          );
          key += 1;
          continue;
        }
        if (line.trim() === "") {
          index += 1;
          continue;
        }
        const paragraph = [];
        while (index < lines.length && lines[index].trim() !== "" && !startsBlock(lines[index])) {
          paragraph.push(lines[index]);
          index += 1;
        }
        if (paragraph.length === 0) {
          // A line that starts a block we do not model: consume it as text.
          paragraph.push(lines[index]);
          index += 1;
        }
        blocks.push(h("p", { key: "b" + key }, inlineNodes(paragraph.join(" "), ctx)));
        key += 1;
      }
      return blocks;
    }

    /* ------------------------------------------------------------------ */
    /* explorer state                                                      */
    /* ------------------------------------------------------------------ */

    function readStored() {
      try {
        const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
        if (typeof raw !== "string" || raw === "") return {};
        const parsed = JSON.parse(raw);
        return typeof parsed === "object" && parsed !== null ? parsed : {};
      } catch {
        return {};
      }
    }

    function writeStored(patch) {
      try {
        const merged = Object.assign({}, readStored(), patch);
        globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(merged));
      } catch {
        // A browser with storage disabled simply forgets the preferences.
      }
    }

    /** All explorer state and actions; the page renders from this. */
    function useExplorer(routePath, bridge, t, autoOpen, canOpenWithApp) {
      const stored = useRef(readStored()).current;
      const storedRoot = typeof stored.root === "string" ? stored.root : "";
      const restoredTabs =
        stored.tabsRoot === storedRoot && Array.isArray(stored.tabs)
          ? stored.tabs.filter((entry) => typeof entry === "string")
          : [];
      const [roots, setRoots] = useState([]);
      const [root, setRoot] = useState(storedRoot);
      const [rootsToken, setRootsToken] = useState(0);
      const [rootsError, setRootsError] = useState("");
      const [dirs, setDirs] = useState({});
      const [expanded, setExpanded] = useState(() => (storedRoot !== "" ? { [storedRoot]: true } : {}));
      const [showHidden, setShowHidden] = useState(stored.hidden === true);
      const [wrap, setWrap] = useState(stored.wrap === true);
      const [treeWidth, setTreeWidth] = useState(
        typeof stored.width === "number" && stored.width >= MIN_TREE_WIDTH && stored.width <= MAX_TREE_WIDTH
          ? stored.width
          : 280
      );
      const [tabs, setTabs] = useState(restoredTabs);
      const [active, setActive] = useState(
        typeof stored.active === "string" && restoredTabs.includes(stored.active) ? stored.active : null
      );
      const [doc, setDoc] = useState({ state: "idle" });
      const [reloadToken, setReloadToken] = useState(0);
      const [query, setQuery] = useState("");
      const [hits, setHits] = useState(null);
      const [searching, setSearching] = useState(false);
      const [markdownPreview, setMarkdownPreview] = useState(true);
      const [copied, setCopied] = useState(false);
      const [notice, setNotice] = useState("");

      /* roots ---------------------------------------------------------- */
      useEffect(() => {
        let cancelled = false;
        setRootsError("");
        request(routePath, "roots")
          .then((body) => {
            if (cancelled) return;
            const list = Array.isArray(body.roots) ? body.roots : [];
            setRoots(list);
            const known = list.some((entry) => entry.path === storedRoot);
            if (!known) {
              setTabs([]);
              setActive(null);
            }
            setRoot((current) => {
              if (current !== "" && list.some((entry) => entry.path === current)) return current;
              const fallback = known ? storedRoot : body.defaultRoot || (list[0] && list[0].path) || "";
              return fallback;
            });
          })
          .catch((error) => {
            if (!cancelled) setRootsError(String(error.message || error));
          });
        return () => {
          cancelled = true;
        };
      }, [routePath, storedRoot, rootsToken]);

      /* one directory -------------------------------------------------- */
      const loadDir = useCallback(
        async (path) => {
          setDirs((previous) => {
            if (previous[path] !== undefined && previous[path].state === "loading") return previous;
            return Object.assign({}, previous, { [path]: { state: "loading" } });
          });
          try {
            const body = await request(routePath, "list", { path, hidden: showHidden });
            setDirs((previous) =>
              Object.assign({}, previous, {
                [path]: {
                  state: "ready",
                  entries: Array.isArray(body.entries) ? body.entries : [],
                  truncated: body.truncated === true,
                },
              })
            );
          } catch (error) {
            setDirs((previous) => Object.assign({}, previous, { [path]: { state: "error", error: String(error.message || error) } }));
          }
        },
        [routePath, showHidden]
      );

      useEffect(() => {
        if (root === "") return;
        setExpanded((previous) => (previous[root] === true ? previous : Object.assign({}, previous, { [root]: true })));
      }, [root]);

      useEffect(() => {
        for (const path of Object.keys(expanded)) {
          if (dirs[path] === undefined) void loadDir(path);
        }
      }, [expanded, dirs, loadDir]);

      /* document ------------------------------------------------------- */
      useEffect(() => {
        if (active === null) {
          setDoc({ state: "idle" });
          return undefined;
        }
        const controller = new AbortController();
        setDoc({ state: "loading", path: active });
        request(routePath, "read", { path: active }, controller.signal)
          .then((body) => {
            if (!controller.signal.aborted) setDoc({ state: "ready", data: body });
          })
          .catch((error) => {
            if (controller.signal.aborted) return;
            setDoc({ state: "error", error: String(error.message || error) });
          });
        return () => controller.abort();
      }, [active, reloadToken, routePath]);

      /* search --------------------------------------------------------- */
      useEffect(() => {
        const text = query.trim();
        if (text === "" || root === "") {
          setHits(null);
          setSearching(false);
          return undefined;
        }
        const controller = new AbortController();
        setSearching(true);
        const timer = setTimeout(() => {
          request(routePath, "search", { path: root, q: text, hidden: showHidden }, controller.signal)
            .then((body) => {
              if (controller.signal.aborted) return;
              setHits({ hits: Array.isArray(body.hits) ? body.hits : [], truncated: body.truncated === true });
            })
            .catch((error) => {
              if (controller.signal.aborted) return;
              setHits({ hits: [], error: String(error.message || error) });
            })
            .finally(() => {
              if (!controller.signal.aborted) setSearching(false);
            });
        }, 250);
        return () => {
          clearTimeout(timer);
          controller.abort();
        };
      }, [query, root, showHidden, routePath]);

      /* remember the root and the open tabs ---------------------------- */
      useEffect(() => {
        if (root !== "") writeStored({ root });
      }, [root]);

      useEffect(() => {
        if (root === "") return;
        writeStored({ tabs, active, tabsRoot: root });
      }, [tabs, active, root]);

      /* actions -------------------------------------------------------- */
      const toggleDir = useCallback((path) => {
        setExpanded((previous) => {
          const next = Object.assign({}, previous);
          if (next[path] === true) delete next[path];
          else next[path] = true;
          return next;
        });
      }, []);

      const openFile = useCallback(
        (path) => {
          setTabs((previous) => (previous.includes(path) ? previous : previous.concat([path])));
          setActive(path);
          // Optionally hand the file straight to the right-sidebar document
          // preview; a failure there is silent because the in-panel preview
          // already shows it and stays readable either way.
          if (autoOpen && bridge.available) bridge.openInRightPanel(path);
        },
        [bridge, autoOpen]
      );

      const flash = useCallback((text) => {
        setNotice(text);
        globalThis.setTimeout?.(() => setNotice(""), 2600);
      }, []);

      const openRight = useCallback(
        (path) => {
          if (path === null || path === undefined) return;
          const status = bridge.openInRightPanel(path);
          flash(
            status === "opened"
              ? t("rightOpened")
              : status === "pending"
                ? t("rightPending")
                : status === "unavailable"
                  ? t("rightNoSession")
                  : t("rightFailed")
          );
        },
        [bridge, flash, t]
      );

      /**
       * Hand the active file to the OS default application. POST-only on the
       * Host: the route refuses GET so a prefetch can never launch a program.
       */
      const openWithApp = useCallback(
        async (path) => {
          if (path === null || path === undefined) return;
          const result = await postOpen(routePath, path);
          flash(result.ok ? t("openWithAppDone") : result.error);
        },
        [routePath, flash, t]
      );

      const closeTab = useCallback(
        (path) => {
          const index = tabs.indexOf(path);
          const next = tabs.filter((entry) => entry !== path);
          setTabs(next);
          if (active === path) setActive(next.length === 0 ? null : next[Math.min(index, next.length - 1)]);
        },
        [tabs, active]
      );

      const closeAll = useCallback(() => {
        setTabs([]);
        setActive(null);
      }, []);

      const changeRoot = useCallback((next) => {
        setRoot(next);
        setExpanded({ [next]: true });
        setDirs({});
        setTabs([]);
        setActive(null);
        setQuery("");
        setHits(null);
      }, []);

      const refreshAll = useCallback(() => {
        setDirs({});
        setReloadToken((token) => token + 1);
      }, []);

      const retryRoots = useCallback(() => {
        setRootsToken((token) => token + 1);
      }, []);

      const toggleHidden = useCallback(() => {
        const next = !showHidden;
        setShowHidden(next);
        setDirs({});
        writeStored({ hidden: next });
      }, [showHidden]);

      const toggleWrap = useCallback(() => {
        const next = !wrap;
        setWrap(next);
        writeStored({ wrap: next });
      }, [wrap]);

      const resizeTree = useCallback((width) => {
        const clamped = Math.min(Math.max(width, MIN_TREE_WIDTH), MAX_TREE_WIDTH);
        setTreeWidth(clamped);
        writeStored({ width: clamped });
      }, []);

      const copyPath = useCallback((path) => {
        try {
          void globalThis.navigator?.clipboard?.writeText(path);
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        } catch {
          // Clipboard access can be denied; the button is a convenience only.
        }
      }, []);

      return {
        roots,
        rootsError,
        root,
        dirs,
        expanded,
        showHidden,
        wrap,
        treeWidth,
        tabs,
        active,
        doc,
        query,
        hits,
        searching,
        markdownPreview,
        copied,
        notice,
        routePath,
        bridge,
        canOpenWithApp: canOpenWithApp === true,
        setQuery,
        setMarkdownPreview,
        toggleDir,
        openFile,
        openRight,
        openWithApp,
        closeTab,
        closeAll,
        changeRoot,
        refreshAll,
        retryRoots,
        toggleHidden,
        toggleWrap,
        resizeTree,
        copyPath,
      };
    }

    /* ------------------------------------------------------------------ */
    /* tree                                                                */
    /* ------------------------------------------------------------------ */

    function TreeRow(props) {
      const { entry, depth, explorer, t } = props;
      const isDir = entry.type === "directory";
      const open = isDir && explorer.expanded[entry.path] === true;
      const active = !isDir && explorer.active === entry.path;
      const activate = () => {
        if (isDir) explorer.toggleDir(entry.path);
        else explorer.openFile(entry.path);
      };
      return h(
        React.Fragment,
        null,
        h(
          "div",
          {
            className: "fe-row" + (active ? " is-active" : ""),
            style: { paddingLeft: 8 + depth * 13 },
            title: entry.path,
            role: "button",
            tabIndex: 0,
            onClick: activate,
            onKeyDown: (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                activate();
              }
            },
          },
          h("span", { className: "fe-chev" + (isDir ? (open ? " is-open" : "") : " is-empty") }),
          h(
            "span",
            { className: "fe-ico", style: { color: colorOf(entry) } },
            isDir ? h(FolderGlyph, { open }) : entry.ext === "" ? h(FileGlyph, {}) : h("span", { className: "fe-ext" }, entry.ext.slice(0, 3).toUpperCase())
          ),
          h("span", { className: "fe-name" }, entry.name)
        ),
        isDir && open ? h(TreeBranch, { path: entry.path, depth: depth + 1, explorer, t }) : null
      );
    }

    function TreeBranch(props) {
      const { path, depth, explorer, t } = props;
      if (path === undefined || path === null || path === "") return null;
      const node = explorer.dirs[path];
      if (node === undefined || node.state === "loading") {
        return h("div", { className: "fe-note", style: { paddingLeft: 14 + depth * 13 } }, t("loading"));
      }
      if (node.state === "error") {
        return h("div", { className: "fe-note is-error", style: { paddingLeft: 14 + depth * 13 } }, node.error);
      }
      if (node.entries.length === 0) {
        return h("div", { className: "fe-note", style: { paddingLeft: 14 + depth * 13 } }, t("emptyFolder"));
      }
      const rows = node.entries.map((entry) => h(TreeRow, { key: entry.path, entry, depth, explorer, t }));
      if (node.truncated === true) {
        rows.push(h("div", { key: "__truncated", className: "fe-note", style: { paddingLeft: 14 + depth * 13 } }, t("truncatedTree")));
      }
      return h(React.Fragment, null, rows);
    }

    function SearchResults(props) {
      const { explorer, t } = props;
      const result = explorer.hits;
      if (explorer.searching && result === null) return h("div", { className: "fe-note" }, t("searching"));
      if (result === null) return null;
      if (typeof result.error === "string") return h("div", { className: "fe-note is-error" }, result.error);
      if (result.hits.length === 0) return h("div", { className: "fe-note" }, t("noResults"));
      const rows = result.hits.map((hit) =>
        h(
          "div",
          {
            key: hit.path,
            className: "fe-row" + (explorer.active === hit.path ? " is-active" : ""),
            title: hit.path,
            role: "button",
            tabIndex: 0,
            onClick: () => explorer.openFile(hit.path),
            onKeyDown: (event) => {
              if (event.key === "Enter") explorer.openFile(hit.path);
            },
          },
          h("span", { className: "fe-chev is-empty" }),
          h(
            "span",
            { className: "fe-ico", style: { color: colorOf(hit) } },
            hit.ext === "" ? h(FileGlyph, {}) : h("span", { className: "fe-ext" }, hit.ext.slice(0, 3).toUpperCase())
          ),
          h("span", { className: "fe-name" }, hit.rel)
        )
      );
      if (result.truncated === true) rows.push(h("div", { key: "__more", className: "fe-note" }, "…"));
      return h(React.Fragment, null, rows);
    }

    /* ------------------------------------------------------------------ */
    /* document bodies                                                     */
    /* ------------------------------------------------------------------ */

    function TextBody(props) {
      const { data, wrap, t } = props;
      const totalLines = useMemo(() => String(data.text || "").split("\n").length, [data.text]);
      const rows = useMemo(() => {
        const lines = String(data.text || "").split("\n");
        const capped = lines.length > MAX_ROWS ? lines.slice(0, MAX_ROWS) : lines;
        return capped.map((line, index) =>
          h(
            "div",
            { className: "fe-line", key: index },
            h("span", { className: "fe-ln" }, index + 1),
            h("span", { className: "fe-lc" }, line === "" ? "\u00a0" : line)
          )
        );
      }, [data.text]);
      return h(
        React.Fragment,
        null,
        totalLines > MAX_ROWS
          ? h("div", { className: "fe-note fe-warn", style: { padding: "6px 12px" } }, t("truncatedRows"))
          : null,
        h("div", { className: "fe-code" + (wrap ? " is-wrap" : "") }, rows)
      );
    }

    function MarkdownBody(props) {
      const { data, routePath, baseDir } = props;
      const nodes = useMemo(
        () => renderMarkdown(data.text || "", { routePath, baseDir }),
        [data.text, routePath, baseDir]
      );
      return h("div", { className: "fe-md" }, nodes);
    }

    function ImageBody(props) {
      const { data, routePath, t } = props;
      const [failed, setFailed] = useState(false);
      const src = apiUrl(routePath, "raw", { path: data.path });
      return h(
        "div",
        { className: "fe-image" },
        failed
          ? h("div", { className: "fe-state" }, h("h3", null, t("imageFailed")), h("p", null, basenameOf(data.path)))
          : h("img", { src, alt: basenameOf(data.path), onError: () => setFailed(true) }),
        h("div", { className: "fe-image-meta" }, formatBytes(data.bytes) + (data.mime ? " · " + data.mime : ""))
      );
    }

    function BinaryBody(props) {
      const { data, t } = props;
      return h(
        "div",
        { className: "fe-state" },
        h(FileGlyph, { color: "var(--fe-muted)" }),
        h("h3", null, t("binaryTitle")),
        h("p", null, t("binaryBody")),
        h("p", null, basenameOf(data.path) + " · " + formatBytes(data.bytes) + (data.ext ? " · ." + data.ext : ""))
      );
    }

    /* ------------------------------------------------------------------ */
    /* page                                                                */
    /* ------------------------------------------------------------------ */

    const KIND_KEYS = {
      workspace: "kindWorkspace",
      default: "kindDefault",
      process: "kindProcess",
      home: "kindHome",
      extra: "kindExtra",
    };

    function RootPicker(props) {
      const { explorer, t } = props;
      const label = (entry) => {
        const name = basenameOf(entry.path) || entry.path;
        if (typeof entry.title === "string" && entry.title !== "") return entry.title;
        const key = KIND_KEYS[entry.kind];
        const kindLabel = key === undefined ? "" : t(key);
        return kindLabel === "" || kindLabel === key ? name : kindLabel + " · " + name;
      };
      return h(
        "select",
        {
          className: "fe-select",
          value: explorer.root,
          title: explorer.root,
          "aria-label": t("rootLabel"),
          onChange: (event) => explorer.changeRoot(event.target.value),
        },
        explorer.roots.length === 0
          ? h("option", { value: explorer.root }, t("noRoots"))
          : explorer.roots.map((entry) => h("option", { key: entry.path, value: entry.path }, label(entry)))
      );
    }

    function SidePanel(props) {
      const { explorer, t } = props;
      return h(
        "div",
        { className: "fe-side" },
        h(
          "div",
          { className: "fe-side-top" },
          h("div", { className: "fe-side-row" }, h(RootPicker, { explorer, t }), h(
            "button",
            { type: "button", className: "fe-iconbtn", title: t("refresh"), "aria-label": t("refresh"), onClick: explorer.refreshAll },
            h(RefreshGlyph)
          )),
          h(
            "div",
            { className: "fe-side-row" },
            h(
              "div",
              { className: "fe-search" },
              h(SearchGlyph),
              h("input", {
                type: "search",
                value: explorer.query,
                placeholder: t("searchPlaceholder"),
                "aria-label": t("search"),
                spellCheck: false,
                onChange: (event) => explorer.setQuery(event.target.value),
                onKeyDown: (event) => {
                  if (event.key === "Escape") explorer.setQuery("");
                },
              })
            ),
            h(
              "button",
              {
                type: "button",
                className: "fe-iconbtn",
                title: explorer.showHidden ? t("hiddenOn") : t("hiddenOff"),
                "aria-label": explorer.showHidden ? t("hiddenOn") : t("hiddenOff"),
                "data-on": explorer.showHidden ? "true" : "false",
                onClick: explorer.toggleHidden,
              },
              h(EyeGlyph, { off: !explorer.showHidden })
            )
          )
        ),
        h(
          "div",
          { className: "fe-tree" },
          explorer.query.trim() !== "" ? h(SearchResults, { explorer, t }) : h(TreeBranch, { path: explorer.root, depth: 0, explorer, t })
        )
      );
    }

    function TabStrip(props) {
      const { explorer, t } = props;
      if (explorer.tabs.length === 0) return null;
      return h(
        "div",
        { className: "fe-tabs", role: "tablist" },
        explorer.tabs.map((path) =>
          h(
            "div",
            {
              key: path,
              className: "fe-tab" + (explorer.active === path ? " is-active" : ""),
              role: "tab",
              title: path,
              onClick: () => explorer.openFile(path),
            },
            h("span", { className: "fe-tab-name" }, basenameOf(path)),
            h(
              "button",
              {
                type: "button",
                className: "fe-tab-x",
                title: t("close"),
                "aria-label": t("close"),
                onClick: (event) => {
                  event.stopPropagation();
                  explorer.closeTab(path);
                },
              },
              h(CloseGlyph)
            )
          )
        ),
        h(
          "div",
          { className: "fe-tabbar-end" },
          h(
            "button",
            {
              type: "button",
              className: "fe-iconbtn",
              title: t("wrap"),
              "data-on": explorer.wrap ? "true" : "false",
              onClick: explorer.toggleWrap,
            },
            h(WrapGlyph)
          ),
          h(
            "button",
            { type: "button", className: "fe-iconbtn", title: t("closeAll"), onClick: explorer.closeAll },
            h(CloseGlyph)
          )
        )
      );
    }

    function Crumbs(props) {
      const { explorer, t } = props;
      if (explorer.active === null) return null;
      const crumbs = crumbsOf(explorer.root, explorer.active);
      const nodes = [];
      crumbs.forEach((crumb, index) => {
        if (index > 0) nodes.push(h("span", { key: "s" + index, className: "fe-crumb-sep" }, "›"));
        nodes.push(h("span", { key: "c" + index, className: "fe-crumb", title: crumb }, crumb));
      });
      return h(
        "div",
        { className: "fe-crumbs" },
        nodes,
        h("span", { className: "fe-crumbs-spacer" }),
        isMarkdownPath(explorer.active)
          ? h(
              "button",
              {
                type: "button",
                className: "fe-btn",
                style: { padding: "0 8px", height: 20 },
                onClick: () => explorer.setMarkdownPreview(!explorer.markdownPreview),
              },
              explorer.markdownPreview ? t("source") : t("preview")
            )
          : null,
        explorer.bridge.available
          ? h(
              "button",
              {
                type: "button",
                className: "fe-btn",
                style: { padding: "0 8px", height: 20, marginLeft: 8 },
                title: t("openRight"),
                onClick: () => explorer.openRight(explorer.active),
              },
              t("openRight")
            )
          : null,
        explorer.canOpenWithApp
          ? h(
              "button",
              {
                type: "button",
                className: "fe-btn",
                style: { padding: "0 8px", height: 20, marginLeft: 8 },
                title: t("openWithApp"),
                onClick: () => explorer.openWithApp(explorer.active),
              },
              t("openWithApp")
            )
          : null,
        h(
          "button",
          {
            type: "button",
            className: "fe-btn",
            style: { padding: "0 8px", height: 20, marginLeft: 8 },
            onClick: () => explorer.copyPath(explorer.active),
          },
          explorer.copied ? t("copied") : t("copyPath")
        )
      );
    }

    function DocumentView(props) {
      const { explorer, t } = props;
      const doc = explorer.doc;
      if (explorer.active === null) {
        return h(
          "div",
          { className: "fe-doc-empty" },
          h(DocGlyph),
          h("h2", null, t("welcomeTitle")),
          h("p", null, t("welcomeBody")),
          h("p", null, t("welcomeHint"))
        );
      }
      if (doc.state === "loading") return h("div", { className: "fe-state" }, h("p", null, t("loading")));
      if (doc.state === "error") {
        return h(
          "div",
          { className: "fe-state" },
          h("h3", null, t("loadError")),
          h("p", null, doc.error),
          h("button", { type: "button", className: "fe-btn", onClick: explorer.refreshAll }, t("retry"))
        );
      }
      if (doc.state !== "ready") return h("div", { className: "fe-state" }, h("p", null, t("loading")));
      const data = doc.data;
      if (data.kind === "text") {
        if (isMarkdownPath(data.path) && explorer.markdownPreview) {
          return h(MarkdownBody, { data, routePath: explorer.routePath, baseDir: dirnameOf(data.path) });
        }
        return h(TextBody, { data, wrap: explorer.wrap, t });
      }
      if (data.kind === "image") return h(ImageBody, { data, routePath: explorer.routePath, t });
      if (data.kind === "too-large") {
        return h("div", { className: "fe-state" }, h("h3", null, t("imageTooLarge")), h("p", null, basenameOf(data.path) + " · " + formatBytes(data.bytes)));
      }
      return h(BinaryBody, { data, t });
    }

    function StatusBar(props) {
      const { explorer, t } = props;
      const doc = explorer.doc;
      const ready = doc.state === "ready" ? doc.data : null;
      const meta = [];
      if (ready !== null) {
        if (ready.bytes !== undefined) meta.push({ text: formatBytes(ready.bytes) });
        if (ready.kind === "text") {
          meta.push({ text: ready.lines + " " + t("lines") });
          meta.push({ text: ready.truncated ? t("truncatedLabel") : "UTF-8", warn: ready.truncated === true });
        } else if (ready.kind === "image") {
          meta.push({ text: ready.mime || "image" });
        }
      }
      return h(
        "div",
        { className: "fe-status" },
        h("span", { className: "fe-status-path", title: explorer.active || explorer.root }, explorer.active || explorer.root),
        explorer.notice === "" ? null : h("span", { className: "fe-status-notice" }, explorer.notice),
        h(
          "span",
          { className: "fe-status-meta" },
          meta.map((item, index) => h("span", { key: index, className: item.warn === true ? "fe-warn" : undefined }, item.text))
        )
      );
    }

    function useResizer(explorer) {
      const drag = useRef(null);
      const onMouseDown = useCallback((event) => {
        event.preventDefault();
        drag.current = { startX: event.clientX, startWidth: explorer.treeWidth };
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        const move = (moveEvent) => {
          if (drag.current === null) return;
          explorer.resizeTree(drag.current.startWidth + (moveEvent.clientX - drag.current.startX));
        };
        const up = () => {
          drag.current = null;
          document.body.style.cursor = "";
          document.body.style.userSelect = "";
          window.removeEventListener("mousemove", move);
          window.removeEventListener("mouseup", up);
        };
        window.addEventListener("mousemove", move);
        window.addEventListener("mouseup", up);
      }, [explorer]);
      return onMouseDown;
    }

    function ExplorerPage(props) {
      const t = props.t;
      const routePath = props.routePath;
      const explorer = useExplorer(routePath, props.bridge, t, props.autoOpen === true, props.canOpenWithApp === true);
      const onResizeStart = useResizer(explorer);
      if (explorer.rootsError !== "") {
        return h(
          "div",
          { "data-fe-root": true },
          h(
            "div",
            { className: "fe-state" },
            h("h3", null, t("loadError")),
            h("p", null, explorer.rootsError),
            h("button", { type: "button", className: "fe-btn", onClick: explorer.retryRoots }, t("retry"))
          )
        );
      }
      return h(
        "div",
        { "data-fe-root": true, style: { "--fe-tree-w": explorer.treeWidth + "px" } },
        h(
          "div",
          { className: "fe-head" },
          h("span", { className: "fe-head-title" }, t("title")),
          h("span", { className: "fe-head-spacer" }),
          explorer.root === "" ? null : h("span", { className: "fe-head-root", title: explorer.root }, explorer.root)
        ),
        h(
          "div",
          { className: "fe-body" },
          h(SidePanel, { explorer, t }),
          h("div", {
            className: "fe-resizer",
            title: t("treeResize"),
            onMouseDown: onResizeStart,
            role: "separator",
            "aria-orientation": "vertical",
          }),
          h(
            "div",
            { className: "fe-main" },
            h(TabStrip, { explorer, t }),
            h(Crumbs, { explorer, t }),
            h("div", { className: "fe-doc" }, h(DocumentView, { explorer, t })),
            h(StatusBar, { explorer, t })
          )
        )
      );
    }

    /* ------------------------------------------------------------------ */
    /* sidebar rail icon                                                   */
    /* ------------------------------------------------------------------ */

    function ExplorerIcon(props) {
      const size = typeof props.size === "number" && props.size > 0 ? props.size : 20;
      return h(
        "svg",
        {
          width: size,
          height: size,
          viewBox: "0 0 24 24",
          fill: "none",
          stroke: "currentColor",
          strokeWidth: 1.5,
          strokeLinejoin: "round",
          strokeLinecap: "round",
          "aria-hidden": true,
        },
        h("path", { d: "M3.25 6.5A1.25 1.25 0 0 1 4.5 5.25h4.2l1.6 1.9h9.2A1.25 1.25 0 0 1 20.75 8.4v9.35a1.25 1.25 0 0 1-1.25 1.25h-15A1.25 1.25 0 0 1 3.25 17.75z" }),
        h("path", { d: "M7 12.2h6.5M7 15.6h4.2" })
      );
    }

    /**
     * The same launcher inside the right panel's document toolbar, where the
     * file is actually being viewed. The owner passes the previewed file's Host
     * `absolutePath`; nothing renders until that is known.
     */
    function DocumentOpenAction(props) {
      const { absolutePath, openWithApp, t } = props;
      const [state, setState] = useState("idle");
      const [message, setMessage] = useState("");
      if (typeof absolutePath !== "string" || absolutePath === "") return null;
      const label = state === "done" ? t("openWithAppDone") : state === "error" ? message : t("openWithApp");
      return h(
        "button",
        {
          type: "button",
          className: "fe-open-app",
          "data-fe-doc-action": true,
          "data-fe-open-state": state,
          title: t("openWithApp"),
          disabled: state === "busy",
          onClick: (event) => {
            event.stopPropagation();
            setState("busy");
            Promise.resolve(openWithApp(absolutePath)).then(
              (result) => {
                if (result !== null && typeof result === "object" && result.ok === true) {
                  setState("done");
                } else {
                  setState("error");
                  setMessage(String((result && result.error) || "failed"));
                }
                globalThis.setTimeout?.(() => setState("idle"), 2600);
              },
              () => setState("idle")
            );
          },
        },
        h(OpenExternalGlyph),
        h("span", null, label)
      );
    }

    /* ------------------------------------------------------------------ */
    /* registration                                                        */
    /* ------------------------------------------------------------------ */

    const inject = ["slots", "locale", "sidebarRight", "layout"];

    function apply(ctx) {
      installStyle();
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), "file-explorer: dictionaries");
      const t = ctx.locale.bind(NS);
      const settings = hostConfig();
      const bridge = createRightPanelBridge(ctx);

      // The sidebar rail icon. The list id is also the main panel key, so the
      // sidebar's own button selects the panel below.
      ctx.effect(
        () =>
          ctx.slots.inject("sidebar.panellist", () =>
            ctx.slots.register(
              { name: "sidebar.panellist", id: PANEL_ID, order: 30, label: () => t("panel"), locale: NS },
              ExplorerIcon
            )
          ),
        "file-explorer: rail icon"
      );

      // The panel body itself, dispatched by the same key.
      ctx.effect(
        () =>
          ctx.slots.inject("main", () =>
            ctx.slots.register({ name: "main", key: PANEL_ID, locale: NS }, () =>
              h(ExplorerPage, {
                t,
                routePath: settings.routePath,
                bridge,
                autoOpen: settings.openInRightPanel,
                canOpenWithApp: settings.allowOpenWithDefaultApp,
              })
            )
          ),
        "file-explorer: main panel"
      );

      // The document toolbar's copy of the launcher: after a click hands the file
      // to the right column, this is where the user can reach it.
      if (settings.allowOpenWithDefaultApp) {
        ctx.effect(
          () =>
            ctx.slots.inject("sidebar.right.tab.document.actions", () =>
              ctx.slots.register(
                {
                  name: "sidebar.right.tab.document.actions",
                  id: "file-explorer-open",
                  order: 40,
                  locale: NS,
                  inject: () => ({ openWithApp: (path) => postOpen(settings.routePath, path) }),
                },
                DocumentOpenAction
              )
            ),
          "file-explorer: document toolbar action"
        );
      }
    }

    exports.apply = apply;
    exports.inject = inject;
    exports.PANEL_ID = PANEL_ID;
    exports.apiUrl = apiUrl;
    exports.fileResourceAddress = fileResourceAddress;
    exports.createRightPanelBridge = createRightPanelBridge;
    exports.basenameOf = basenameOf;
    exports.crumbsOf = crumbsOf;
    exports.formatBytes = formatBytes;
    exports.colorOf = colorOf;
    exports.renderMarkdown = renderMarkdown;
    exports.markdownTarget = markdownTarget;
    return module.exports;
  },
});
