/**
 * The schemastery schema alone, so `lib/config.js` stays importable in a plain
 * `node --test` run (schemastery is supplied by the DSH host at runtime).
 *
 * @module dsh-file-explorer/schema
 */
import z from "@deepseek-ai/schemastery";
import {
  DEFAULT_MAX_RAW_BYTES,
  DEFAULT_MAX_TEXT_BYTES,
  DEFAULT_ROUTE_PATH,
} from "./config.js";
import { DEFAULT_BLOCKED_EXTENSIONS } from "./open.js";

/** Schema the loader validates and the settings page renders. */
export const Config = z.object({
  enabled: z.boolean().default(true).description(
    "Serve the explorer route at all. Off keeps the sidebar entry registered but transfers nothing."
  ),
  routePath: z.string().default(DEFAULT_ROUTE_PATH).description(
    "Absolute pathname of the authenticated GET route; it must stay under /api so the connection fence authenticates it."
  ),
  extraRoots: z.array(z.string()).default([]).description(
    "Extra absolute directories offered in the root picker, in addition to registered workspaces, the default directory and the home directory."
  ),
  includeHome: z.boolean().default(true).description(
    "Offer the current user's home directory as a browsable root."
  ),
  ignored: z.array(z.string()).default([]).description(
    "Entry names hidden from listings and skipped by search, for example node_modules or .venv."
  ),
  maxTextBytes: z.number().step(1).min(1024).default(DEFAULT_MAX_TEXT_BYTES).description(
    "Largest file returned as a text preview, in bytes; larger files are cut and flagged."
  ),
  maxRawBytes: z.number().step(1).min(1024).default(DEFAULT_MAX_RAW_BYTES).description(
    "Largest file streamed through the raw route (image preview), in bytes."
  ),
  defaultShowHidden: z.boolean().default(false).description(
    "Whether the file tree starts with dotfiles visible."
  ),
  openInRightPanel: z.boolean().default(true).description(
    "Also open the clicked file in the right-sidebar document preview (its toolbar carries the built-in \"open in app\" action). Falls back to the in-panel preview when no Session surface is available."
  ),
  allowOpenWithDefaultApp: z.boolean().default(true).description(
    "Expose the \"open with the system default application\" control. It POSTs to the authenticated route, so a page that never asks cannot launch anything."
  ),
  blockedOpenExtensions: z.array(z.string()).default(DEFAULT_BLOCKED_EXTENSIONS).description(
    "Suffixes the launcher refuses, because the OS handler would execute them instead of previewing them. Set an empty list to allow every suffix."
  ),
});
