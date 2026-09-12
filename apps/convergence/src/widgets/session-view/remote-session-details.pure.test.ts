import { describe, expect, it } from 'vitest'
import type {
  ReportedWorkspace,
  SessionWorkAddress,
} from '@/shared/lib/work-address.pure'
import { resolveRemoteSessionDetails } from './remote-session-details.pure'

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
      unreadable: null,
    })
  })
})
