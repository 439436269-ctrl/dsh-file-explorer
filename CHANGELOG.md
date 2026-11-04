# Changelog

## 0.1.0 — 2026-11-04

First public release as `@vfvrpq/dsh-file-explorer`.

- Sidebar rail entry (`sidebar.panellist`, id `file-explorer`) that opens the panel registered under the matching `main` key.
- Lazy file tree over the composed filesystem: folders first, per-extension colour badges, dotfile toggle, drag-resizable width.
- Multi-tab preview with breadcrumbs and a status bar (size, line count, encoding, truncation).
- Text preview with line numbers and a wrap toggle; Markdown rendering with a source toggle and relative-image resolution through the raw route; inline image preview; metadata-only rendering for other binaries.
- Bounded recursive file-name search.
- Read-only HTTP API under `/api/file-explorer` with a root allowlist and per-request containment proof (`ctx.fs.contains`).
- Host-side unit tests (20) plus a Playwright end-to-end script that checks 17 behaviours in a throwaway profile.
