import {
  describeCloneableRepository,
  describeStatedBranch,
  statedWorkPlace,
  type ReportedWorkspace,
  type SessionWorkAddress,
} from '@/shared/lib/work-address.pure'

/** Remote workspace rows prefer the recorded start response to a later fetch. */
export interface RemoteSessionDetailRows {
  /** The place the strip stated before send. */
  worksIn: string
  /** The clone URL the daemon actually used, when it reported one. */
  remoteRepository: string | null
  /** The branch row: the daemon's, else the one written down, else null. */
  branch: string | null
  /** The branch that was asked for, when the daemon cut a different one. */
  requestedBranch: string | null
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
