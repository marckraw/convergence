import type { EndpointHandshakeResult } from './execution-host-handshake.types'
import type {
  RemoteProject,
  RemoteProjectCatalog,
  RemoteProjectsOutcome,
} from './remote-project.types'

/**
 * The capability a daemon advertises when it can list its Projects.
 *
 * Not in `EXECUTION_PROTOCOL_CAPABILITY_IDS` — the protocol package's known-id
 * list predates it, which is exactly why the handshake keeps capabilities as
 * plain strings and why the pinned `/health` fixture calls out this id by name.
 */
export const REMOTE_PROJECTS_CAPABILITY = 'projects.v1'

/**
 * What a handshake says about this machine's Projects (MAR-2689 round 5).
 *
 * Three states, not two, because a daemon that has said nothing and a daemon
 * that has answered and left `projects.v1` out are opposite facts that a
 * boolean cannot tell apart. Both were being read as "no Projects", and the
 * two places that difference decides are the two the round-5 review found: the
 * start door may refuse Project mode on `withheld` and must never refuse on
 * `unknown`, and the invalidation must treat a handshake going `unknown` as a
 * change rather than as more of the same.
 *
 * - `unknown` — no readable handshake. The daemon is too old for `/health`, or
 *   the probe failed. Nothing is known, and nothing may be refused in its name.
 * - `withheld` — it answered, and `projects.v1` is not among its capabilities.
 *   A positive claim: this machine does not do Projects.
 * - `advertised` — it answered and offers them.
 */
export type RemoteProjectsCapability = 'unknown' | 'withheld' | 'advertised'

export function remoteProjectsCapability(
  handshake: EndpointHandshakeResult | null,
): RemoteProjectsCapability {
  if (!handshake) return 'unknown'
  return handshake.executionProtocolCapabilities.includes(
    REMOTE_PROJECTS_CAPABILITY,
  )
    ? 'advertised'
    : 'withheld'
}

/**
 * Whether this machine says it can list Projects (MAR-2689).
 *
 * The one question `/v0/projects` is read on: the ruling is that the route is
 * asked only where the machine advertises it, so a machine that has said
 * nothing is not asked either. What must not follow is calling that a failure
 * — a machine with no Projects offers Repository mode and nothing is wrong.
 * `RemoteProjectCatalog.supported` is the field that keeps those two apart
 * downstream.
 *
 * Derived from `remoteProjectsCapability` rather than reading the capability
 * list a second time, so the two readings of one fact cannot come to disagree:
 * this one deliberately answers "asked or not asked", and a caller that needs
 * the difference between *unknown* and *withheld* has to reach for the
 * tri-state to get it.
 */
export function advertisesRemoteProjects(
  handshake: EndpointHandshakeResult | null,
): boolean {
  return remoteProjectsCapability(handshake) === 'advertised'
}

/**
 * What a `GET /v0/projects` body turned out to be (MAR-2689).
 *
 * Two outcomes, discriminated, because an empty listing and a body that is not
 * a listing at all are opposite facts that an empty array cannot tell apart. A
 * daemon answering `{"error":"wrong version"}` with HTTP 200 used to reach the
 * strip as "this machine has no Projects" — the same class as S3's "a dead
 * daemon must not look alive" (MAR-2682). What the machine could not say, it
 * does not get to have said for it.
 */
export type RemoteProjectsDecode =
  | { status: 'listing'; projects: RemoteProject[] }
  | { status: 'malformed'; reason: string }

/**
 * Reads the Projects out of a `GET /v0/projects` body (MAR-2689).
 *
 * Defensive rather than strict, and it never throws. The protocol package
 * carries no Projects types at all, so this shape is read from a daemon the
 * package cannot vouch for; an entry the daemon adds a field to must keep
 * listing, and an entry that is missing the two fields a Project cannot be
 * without — an id to send and a directory to work in — must not become a
 * choice the strip offers, because picking it would send a session to a place
 * nobody can name.
 *
 * The two levels are decoded differently on purpose. A single malformed
 * *entry* is skipped: the rest of the listing is still a listing, and refusing
 * the whole of it would hide every Project on the machine over one bad row. A
 * body that is not a listing at all is refused outright and says so, because
 * there is nothing there to be right about.
 *
 * `origin` is optional and stays exactly as the daemon wrote it. Normalising
 * here would be this file deciding what counts as the same repository, which
 * is the strip's question and is answered once, at the match, against the
 * local origin put through the identical rewrite (`normalizeGitHubRemoteUrl`).
 */
export function decodeRemoteProjects(value: unknown): RemoteProjectsDecode {
  const entries = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.projects)
      ? value.projects
      : null
  if (!entries) {
    return {
      status: 'malformed',
      reason:
        'its Projects listing was not a list of Projects. This app reads ' +
        '`GET /v0/projects` as an array, or an object with a `projects` array.',
    }
  }

  const projects: RemoteProject[] = []
  for (const entry of entries) {
    if (!isRecord(entry)) continue
    const id = entry.id
    const workingDirectory = entry.workingDirectory
    if (typeof id !== 'string' || !id) continue
    if (typeof workingDirectory !== 'string' || !workingDirectory) continue
    projects.push({
      id,
      // A Project the daemon named nothing is still a Project, and its id is
      // the honest label: inventing "Untitled" would put a word on the strip
      // that names no directory on that machine.
      name: typeof entry.name === 'string' && entry.name ? entry.name : id,
      workingDirectory,
      origin:
        typeof entry.origin === 'string' && entry.origin ? entry.origin : null,
    })
  }
  return { status: 'listing', projects }
}

/**
 * The catalog one outcome describes (MAR-2689).
 *
 * The single place an outcome becomes the three wire fields, so the three
 * states cannot be spelled out differently at three exits — which is how a
 * malformed body once reached the strip as "this machine has no Projects".
 *
 * A failure keeps `supported: true`: the capability was never disproved, and
 * an unreadable answer reported as `supported: false` would claim the machine
 * offers no Projects when all that is known is that it did not say.
 */
export function remoteProjectCatalogFromOutcome(
  outcome: RemoteProjectsOutcome,
): Omit<RemoteProjectCatalog, 'executionHostId'> {
  switch (outcome.kind) {
    case 'unsupported':
      return { supported: false, projects: [], unreachableReason: null }
    case 'listed':
      return {
        supported: true,
        projects: outcome.projects,
        unreachableReason: null,
      }
    case 'failed':
      return {
        supported: true,
        projects: [],
        unreachableReason: outcome.reason,
      }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
