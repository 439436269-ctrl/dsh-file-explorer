# Changelog

## 0.1.2 — 2026-11-04

- New **"用默认程序打开"** control in the breadcrumb row. It `POST`s to the authenticated `?op=open` route, which resolves the file, refuses executable suffixes by default, and hands the path to the platform opener (`start` / `open` / `xdg-open`).
- `?op=open&probe=1` answers the exact command that would run without spawning it, so the verification suite can prove the wiring without opening a window.
- New `allowOpenWithDefaultApp` and `blockedOpenExtensions` config; `GET` on the open operation is refused (405) so a prefetch can never launch a program.

## 0.1.1 — 2026-11-04

- Clicking a file now opens it in the **right-sidebar document preview** with the built-in renderer for that type (text, Markdown, image, code, PDF, Office…). The right column belongs to the conversation, so the explorer steps aside and the conversation returns with the document open next to it.
- The document toolbar carries the shipped **"open in app"** action, so "用默认程序打开" comes for free there; the explorer also has its own "在右侧打开" control next to the breadcrumbs.
- New `openInRightPanel` config (default `true`). Set it to `false` to keep the explorer open and preview files in-panel instead.
- Address building mirrors the shipped `dsh-resource://file/session/<id>/<path>` scheme; the bridge degrades (pending → retry → inline fallback) instead of throwing when no Session surface exists.

## 0.1.0 — 2026-11-04

First public release as `@vfvrpq/dsh-file-explorer`.

- Sidebar rail entry (`sidebar.panellist`, id `file-explorer`) that opens the panel registered under the matching `main` key.
- Lazy file tree over the composed filesystem: folders first, per-extension colour badges, dotfile toggle, drag-resizable width.
- Multi-tab preview with breadcrumbs and a status bar (size, line count, encoding, truncation).
- Text preview with line numbers and a wrap toggle; Markdown rendering with a source toggle and relative-image resolution through the raw route; inline image preview; metadata-only rendering for other binaries.
- Bounded recursive file-name search.
- Read-only HTTP API under `/api/file-explorer` with a root allowlist and per-request containment proof (`ctx.fs.contains`).
- Host-side unit tests (20) plus a Playwright end-to-end script that checks 17 behaviours in a throwaway profile.
