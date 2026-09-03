/**
 * Strips `user:token@` (or a bare `user@`) out of every URL in a piece of git
 * output before it can reach the renderer (MAR-2783 round 2, L6). git prints
 * the remote URL verbatim in its failure lines, and a remote configured with
 * a token in the URL would otherwise surface that token in an error dialog.
 */
export function redactUrlCredentials(text: string): string {
  return text.replace(/(\w+:\/\/)[^/@\s]+@/g, '$1')
}
