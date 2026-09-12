import { expect, it } from 'vitest'
import { spawnSpecProblem } from './spawn-spec.pure'

it('bounds the role card at 8000 characters (mutation: remove the role-card limit)', () => {
  expect(
    spawnSpecProblem({
      projectId: null,
      executionHost: 'local',
      roleCard: 'x'.repeat(8001),
    }),
  ).toBe('A role card cannot be longer than 8000 characters')
})

it('reports malformed addresses with the decoder reason (mutation: replace the reason with pick a place)', () => {
  expect(
    spawnSpecProblem({
      projectId: 'p1',
      executionHost: 'little-monster',
      workAddress: {
        mode: 'project',
        projectId: 'remote',
        workingDirectory: '',
        label: 'Remote',
      },
    }),
  ).toContain(
    'a work address is { mode: "project", projectId, workingDirectory, label }',
  )
})
