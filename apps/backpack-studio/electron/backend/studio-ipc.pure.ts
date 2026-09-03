/**
 * What the IPC door is allowed to believe about its arguments (MAR-2770).
 *
 * An `ipcMain.handle` argument is whatever the other side of the boundary sent.
 * The renderer's typed wrapper says `string`, but the type disappears at the
 * bridge, and a handler that took the word for it handed `undefined` to code
 * that immediately called a string method on it. The rejection then travelled
 * back through `invoke` and became an unhandled rejection in the window — a
 * defect with no sentence attached, in the one place a person is looking.
 */

/** The value as a string, or null when the door was handed something else. */
export function readIpcString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}
