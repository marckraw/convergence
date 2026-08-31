/**
 * The account-directory compatibility manifest (ADR 0007, amendment 1).
 *
 * **Polarity is default-shared.** Everything in the shared `~/.claude`
 * directory is symlinked into an account directory *except* an explicit
 * per-account list. Enumerating what to share was already stale when it was
 * written: PA0 found `sessions/`, `session-env/` and `backups/` appearing
 * unmanifested after a single turn on 2.1.220. An unknown entry a future Claude
 * release introduces therefore fails toward over-sharing, which is visible,
 * rather than silent partition, which is not.
 *
 * This constant is data on purpose. Enrolment seeds from it and PA7's
 * layout-drift probe reads the same list, so the two can never disagree.
 */

/**
 * Entries that must stay per-account rather than being symlinked to the shared
 * profile.
 *
 * `.claude.json` carries identity, the organization caches whose cross-account
 * pollution this whole design exists to prevent, and the per-slot `mcpOAuth`
 * tokens. `backups/` holds rewrites of that same file.
 */
export const CLAUDE_ACCOUNT_PRIVATE_ENTRIES: readonly string[] = [
  '.claude.json',
  'backups',
]

/**
 * Entries observed in a shared `~/.claude` at the time of writing, recorded so
 * drift against a future Claude release is visible rather than guessed at. This
 * list is *descriptive* — nothing branches on it — while
 * `CLAUDE_ACCOUNT_PRIVATE_ENTRIES` above is *prescriptive*.
 */
export const CLAUDE_SHARED_DIR_KNOWN_ENTRIES: readonly string[] = [
  'agents',
  'backups',
  'commands',
  'CLAUDE.md',
  'history.jsonl',
  'ide',
  'plugins',
  'projects',
  'sessions',
  'session-env',
  'settings.json',
  'shell-snapshots',
  'skills',
  'statsig',
  'todos',
]

export interface AccountDirPlan {
  /** Entries to symlink from the shared directory into the account directory. */
  shared: string[]
  /** Entries deliberately left per-account. */
  private: string[]
}

/**
 * Splits the shared directory's actual entries into what gets symlinked and
 * what stays private. Takes the entries as an argument rather than reading the
 * disk, so enrolment and the drift probe can both reason about a directory
 * neither of them has to own.
 */
export function planAccountDirEntries(
  sharedEntries: readonly string[],
): AccountDirPlan {
  const isPrivate = (entry: string) =>
    CLAUDE_ACCOUNT_PRIVATE_ENTRIES.includes(entry)

  return {
    shared: sharedEntries.filter((entry) => !isPrivate(entry)).sort(),
    private: sharedEntries.filter(isPrivate).sort(),
  }
}

export interface AccountDirDrift {
  /**
   * Entries in the account directory that the manifest does not account for —
   * neither a symlink we seeded nor a deliberate per-account entry. A future
   * Claude release writing real state here is exactly what this catches.
   */
  unknownEntries: string[]
  /** Shared entries that exist upstream but are missing from the account dir. */
  missingLinks: string[]
}

/**
 * Compares an account directory against the shared directory and the manifest.
 *
 * PA0 caught `sessions/`, `session-env/` and `backups/` by hand this way; this
 * makes it automatic. Reporting is the whole job — nothing is deleted or
 * re-linked, because a surprising entry might be the only copy of something.
 */
export function detectAccountDirDrift(input: {
  sharedEntries: readonly string[]
  accountEntries: readonly string[]
}): AccountDirDrift {
  const plan = planAccountDirEntries(input.sharedEntries)
  const expected = new Set([...plan.shared, ...CLAUDE_ACCOUNT_PRIVATE_ENTRIES])
  const accountEntries = new Set(input.accountEntries)

  return {
    unknownEntries: input.accountEntries
      .filter((entry) => !expected.has(entry))
      .sort(),
    missingLinks: plan.shared.filter((entry) => !accountEntries.has(entry)),
  }
}
