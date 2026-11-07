# Changelog

## 0.2.1 — 2026-11-07

Compatibility release, no behavior change:

- `dsh.compatibility.dshReleases` now also declares `0.2.1-rc.2` and `0.2.2-rc.1`, so the compatibility gate stops flagging it on newer Harness builds.
- Every other file is byte-identical to 0.2.0.

## 0.2.0 — 2026-11-04

Interface pass on the explorer panel:

- The preview is now its **own bordered card** (rounded, inset, tab strip + toolbar inside), so the tree and the document read as two surfaces instead of one flat page.
- Every document action collapsed into an **icon toolbar** with `title` and `aria-label` (wrap, Markdown source toggle, copy path, open on the right, open with the default app) — no more text buttons crowding the breadcrumb row.
- **Expanded folders are remembered per root**, so a reload (or switching roots and back) keeps the tree where it was. Capped at 400 paths per root.
- The active tree row gets a left accent bar.
- Markdown: linked badge images (`[![alt](src)](href)`) now render as links wrapping the image, and an image that fails to load degrades to its alt text instead of a broken-image icon.

## 0.1.4 — 2026-11-04

- **Clicking a file no longer leaves the explorer.** `openInRightPanel` now defaults to `false`: the click opens the preview inside the panel (tree on the left, preview on the right) and nothing navigates away.
- Why the old default changed: the right column belongs to the conversation surface, so handing a file to it necessarily replaces the explorer with the conversation. That is only worth it on purpose, so it stays a one-click opt-in via「在右侧打开」or `openInRightPanel: true`.

## 0.1.3 — 2026-11-04

- The **"用默认程序打开"** control also lands in the right panel's document toolbar (`sidebar.right.tab.document.actions`), which receives the previewed file's Host `absolutePath`. This is what makes the button reachable in the default flow, where clicking a file hands it to the right column and the explorer steps aside.
- Both copies share one launcher (`postOpen`), so guards, errors and the success notice behave identically.

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
