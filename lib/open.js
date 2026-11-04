/**
 * "Open with the system default application" for one file.
 *
 * The shipped open-in-app route only accepts a *directory* (it opens a folder in
 * VS Code / Explorer), so a file needs its own launcher. This module builds the
 * platform command, refuses obviously executable suffixes by default, and hands
 * the spawn to the caller so tests never launch anything.
 *
 * @module dsh-file-explorer/open
 */
import { spawn } from "node:child_process";
import { platform as hostPlatform } from "node:os";

/**
 * Suffixes never handed to the shell opener unless the operator allows them:
 * `start`/`xdg-open` execute these instead of previewing them.
 */
export const DEFAULT_BLOCKED_EXTENSIONS = [
  "exe",
  "com",
  "bat",
  "cmd",
  "msi",
  "scr",
  "pif",
  "vbs",
  "vbe",
  "ps1",
  "reg",
  "sh",
  "command",
  "app",
  "desktop",
];

/**
 * The command that opens one path in its default application.
 * @param path - absolute path of a regular file.
 * @param platform - `process.platform` value.
 * @returns `{ command, args }`.
 */
export function openCommandFor(path, platform = hostPlatform()) {
  if (platform === "win32") {
    // `start` treats its first argument as the window title, hence the empty one.
    return { command: process.env.ComSpec || "cmd.exe", args: ["/c", "start", "", path] };
  }
  if (platform === "darwin") return { command: "open", args: [path] };
  return { command: "xdg-open", args: [path] };
}

/** Whether the suffix is refused by the launcher. */
export function isBlockedExtension(ext, blocked = DEFAULT_BLOCKED_EXTENSIONS) {
  return blocked.includes(String(ext).toLocaleLowerCase());
}

/**
 * Spawn the opener detached so a slow shell doesn't hold the request open.
 * @param command - executable to run.
 * @param args - its argv.
 * @returns true once the child was spawned.
 */
export function spawnDetached(command, args) {
  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
  return true;
}
