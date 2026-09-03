import { describe, expect, it } from 'vitest'
import { DEFAULT_PROJECT_SETTINGS } from './project-settings.pure'
import {
  laneBaseBranchLabel,
  laneProgressLabel,
  orderProjectsWithLanes,
} from './project-lanes.pure'
import type { Project } from './project.types'

function project(
  id: string,
  laneOf: string | null = null,
  laneName: string | null = null,
): Project {
  return {
    id,
    name: id,
    repositoryPath: `/repos/${id}`,
    settings: DEFAULT_PROJECT_SETTINGS,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    laneOf,
    laneName,
  }
}

describe('orderProjectsWithLanes', () => {
  it('places each lane directly under its root, keeping the roots in order', () => {
    const entries = orderProjectsWithLanes([
      project('lane-b', 'root-2', 'b'),
      project('root-1'),
      project('lane-a', 'root-1', 'a'),
      project('root-2'),
      project('lane-c', 'root-1', 'c'),
    ])

    expect(entries.map((entry) => [entry.project.id, entry.depth])).toEqual([
      ['root-1', 0],
      ['lane-a', 1],
      ['lane-c', 1],
      ['root-2', 0],
      ['lane-b', 1],
    ])
  })

  it('keeps a lane whose root is not listed, at the top level', () => {
    const entries = orderProjectsWithLanes([project('orphan', 'gone', 'x')])
    expect(entries).toEqual([
      { project: project('orphan', 'gone', 'x'), depth: 0 },
    ])
  })

  it('leaves a list without lanes exactly as it was', () => {
    const list = [project('a'), project('b')]
    expect(orderProjectsWithLanes(list).map((e) => e.project)).toEqual(list)
  })
})

describe('laneProgressLabel', () => {
  it('names every phase, and the moment before the first one', () => {
    expect(laneProgressLabel(null)).toBe('Starting…')
    expect(laneProgressLabel('copying')).toBe('Copying the project…')
    expect(laneProgressLabel('preparing-branch')).toBe('Preparing the branch…')
    expect(laneProgressLabel('recording')).toBe('Recording the lane…')
    expect(laneProgressLabel('done')).toBe('Lane ready.')
  })
})

// L5 (round 2): the label reads what the service will do. The service takes
// the project's base branch name whatever the workspace start strategy says,
// and falls back to origin's default branch when none is set. L3 (round 3):
// when origin has no such branch the service cuts from the local one, and
// the label says so.
describe('laneBaseBranchLabel', () => {
  it('names origin/<base>, or the local <base> if origin has none, whatever the strategy', () => {
    expect(
      laneBaseBranchLabel({
        ...DEFAULT_PROJECT_SETTINGS,
        workspaceCreation: {
          ...DEFAULT_PROJECT_SETTINGS.workspaceCreation,
          startStrategy: 'current-head',
          baseBranchName: ' develop ',
        },
      }),
    ).toBe('origin/develop, or the local develop if origin has none')
    expect(
      laneBaseBranchLabel({
        ...DEFAULT_PROJECT_SETTINGS,
        workspaceCreation: {
          ...DEFAULT_PROJECT_SETTINGS.workspaceCreation,
          startStrategy: 'base-branch',
          baseBranchName: 'develop',
        },
      }),
    ).toBe('origin/develop, or the local develop if origin has none')
  })

  it("names origin's default branch when none is set, whatever the strategy", () => {
    for (const startStrategy of ['current-head', 'base-branch'] as const) {
      expect(
        laneBaseBranchLabel({
          ...DEFAULT_PROJECT_SETTINGS,
          workspaceCreation: {
            ...DEFAULT_PROJECT_SETTINGS.workspaceCreation,
            startStrategy,
            baseBranchName: null,
          },
        }),
      ).toBe("origin's default branch")
    }
  })
})
