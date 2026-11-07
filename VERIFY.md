# 发布与验证记录

## 0.2.1（2026-11-07）

| 项 | 值 |
|---|---|
| npm | `@vfvrpq/dsh-file-explorer@0.2.1`（latest，2026-11-07T00:44:48Z），gitHead `f3f8c2a` |
| 变更 | `dsh.compatibility.dshReleases` 增加 `0.2.1-rc.2` / `0.2.2-rc.1`；其余文件与 0.2.0 逐字节相同（已用 tarball 逐文件 sha256 核对） |
| GitHub | tag `v0.2.1` |
| 市场条目 | 描述更新 PR **#13003**：zh 描述改为以「侧栏文件浏览器与文件预览器」开头（原来只有「浏览工作区/文件树」，中文搜「文件浏览」「文件预览」命中不了）；en 补 "file previewer" 与 Markdown 表格 |

## 0.2.0（2026-11-05）

| 项 | 值 |
|---|---|
| npm | `@vfvrpq/dsh-file-explorer@0.2.0`（latest），shasum `00b124e1898026a8bfdc5831679ff1ba1cda833b` |
| GitHub | `439436269-ctrl/dsh-file-explorer`，tag `v0.2.0` |
| 市场收录 | awesome-dsh-plugin PR **#12134**（`fkysly` 于 2026-11-05T17:24:15Z 合并，merge `31392b1`）；条目 `data/plugins/439436269-ctrl__dsh-file-explorer.yml`，category `ui` |
| 市场 CI | `check` success、`Submission gate` success，`mergeable=clean`，0 条评审意见 |

验证证据：

- 单测 **28/28**：`node --test test/host.test.mjs test/client.test.mjs`（含解析、表格、链接徽章、平台启动命令、可执行后缀拦截、一次真实 detached spawn）。
- 端到端 **26/26**：`dev\verify-local.ps1` 在临时 profile 里起无头 Web + Playwright，覆盖侧栏图标、面板挂载、树懒加载、`roots` 接口、文本/图片预览（读 `naturalWidth`）、Markdown 渲染与源码切换、**点文件不离开面板**、**展开状态跨刷新保留**、`op=open` 的 405/拦截/probe、右侧面板 handoff 与文档工具栏按钮。
- 发布产物：sha1 / sha512 integrity / 本地 tgz 与 registry **逐字节一致**（`verify_npm_artifact.py`）。

## 版本线

| 版本 | 内容 |
|---|---|
| 0.1.0 | 首版：侧栏入口 + 懒加载树 + 面板内预览 + 只读路径围栏 |
| 0.1.1 | 点文件送进右侧栏文档预览（`dsh-resource://` + `sidebarRight.openResource`） |
| 0.1.2 | `op=open`（仅 POST、可执行后缀默认拒绝、`probe=1`）与「用默认程序打开」 |
| 0.1.3 | 文档工具栏同名动作（`sidebar.right.tab.document.actions`，拿 `absolutePath`） |
| 0.1.4 | 默认改为**留在面板内预览**（`openInRightPanel: false`） |
| 0.2.0 | 预览卡片化、图标工具栏、记住展开目录、Markdown 表格/徽章/图片占位 |
| 0.2.1 | 兼容性声明补 `0.2.1-rc.2` / `0.2.2-rc.1`，无行为变化 |

## 稳定性备注

- 本地 git HEAD 与远端 SHA 不同但 **tree 相同**（推送走 Git Data API），对齐方式：`git fetch origin && git reset --hard origin/main`。
- 安装必须用 npm 或 `file:` tgz；`link:` / junction 会让宿主的 `@deepseek-ai/schemastery` 解析失败，条目报 `failed to import`。
