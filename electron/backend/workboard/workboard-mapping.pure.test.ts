import { describe, expect, it } from 'vitest'
import {
  findMappingForIssue,
  mappingMatchesIssue,
} from './workboard-mapping.pure'
import type {
  WorkboardProjectMappingWithProjectRecord,
  WorkboardTrackerIssueRecord,
} from './workboard.types'

const baseMapping: WorkboardProjectMappingWithProjectRecord = {
  id: 'mapping-1',
  sourceId: 'source-linear',
  name: 'Linear CONV',
  enabled: true,
  priority: 10,
  matcher: {},
  projectId: 'p1',
  projectName: 'convergence',
  repositoryPath: '/tmp/convergence',
  workflowPolicy: 'simple-loop',
  sandboxMode: 'docker',
  branchPrefix: 'sandcastle',
  stageDefaults: {},
  createdAt: '',
  updatedAt: '',
}

const baseIssue: WorkboardTrackerIssueRecord = {
  id: 'issue-1',
  sourceId: 'source-linear',
  externalId: 'lin-1',
  externalKey: 'CONV-209',
  url: 'https://linear.app/acme/issue/CONV-209',
  title: 'Inline comments',
  body: '',
  labels: ['convergence-loop', 'loop-ready', 'frontend'],
  status: 'Todo',
  priority: 'High',
  assignee: null,
  updatedAtExternal: null,
  raw: { teamKey: 'CONV', projectName: 'Workboard' },
  lastSeenAt: '',
  createdAt: '',
  updatedAt: '',
}

describe('workboard-mapping.pure', () => {
  it('matches source, labels, and Linear metadata', () => {
    expect(
      mappingMatchesIssue(
        {
          ...baseMapping,
          matcher: {
            labels: ['convergence-loop'],
            teamKey: 'CONV',
            projectName: 'Workboard',
          },
        },
        baseIssue,
      ),
    ).toBe(true)
  })

  it('matches Jira project key and components', () => {
    expect(
      mappingMatchesIssue(
        {
          ...baseMapping,
          sourceId: 'source-jira',
          matcher: {
            projectKey: 'API',
            components: ['Backend'],
          },
        },
        {
          ...baseIssue,
          sourceId: 'source-jira',
          externalKey: 'API-812',
          raw: { projectKey: 'API', components: ['Backend'] },
        },
      ),
    ).toBe(true)
  })

  it('ignores disabled mappings and source mismatches', () => {
    expect(
      mappingMatchesIssue({ ...baseMapping, enabled: false }, baseIssue),
    ).toBe(false)
    expect(
      mappingMatchesIssue(
        { ...baseMapping, sourceId: 'source-jira' },
        baseIssue,
      ),
    ).toBe(false)
  })

  it('chooses the highest priority matching mapping', () => {
    const chosen = findMappingForIssue(
      [
        { ...baseMapping, id: 'low', priority: 1 },
        { ...baseMapping, id: 'high', priority: 99 },
      ],
      baseIssue,
    )

    expect(chosen?.id).toBe('high')
  })
})
