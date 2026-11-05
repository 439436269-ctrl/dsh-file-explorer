# 发布与验证记录

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

## 稳定性备注

- 本地 git HEAD 与远端 SHA 不同但 **tree 相同**（推送走 Git Data API），对齐方式：`git fetch origin && git reset --hard origin/main`。
- 安装必须用 npm 或 `file:` tgz；`link:` / junction 会让宿主的 `@deepseek-ai/schemastery` 解析失败，条目报 `failed to import`。
