import {
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { WorkspaceEnvService } from './workspace-env.service'

describe('WorkspaceEnvService', () => {
  let tempDir: string
  let sourcePath: string
  let workspacePath: string
  let service: WorkspaceEnvService

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'convergence-env-sync-'))
    sourcePath = join(tempDir, 'source')
    workspacePath = join(tempDir, 'workspace')
    rmSync(sourcePath, { recursive: true, force: true })
    rmSync(workspacePath, { recursive: true, force: true })
    service = new WorkspaceEnvService()
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  function makeDirs(): void {
    rmSync(sourcePath, { recursive: true, force: true })
    rmSync(workspacePath, { recursive: true, force: true })
    mkdirSync(sourcePath, { recursive: true })
    mkdirSync(workspacePath, { recursive: true })
  }

  it('overwrites regular env files', () => {
    makeDirs()
    writeFileSync(join(sourcePath, '.env'), 'ROOT_TOKEN=new\n')
    writeFileSync(join(workspacePath, '.env'), 'ROOT_TOKEN=old\n')

    const result = service.syncEnvFiles({
      sourcePath,
      workspacePath,
      settings: { copyMode: 'overwrite', patterns: ['.env'] },
    })

    expect(result).toEqual({ copied: 1, skipped: 0 })
    expect(readFileSync(join(workspacePath, '.env'), 'utf8')).toBe(
      'ROOT_TOKEN=new\n',
    )
  })

  it('skips destination symlinks in overwrite mode without writing through them', () => {
    makeDirs()
    const outsideTarget = join(tempDir, 'outside-target')
    writeFileSync(join(sourcePath, '.env'), 'ROOT_TOKEN=secret\n')
    writeFileSync(outsideTarget, 'outside-original\n')
    symlinkSync(outsideTarget, join(workspacePath, '.env'))

    const result = service.syncEnvFiles({
      sourcePath,
      workspacePath,
      settings: { copyMode: 'overwrite', patterns: ['.env'] },
    })

    expect(result).toEqual({ copied: 0, skipped: 1 })
    expect(readFileSync(outsideTarget, 'utf8')).toBe('outside-original\n')
    expect(lstatSync(join(workspacePath, '.env')).isSymbolicLink()).toBe(true)
  })

  it('replaces hard-linked destination files without modifying the outside link', () => {
    makeDirs()
    const outsideTarget = join(tempDir, 'outside-hardlink-target')
    writeFileSync(join(sourcePath, '.env'), 'ROOT_TOKEN=secret\n')
    writeFileSync(outsideTarget, 'outside-original\n')
    linkSync(outsideTarget, join(workspacePath, '.env'))

    const result = service.syncEnvFiles({
      sourcePath,
      workspacePath,
      settings: { copyMode: 'overwrite', patterns: ['.env'] },
    })

    expect(result).toEqual({ copied: 1, skipped: 0 })
    expect(readFileSync(outsideTarget, 'utf8')).toBe('outside-original\n')
    expect(readFileSync(join(workspacePath, '.env'), 'utf8')).toBe(
      'ROOT_TOKEN=secret\n',
    )
    expect(existsSync(join(workspacePath, '.env'))).toBe(true)
  })
})
