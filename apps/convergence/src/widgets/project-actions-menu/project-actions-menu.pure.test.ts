import { describe, expect, it } from 'vitest'
import type { ProjectScriptRun } from '@/entities/project-script'
import {
  formatProjectActionRunMeta,
  isProjectScriptRunActive,
} from './project-actions-menu.pure'

function makeRun(overrides: Partial<ProjectScriptRun> = {}): ProjectScriptRun {
  return {
    id: 'run-1',
    scriptId: 'script-1',
    projectId: 'project-1',
    command: 'npm run dev',
    cwd: '/tmp/project',
    status: 'running',
    startedAt: '2026-01-01T12:34:56.000Z',
    endedAt: null,
    exitCode: null,
    signal: null,
    errorMessage: null,
    stdout: '',
    stderr: '',
    ...overrides,
  }
}

describe('project actions menu helpers', () => {
  it('treats queued and running runs as active', () => {
    expect(isProjectScriptRunActive(makeRun({ status: 'queued' }))).toBe(true)
    expect(isProjectScriptRunActive(makeRun({ status: 'running' }))).toBe(true)
    expect(isProjectScriptRunActive(makeRun({ status: 'succeeded' }))).toBe(
      false,
    )
    expect(isProjectScriptRunActive(null)).toBe(false)
  })

  it('formats run metadata for menu rows', () => {
    expect(formatProjectActionRunMeta(null)).toBe('idle')
    expect(formatProjectActionRunMeta(makeRun({ status: 'failed' }))).toBe(
      'failed',
    )
  })
})
