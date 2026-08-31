import { describe, expect, it } from 'vitest'
import type {
  ReportedWorkspace,
  SessionWorkAddress,
} from '@/shared/lib/work-address.pure'
import {
  describeRemotePullRequest,
  NO_REMOTE_PULL_REQUEST_LABEL,
  resolveRemoteSessionDetails,
} from './remote-session-details.pure'

const ERRAND_ADDRESS: SessionWorkAddress = {
  mode: 'repository',
  repository: 'https://github.com/marckraw/convergence.git',
  branchName: 'agent/mar-2694',
  label: 'marckraw/convergence',
}

const REPORTED: ReportedWorkspace = {
  mode: 'repository',
  repository: 'https://github.com/marckraw/convergence.git',
  branchName: 'agent/34372e47',
  baseRef: 'master',
  workspacePath: '/srv/worktrees/s-1',
  environment: null,
}

describe('the remote session detail rows (MAR-2718)', () => {
  /**
   * The record first, the fetch second (MAR-2694). The daemon echoes its
   * workspace in the start response, so the record holds the answer from the
   * first second and the panel never has to wait for a round trip.
   *
   * Mutation: read the fetch before the record and this goes red -- the older
   * answer would win over the one the start already recorded.
   */
  it('reads the record before the fetch', () => {
    expect(
      resolveRemoteSessionDetails({
        workAddress: ERRAND_ADDRESS,
        recordedWorkspace: REPORTED,
        fetched: {
          ok: true,
          workspace: { ...REPORTED, branchName: 'agent/stale' },
          pullRequest: { kind: 'none' },
        },
      }).branch,
    ).toBe('agent/34372e47')
  })

  it('falls back to the fetch for a session the record never learned about', () => {
    expect(
      resolveRemoteSessionDetails({
        workAddress: ERRAND_ADDRESS,
        recordedWorkspace: null,
        fetched: {
          ok: true,
          workspace: REPORTED,
          pullRequest: { kind: 'none' },
        },
      }).branch,
    ).toBe('agent/34372e47')
  })

  /**
   * A fetch that failed does not un-know a fact the record already holds. The
   * panel would otherwise say the workspace is unreadable directly underneath
   * the workspace.
   *
   * Mutation: report the fetch failure unconditionally and this goes red.
   */
  it('keeps the record when a later fetch fails, and says so only when it is all we have', () => {
    expect(
      resolveRemoteSessionDetails({
        workAddress: ERRAND_ADDRESS,
        recordedWorkspace: REPORTED,
        fetched: { ok: false, message: 'daemon unreachable' },
      }),
    ).toEqual({
      worksIn: 'marckraw/convergence',
      remoteRepository: 'marckraw/convergence',
      branch: 'agent/34372e47',
      requestedBranch: 'agent/mar-2694',
      // The workspace survives the failed fetch; the pull request, which only
      // the fetch knows, says the fetch failed rather than "None yet".
      pullRequest: { state: 'unavailable', message: 'daemon unreachable' },
      unreadable: null,
    })

    expect(
      resolveRemoteSessionDetails({
        workAddress: ERRAND_ADDRESS,
        recordedWorkspace: null,
        fetched: { ok: false, message: 'daemon unreachable' },
      }).unreadable,
    ).toBe('daemon unreachable')
  })

  it('shows the daemon pull request when it has opened one', () => {
    expect(
      resolveRemoteSessionDetails({
        workAddress: ERRAND_ADDRESS,
        recordedWorkspace: REPORTED,
        fetched: {
          ok: true,
          workspace: REPORTED,
          pullRequest: {
            kind: 'url',
            url: 'https://github.com/marckraw/convergence/pull/544',
          },
        },
      }).pullRequest,
    ).toEqual({
      state: 'url',
      url: 'https://github.com/marckraw/convergence/pull/544',
    })
  })

  /**
   * A residency has no clone URL to report -- it works in a checkout that
   * already exists -- so the repository row stays off rather than printing the
   * Project's origin as though the daemon had cloned it.
   */
  it('reports no remote repository for a Project on the machine', () => {
    expect(
      resolveRemoteSessionDetails({
        workAddress: {
          mode: 'project',
          projectId: 'new-blok',
          workingDirectory: '/srv/projects/new-blok',
          label: 'Project new-blok',
        },
        recordedWorkspace: {
          mode: 'project',
          projectId: 'new-blok',
          workingDirectory: '/srv/projects/new-blok',
          origin: 'https://github.com/marckraw/new-blok.git',
          originKey: 'github.com/marckraw/new-blok',
          branchName: 'master',
          environment: null,
        },
        fetched: null,
      }),
    ).toEqual({
      worksIn: 'Project new-blok',
      remoteRepository: null,
      branch: 'master',
      requestedBranch: null,
      pullRequest: { state: 'asking' },
      unreadable: null,
    })
  })

  it('says Unknown for a session born before places were recorded', () => {
    expect(
      resolveRemoteSessionDetails({
        workAddress: { mode: 'unknown' },
        recordedWorkspace: null,
        fetched: null,
      }),
    ).toEqual({
      worksIn: 'Unknown',
      remoteRepository: null,
      branch: null,
      requestedBranch: null,
      pullRequest: { state: 'asking' },
      unreadable: null,
    })
  })
})

