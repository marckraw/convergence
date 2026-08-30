/**
 * Where a remote session works, as the session records it (MAR-2689).
 *
 * A remote run has to be told a place in the daemon's own vocabulary, and the
 * daemon offers exactly two and refuses both at once: a Project that already
 * lives on that machine (a `workingDirectory` it resolves itself), or a
 * repository it clones into a fresh per-session worktree. So this is a union of
 * two, plus the one honest thing to say about a row written before any of it
 * existed.
 *
 * `unknown` is a value and not an absence. Every remote session that ran before
 * this shipped worked *somewhere* — the app derived a repository from the
 * session's own project and sent it silently — but the record does not hold
 * which, and the local checkout that could have re-derived it may be gone or
 * repointed since. Backfilling a guess would put a place on screen that nobody
 * chose and nothing verified, which is the exact failure this era exists to
 * end. A default is not a known value.
 *
 * `label` is stored rather than re-derived because it is what was on the strip
 * when he pressed send. A Project renamed on the daemon afterwards does not
 * retroactively change what this session was told to do, and the same
 * reasoning already governs the Endpoint display name a session records
 * (MAR-2662).
 */
export type SessionWorkAddress =
  | {
      mode: 'project'
      /** The daemon's own Project id. */
      projectId: string
      /** The directory on that machine the daemon resolves the Project to. */
      workingDirectory: string
      label: string
    }
  | {
      mode: 'repository'
      /** The clone URL, already through `normalizeGitHubRemoteUrl`. */
      repository: string
      label: string
    }
  | { mode: 'unknown' }

/** What a remote row that never recorded a place says about itself. */
export const UNKNOWN_WORK_ADDRESS: SessionWorkAddress = { mode: 'unknown' }

/**
 * What a repository is called on screen: `owner/repo`, from the clone URL.
 *
 * One formatter, because the strip that states the place before send and the
 * session details that report it afterwards must not name the same repository
 * two ways.
 */
export function describeCloneableRepository(repository: string): string {
  return repository
    .replace(/^https:\/\/github\.com\//, '')
    .replace(/\.git$/, '')
}

/** How a Project on a machine reads in the strip. */
export function describeRemoteProjectPlace(name: string): string {
  return `Project ${name}`
}

/**
 * What the strip and the session details show for a recorded place.
 *
 * The stored label, verbatim — never rebuilt from the id, which would quietly
 * start answering with today's name for a session started under yesterday's.
 * `null` and `unknown` share a sentence because they are the same fact from
 * two directions: nothing in the record says where this ran.
 */
export function describeWorkAddress(
  address: SessionWorkAddress | null | undefined,
): string {
  if (!address || address.mode === 'unknown') return 'Unknown'
  return address.label
}

/**
 * Reads the `sessions.work_address` column.
 *
 * Never throws and never repairs: a column that is absent, blank, unparseable
 * or shaped like nothing this app writes yields `null`, which the surfaces
 * read as "this record says nothing". Coercing a half-written value into one of
 * the two real modes would be inventing a place, and a place nobody chose is
 * precisely what this column exists to make impossible.
 */
export function parseSessionWorkAddress(
  raw: string | null | undefined,
): SessionWorkAddress | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  return sessionWorkAddressFromValue(parsed)
}

/**
 * Whether an address names a place concretely enough to be born with
 * (MAR-2689).
 *
 * The one predicate behind "a concrete place or not at all", so the door that
 * decodes an address and the door that creates a session with one cannot come
 * to mean different things by *concrete*. Both used to ask a weaker question --
 * the decoder whether the fields were strings, the service whether the mode was
 * not `unknown` -- and `{ mode: 'repository', repository: '', label: '' }`
 * passed both: a remote row that names nowhere for the daemon to clone and
 * shows an empty word on the strip.
 *
 * Every mode's identifying fields *and* its label, because the label is what
 * the human reads back afterwards and a place nobody can see named is not a
 * place that was stated. `unknown` names none by definition -- it is the honest
 * value for a row written before any of this existed, never one to be born
 * with.
 *
 * It validates and never rewrites. Trimming here would accept a value by
 * changing it, and the record would then hold a place slightly different from
 * the one the caller sent -- exact or refused is this era's rule, and a door
 * that repairs is a door that guesses.
 */
export function namesAConcreteWorkPlace(
  address: SessionWorkAddress | null | undefined,
): boolean {
  if (!address) return false
  switch (address.mode) {
    case 'project':
      return (
        statesSomething(address.projectId) &&
        statesSomething(address.workingDirectory) &&
        statesSomething(address.label)
      )
    case 'repository':
      return (
        statesSomething(address.repository) && statesSomething(address.label)
      )
    case 'unknown':
      return false
  }
}

