/** Conversation storage shared by enrolled Codex homes; all other entries stay private. */
export const CODEX_SHARED_HISTORY_ENTRIES = [
  'sessions',
  'archived_sessions',
  'session_index.jsonl',
  'rollout-migrations',
  'attachments',
  'generated_images',
  'thread-writer-locks',
] as const

export type CodexHistoryEntry = (typeof CODEX_SHARED_HISTORY_ENTRIES)[number]
export type CodexHistoryEntryState =
  | 'absent'
  | 'shared'
  | 'empty'
  | 'rollouts'
  | 'nonempty'
  | 'invalid'

export interface CodexHistoryObservation {
  entry: CodexHistoryEntry
  state: CodexHistoryEntryState
}

export function isCodexRolloutDirectory(entry: CodexHistoryEntry): boolean {
  return entry === 'sessions' || entry === 'archived_sessions'
}

/** A complete preflight precedes every copy, rename and link. */
export function planCodexHistoryMigration(input: {
  entries: readonly CodexHistoryObservation[]
  collisions: number
}): {
  link: CodexHistoryEntry[]
  preserve: CodexHistoryEntry[]
  warnings: string[]
} {
  const warnings: string[] = []
  const blocked = input.entries.filter((entry) =>
    ['nonempty', 'invalid'].includes(entry.state),
  )
  if (blocked.length) {
    warnings.push(
      `This account's conversation history could not be joined to the shared history: ${blocked.map(({ entry }) => entry).join(', ')} contains local data or an unexpected link or file. Nothing was changed. Same-account work can continue. Reconnect after resolving these entries to enable account switching.`,
    )
  }
  if (input.collisions > 0) {
    warnings.push(
      `This account's conversation history could not be joined to the shared history: ${input.collisions} files already exist there. Nothing was changed. Conversations on this account keep their own history until this is resolved.`,
    )
  }
  if (warnings.length) return { link: [], preserve: [], warnings }
  return {
    link: input.entries
      .filter(({ state }) => state !== 'shared')
      .map(({ entry }) => entry),
    preserve: input.entries
      .filter(({ state }) => state === 'empty' || state === 'rollouts')
      .map(({ entry }) => entry),
    warnings,
  }
}

/** Codex 0.154.0 coordination and per-thread lock names, measured by the continuity probe. */
export function isCodexWriterLockName(name: string): boolean {
  return (
    name === '.coordination.lock' ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.lock$/i.test(
      name,
    )
  )
}

export { isAccountHistoryOsJunk as isCodexHistoryOsJunk } from './provider-account-history.pure'