/**
 * `None yet` is a claim about the daemon -- it looked and opened none -- and it
 * used to be printed whenever `fetched` was null, which covered a fetch still in
 * flight and a fetch that failed just as much as a real negative answer
 * (MAR-2718 round 2). Nothing above the strip may lie (MAR-2619).
 *
 * Mutation: collapse any of the first three states to
 * `NO_REMOTE_PULL_REQUEST_LABEL` -- or read `prUrl` off a null fetch again --
 * and this goes red.
 */
describe('the remote pull request reading (MAR-2718)', () => {
  const withFetch = (
    fetched: Parameters<typeof resolveRemoteSessionDetails>[0]['fetched'],
  ): string =>
    describeRemotePullRequest(
      resolveRemoteSessionDetails({
        workAddress: ERRAND_ADDRESS,
        recordedWorkspace: REPORTED,
        fetched,
      }).pullRequest,
    )

  it('says None yet only when the daemon said none', () => {
    expect(withFetch(null)).toBe('Asking…')
    expect(withFetch({ ok: false, message: 'daemon unreachable' })).toBe(
      'Could not read: daemon unreachable',
    )
    expect(
      withFetch({
        ok: true,
        workspace: REPORTED,
        pullRequest: { kind: 'none' },
      }),
    ).toBe(NO_REMOTE_PULL_REQUEST_LABEL)
    expect(
      withFetch({
        ok: true,
        workspace: REPORTED,
        pullRequest: {
          kind: 'url',
          url: 'https://github.com/marckraw/convergence/pull/544',
        },
      }),
    ).toBe('https://github.com/marckraw/convergence/pull/544')
  })

  /**
   * The fifth situation, and the one the wire door used to hide (MAR-2718
   * round 2): the daemon answered, the fetch succeeded, and the field it sent
   * was not a pull request -- missing, a number, a blank string, `ftp://x`.
   * That is not the daemon saying it opened none, so the row may not say so.
   *
   * The reason comes from the door that read the bytes and is shown, because
   * "could not read" without what could not be read sends him looking at the
   * wrong machine.
   *
   * Mutation: map `unreadable` to `{ state: 'none' }` in
   * `readRemotePullRequest` and this goes red.
   */
  it('says the read failed when the daemon sent something unreadable', () => {
    expect(
      withFetch({
        ok: true,
        workspace: REPORTED,
        pullRequest: {
          kind: 'unreadable',
          reason: 'the daemon sent no pull request field',
        },
      }),
    ).toBe('Could not read: the daemon sent no pull request field')
  })
})