/** A field states something when it is not blank. Read, never rewritten. */
function statesSomething(field: string): boolean {
  return field.trim().length > 0
}

/**
 * The allowlist itself, over a value of any provenance.
 *
 * One function because the column and the IPC argument are the same question
 * asked of two transports: a row this app wrote and re-reads, and an object the
 * renderer handed the main process. Neither may be trusted for more than it
 * proves, and neither may be read by a *second* copy of these field checks --
 * a rule in two places is a rule that drifts, and the half that drifted would
 * be the half that writes places into the record.
 *
 * The shape check and the concreteness check are both here: a candidate is
 * built by allowlist and then has to name a place, so no caller of this can be
 * handed an address that typechecks and says nothing.
 */
function sessionWorkAddressFromValue(
  parsed: unknown,
): SessionWorkAddress | null {
  if (typeof parsed !== 'object' || parsed === null) return null

  const value = parsed as Record<string, unknown>
  if (value.mode === 'unknown') return UNKNOWN_WORK_ADDRESS

  const candidate = candidateWorkAddress(value)
  return candidate && namesAConcreteWorkPlace(candidate) ? candidate : null
}

/** The allowlisted shape, before it is asked whether it names anything. */
function candidateWorkAddress(
  value: Record<string, unknown>,
): SessionWorkAddress | null {
  if (
    value.mode === 'project' &&
    typeof value.projectId === 'string' &&
    typeof value.workingDirectory === 'string' &&
    typeof value.label === 'string'
  ) {
    return {
      mode: 'project',
      projectId: value.projectId,
      workingDirectory: value.workingDirectory,
      label: value.label,
    }
  }
  if (
    value.mode === 'repository' &&
    typeof value.repository === 'string' &&
    typeof value.label === 'string'
  ) {
    return {
      mode: 'repository',
      repository: value.repository,
      label: value.label,
    }
  }
  return null
}

/** What an IPC argument claiming to be a work address turned out to be. */
export type SessionWorkAddressDecode =
  | { status: 'absent' }
  | { status: 'decoded'; address: SessionWorkAddress }
  | { status: 'malformed'; reason: string }

/**
 * The main process's door for a work address arriving over IPC (MAR-2689).
 *
 * The preload bridge types this argument `unknown` and says main decodes it;
 * for one run it did not, and `{ mode: 'repository', repository: 42 }` was
 * written to the record verbatim, parsed back as `null`, and produced a remote
 * session with no place at all — the thing the column exists to make
 * impossible.
 *
 * Exact or refused, never repaired: the same rule the option row's endpoint
 * argument follows (MAR-2682). Coercing `42` into a string, trimming a blank
 * one, or falling back to `unknown` would each turn a caller's mistake into a
 * place nobody chose, which is this era's one shape. A field that is present
 * but says nothing is refused for the same reason a missing one is --
 * `namesAConcreteWorkPlace` is where that line lives, and the service door
 * reads it too.
 *
 * Absent is its own outcome and not a failure. A Local session states no place
 * and sends none; only a *remote* birth owes one, and that rule belongs to the
 * service that knows which machine the session is going to.
 */
export function decodeSessionWorkAddress(
  value: unknown,
): SessionWorkAddressDecode {
  if (value === undefined || value === null) return { status: 'absent' }
  const address = sessionWorkAddressFromValue(value)
  if (address) return { status: 'decoded', address }
  return {
    status: 'malformed',
    reason:
      'a work address is { mode: "project", projectId, workingDirectory, ' +
      'label }, { mode: "repository", repository, label } with non-blank ' +
      'strings throughout, or { mode: "unknown" }',
  }
}

/**
 * Writes the column, field by field rather than by spreading the caller's
 * object.
 *
 * Construction by allowlist for the same reason the wire mapping builds its
 * send options that way: a runtime object can carry more than its type admits,
 * and a record is not the place to find that out.
 */
export function serializeSessionWorkAddress(
  address: SessionWorkAddress,
): string {
  switch (address.mode) {
    case 'project':
      return JSON.stringify({
        mode: 'project',
        projectId: address.projectId,
        workingDirectory: address.workingDirectory,
        label: address.label,
      })
    case 'repository':
      return JSON.stringify({
        mode: 'repository',
        repository: address.repository,
        label: address.label,
      })
    case 'unknown':
      return JSON.stringify({ mode: 'unknown' })
  }
}
