import { describe, expect, it } from 'vitest'
import type { ExecutionSessionWorkspace } from '@mrck-labs/execution-host-protocol'
import {
  parseReportedWorkspace,
  serializeReportedWorkspace,
} from './reported-workspace.pure'

const ERRAND: ExecutionSessionWorkspace = {
  mode: 'repository',
  repository: 'https://github.com/marckraw/new-blok.git',
  branchName: 'agent/34372e47',
  baseRef: 'master',
  workspacePath: '/srv/worktrees/s-1',
  environment: null,
}

const RESIDENCY: ExecutionSessionWorkspace = {
  mode: 'project',
  projectId: 'new-blok',
  workingDirectory: '/srv/projects/new-blok',
  origin: 'https://github.com/marckraw/new-blok.git',
  originKey: 'github.com/marckraw/new-blok',
  branchName: 'master',
  requestedBranchName: 'agent/mar-2694',
  environment: null,
}

describe('the reported workspace column (MAR-2694)', () => {
  it('carries both modes through the column unchanged', () => {
    expect(parseReportedWorkspace(serializeReportedWorkspace(ERRAND))).toEqual(
      ERRAND,
    )
    expect(
      parseReportedWorkspace(serializeReportedWorkspace(RESIDENCY)),
    ).toEqual(RESIDENCY)
  })

  it('reads a local row, which never has one, as nothing', () => {
    expect(parseReportedWorkspace(null)).toBeNull()
    expect(parseReportedWorkspace(undefined)).toBeNull()
    expect(parseReportedWorkspace('   ')).toBeNull()
  })

  /**
   * Quiet here and loud at the wire, on purpose. A daemon sending something
   * unreadable right now is news and `fetchSessionWorkspaceInfo` refuses out
   * loud; a row written under an older build is history, and history that
   * cannot be read is best said to be unknown rather than allowed to take the
   * app down at boot.
   *
   * Mutation: throw on an undecodable column and this goes red.
   */
  it('never throws on a half-written or unreadable row', () => {
    expect(parseReportedWorkspace('{')).toBeNull()
    expect(parseReportedWorkspace('"repository"')).toBeNull()
    expect(parseReportedWorkspace('{"mode":"somewhere-new"}')).toBeNull()
    expect(parseReportedWorkspace('{"mode":"repository"}')).toBeNull()
  })
})
