import type { RemoteSessionPullRequest } from '@/entities/app-settings'
import {
  describeCloneableRepository,
  describeStatedBranch,
  statedWorkPlace,
  type ReportedWorkspace,
  type SessionWorkAddress,
} from '@/shared/lib/work-address.pure'

/** What the Pull request row says when the daemon has opened none yet. */
export const NO_REMOTE_PULL_REQUEST_LABEL = 'None yet'

/**
 * What is known about a remote session's pull request, as a reading rather than
 * a string (MAR-2718 round 2).
 *
 * The row used to render `fetched?.prUrl ?? 'None yet'`, and `fetched` was null
 * for two entirely different situations: the fetch had not come back yet, and
 * the fetch had failed. Both printed `None yet`, which is a claim about the
 * daemon -- it looked at this session and opened no pull request -- made in the
 * one case where the daemon had said nothing at all. Nothing above the strip
 * may lie, and this panel is the strip's own drawer (MAR-2619).
 *
 * Four states, so the one negative answer is only available when the daemon
 * actually gave it.
 */
export type RemotePullRequestReading =
  /** The fetch has not come back yet. */
  | { state: 'asking' }
  /** The fetch failed, and this is why. */
  | { state: 'unavailable'; message: string }
  /** The daemon answered, and it has opened none. */
  | { state: 'none' }
  /** The daemon answered with one. */
  | { state: 'url'; url: string }

/** The words the Pull request row shows for a reading (MAR-2718 round 2). */
export function describeRemotePullRequest(
  reading: RemotePullRequestReading,
): string {
  switch (reading.state) {
    case 'asking':
      return 'Asking…'
    case 'unavailable':
      return `Could not read: ${reading.message}`
    case 'none':
      return NO_REMOTE_PULL_REQUEST_LABEL
    case 'url':
      return reading.url
  }
}

/**
 * The rows Session details shows for a remote session (MAR-2718).
 *
 * The panel used to show four remote rows and then, underneath them, the two
 * rows a *local* session gets: `Branch`, read off the local checkout's HEAD,
 * and `Pull request`, keyed on the local worktree. A remote session has neither
 * — it does not run on this machine and has no worktree here — so those rows
 * described a checkout the session never touched, and `Pull request — No
 * workspace` sat two rows beneath a daemon-reported workspace, contradicting it
 * on the face of the panel. In Project mode there was no remote repository row
 * at all, so the local `Branch — master` read as though it were the session's.
 *
 * Nothing above the strip may lie (MAR-2619), and this panel is the strip's own
 * drawer. So on a remote session those two rows carry the remote facts, and the
 * separate `Remote branch` / `Remote pull request` rows go away with them: one
 * row per fact, not two rows racing to describe it.
 *
 * The record is read before the fetch, and that order is the point of C2. The
 * daemon echoes its materialised workspace in the start response, so the record
 * holds the answer from the first second; a fetch is what fills a session born
 * before that existed, or one whose daemon predates the echo. A fetch that
 * failed leaves the record's answer standing rather than replacing it with an
 * error — the panel would otherwise forget a fact it already had because a
 * later question timed out.
 */
export interface RemoteSessionDetailRows {
  /** The place the strip stated before send. */
  worksIn: string
  /** The clone URL the daemon actually used, when it reported one. */
  remoteRepository: string | null
  /** The branch row: the daemon's, else the one written down, else null. */
  branch: string | null
  /** The branch that was asked for, when the daemon cut a different one. */
  requestedBranch: string | null
  /** The pull request row: asking, unreadable, none, or the daemon's URL. */
  pullRequest: RemotePullRequestReading
  /** Why the daemon could not be asked, when the record has no answer. */
  unreadable: string | null
}

export interface RemoteSessionDetailsInput {
  /** The place recorded when the session was born. */
  workAddress: SessionWorkAddress | null | undefined
  /** What the record holds of the daemon's own answer. */
  recordedWorkspace: ReportedWorkspace | null | undefined
  /** What a panel fetch came back with, when one has landed. */
  fetched:
    | {
        ok: true
        workspace: ReportedWorkspace | null
        pullRequest: RemoteSessionPullRequest
      }
    | { ok: false; message: string }
    | null
}

export function resolveRemoteSessionDetails(
  input: RemoteSessionDetailsInput,
): RemoteSessionDetailRows {
  const fetched = input.fetched?.ok === true ? input.fetched : null
  const workspace = input.recordedWorkspace ?? fetched?.workspace ?? null
  const statement = statedWorkPlace(input.workAddress, workspace)

  return {
    worksIn: statement.place,
    remoteRepository:
      workspace?.mode === 'repository'
        ? describeCloneableRepository(workspace.repository)
        : null,
    branch: describeStatedBranch(statement),
    requestedBranch: statement.requestedBranchName,
    pullRequest: readRemotePullRequest(input.fetched),
    // Said only when it is the whole of what we know. A record that already
    // carries the daemon's answer does not become unknown because a later
    // fetch failed, and printing both would tell him the workspace is
    // unreadable directly under the workspace.
    unreadable:
      input.fetched?.ok === false && !input.recordedWorkspace
        ? input.fetched.message
        : null,
  }
}

/**
 * The pull request, read from the one thing that knows about it: the fetch.
 *
 * The record carries the workspace and not the pull request, so an absent fetch
 * is an absent answer and says so. Beyond that this only renames what the wire
 * door already decided: a fetch that failed and a fetch that came back
 * unreadable are the same thing to a reader -- nobody looked and lived to tell
 * -- and they share one row. `None yet` is reachable from exactly one place,
 * the daemon's own explicit negative (MAR-2718 round 2).
 */
function readRemotePullRequest(
  fetched: RemoteSessionDetailsInput['fetched'],
): RemotePullRequestReading {
  if (!fetched) return { state: 'asking' }
  if (!fetched.ok) return { state: 'unavailable', message: fetched.message }
  switch (fetched.pullRequest.kind) {
    case 'none':
      return { state: 'none' }
    case 'url':
      return { state: 'url', url: fetched.pullRequest.url }
    case 'unreadable':
      return { state: 'unavailable', message: fetched.pullRequest.reason }
  }
}
