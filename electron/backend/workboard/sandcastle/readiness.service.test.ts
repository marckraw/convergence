import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { SandcastleReadinessService } from './readiness.service'

describe('SandcastleReadinessService', () => {
  let tempDir: string
  let repoPath: string
  let homePath: string
  let binPath: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'convergence-sandcastle-'))
    repoPath = join(tempDir, 'repo')
    homePath = join(tempDir, 'home')
    binPath = join(tempDir, 'bin')
    mkdirSync(repoPath)
    mkdirSync(homePath)
    mkdirSync(binPath)
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('marks a project without .sandcastle as missing setup', () => {
    const service = new SandcastleReadinessService({
      homeDir: homePath,
      pathEnv: binPath,
    })

    const result = service.checkProject({
      projectId: 'p1',
      repoPath,
      workflowPolicy: 'simple-loop',
      sandboxMode: 'docker',
    })

    expect(result.status).toBe('missing-sandcastle')
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: '.sandcastle folder initialized',
          state: 'fail',
        }),
      ]),
    )
  })

  it('marks a simple loop project ready when files, auth, and Docker CLI exist', () => {
    mkdirSync(join(repoPath, '.sandcastle'))
    mkdirSync(join(homePath, '.claude'))
    mkdirSync(join(homePath, '.codex'))
    writeFileSync(join(repoPath, '.sandcastle', 'run.ts'), '')
    writeFileSync(join(repoPath, '.sandcastle', 'implement-prompt.md'), '')
    writeFileSync(join(repoPath, '.sandcastle', 'Dockerfile'), '')
    writeFileSync(join(binPath, 'docker'), '')

    const service = new SandcastleReadinessService({
      homeDir: homePath,
      pathEnv: binPath,
    })

    const result = service.checkProject({
      projectId: 'p1',
      repoPath,
      workflowPolicy: 'simple-loop',
      sandboxMode: 'docker',
    })

    expect(result.status).toBe('ready')
    expect(result.checks.every((check) => check.state === 'pass')).toBe(true)
  })

  it('requires review prompt for sequential reviewer workflow', () => {
    mkdirSync(join(repoPath, '.sandcastle'))
    writeFileSync(join(repoPath, '.sandcastle', 'run.ts'), '')
    writeFileSync(join(repoPath, '.sandcastle', 'implement-prompt.md'), '')
    writeFileSync(join(repoPath, '.sandcastle', 'Dockerfile'), '')

    const service = new SandcastleReadinessService({
      homeDir: homePath,
      pathEnv: binPath,
    })

    const result = service.checkProject({
      projectId: 'p1',
      repoPath,
      workflowPolicy: 'sequential-reviewer',
      sandboxMode: 'docker',
    })

    expect(result.status).toBe('missing-sandcastle')
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'review prompt exists',
          state: 'fail',
        }),
      ]),
    )
  })

  it('warns about missing auth mounts without blocking file readiness', () => {
    mkdirSync(join(repoPath, '.sandcastle'))
    writeFileSync(join(repoPath, '.sandcastle', 'run.ts'), '')
    writeFileSync(join(repoPath, '.sandcastle', 'implement-prompt.md'), '')
    writeFileSync(join(repoPath, '.sandcastle', 'Dockerfile'), '')
    writeFileSync(join(binPath, 'docker'), '')

    const service = new SandcastleReadinessService({
      homeDir: homePath,
      pathEnv: binPath,
    })

    const result = service.checkProject({
      projectId: 'p1',
      repoPath,
      workflowPolicy: 'simple-loop',
      sandboxMode: 'docker',
    })

    expect(result.status).toBe('auth-risk')
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Claude auth mount files available',
          state: 'warn',
        }),
        expect.objectContaining({
          label: 'Codex auth mount files available',
          state: 'warn',
        }),
      ]),
    )
  })
})
