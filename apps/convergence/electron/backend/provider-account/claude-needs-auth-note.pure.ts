/**
 * Claude Code's per-account note of servers that "need authentication"
 * (`<CLAUDE_CONFIG_DIR>/mcp-needs-auth-cache.json`), MAR-3517.
 *
 * Read from Claude Code 2.1.283 and measured on a live account (27 Sep):
 * - shape `{ [serverName]: { timestamp, id?, ttlMs? } }`;
 * - a session trusts an entry for 4 h (claude.ai connectors, plugin http/sse
 *   servers) or 15 min (everything else) and skips that server without
 *   trying it;
 * - `claude mcp list` — what the Connectors panel runs — writes an entry when
 *   it sees "Needs authentication" but never removes one when it sees
 *   "Connected"; only Claude Code's own OAuth flow deletes the file.
 *
 * So a server fixed elsewhere (a claude.ai connector authorised on the web)
 * reads "Connected" in the panel while every new conversation skips it. The
 * panel keeps `mcp list` as its truth and uses the note for one thing only:
 * an entry for a server `mcp list` just reported Connected is wrong at any
 * age, so it is removed. The expiry is never needed and never guessed.
 */
export const CLAUDE_NEEDS_AUTH_NOTE_FILE = 'mcp-needs-auth-cache.json'

/**
 * The note without the entries of servers reported Connected, or null when
 * nothing should be written: an unreadable note, or no entry to remove.
 */
export function pruneClaudeNeedsAuthNote(
  raw: string,
  connected: readonly string[],
): { next: string; cleared: string[] } | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    return null
  const note = parsed as Record<string, unknown>
  const cleared = [...new Set(connected)].filter((name) =>
    Object.hasOwn(note, name),
  )
  if (cleared.length === 0) return null
  const kept = Object.fromEntries(
    Object.entries(note).filter(([name]) => !cleared.includes(name)),
  )
  return { next: JSON.stringify(kept), cleared }
}
