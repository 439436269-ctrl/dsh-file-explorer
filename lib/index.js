/**
 * dsh-file-explorer — a VS Code style folder and file previewer inside the DSH
 * Web UI.
 *
 * Two halves, one package:
 * - this file is the Host half: it registers an authenticated
 *   `GET /api/file-explorer?op=roots|list|read|search|raw` route over the
 *   composed filesystem, confined to a set of browsable roots, and publishes
 *   the route path to the browser through the index injection table.
 * - `./client` is the browser half: a sidebar rail icon plus a main panel that
 *   draws the file tree, open-file tabs and the text / Markdown / image
 *   preview.
 *
 * @module dsh-file-explorer
 */
import { resolveConfig } from "./config.js";
import { registerExplorerRoute } from "./route.js";
import { Config } from "./schema.js";

/** Plugin name, also the settings-page namespace through the bundle patch. */
export const name = "file-explorer";

/** Host services the route needs: the filesystem it reads and the auth fence. */
export const inject = ["fs", "connection"];

export { Config };

/**
 * Mount the explorer route and expose its path to the browser half.
 * @param ctx - host context carrying `fs`, `connection`, and the web server.
 * @param config - loader-supplied configuration.
 */
export function apply(ctx, config) {
  const settings = resolveConfig(config);
  if (!settings.enabled) return;

  ctx.effect(() => registerExplorerRoute(ctx, settings), "file-explorer: api route");

  // The client reads its route and limits from the served page, so a configured
  // path and the client's URL can never drift apart.
  ctx.on("webserver/index-inject", (table) => {
    table.push({
      kind: "global",
      name: "__DSH_FILE_EXPLORER_CONFIG__",
      value: {
        routePath: settings.routePath,
        maxTextBytes: settings.maxTextBytes,
        maxRawBytes: settings.maxRawBytes,
        defaultShowHidden: settings.defaultShowHidden,
        openInRightPanel: settings.openInRightPanel,
        allowOpenWithDefaultApp: settings.allowOpenWithDefaultApp,
        ignored: settings.ignored,
      },
    });
  });
}
