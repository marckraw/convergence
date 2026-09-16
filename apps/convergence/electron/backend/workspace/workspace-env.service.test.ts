import { execFileSync } from 'child_process'
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

  /** Fixture repo: gitignored fake env files only — never a real project .env. */
  function makeIgnoredEnvRepo(): void {
    makeDirs()
    execFileSync('git', ['init'], { cwd: sourcePath, stdio: 'ignore' })
    writeFileSync(join(sourcePath, '.gitignore'), '.env*\n')
    writeFileSync(join(sourcePath, '.env'), 'ROOT_FAKE=1\n')
    mkdirSync(join(sourcePath, 'apps', 'a'), { recursive: true })
    mkdirSync(join(sourcePath, 'apps', 'b'), { recursive: true })
    mkdirSync(join(sourcePath, 'node_modules', 'x'), { recursive: true })
    writeFileSync(join(sourcePath, 'apps', 'a', '.env'), 'APP_A_FAKE=1\n')
    writeFileSync(
      join(sourcePath, 'apps', 'b', '.env.local'),
      'APP_B_FAKE=local\n',
    )
    writeFileSync(
      join(sourcePath, 'apps', 'a', '.env.example'),
      'APP_A_EXAMPLE=1\n',
    )
    writeFileSync(join(sourcePath, 'node_modules', 'x', '.env'), 'DEP_FAKE=1\n')
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

    expect(result).toEqual({
      copied: 1,
      skipped: 0,
      paths: ['.env'],
      fallback: 'root-readdir',
    })
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

    expect(result).toEqual({
      copied: 0,
      skipped: 1,
      paths: [],
      fallback: 'root-readdir',
    })
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

    expect(result).toEqual({
      copied: 1,
      skipped: 0,
      paths: ['.env'],
      fallback: 'root-readdir',
    })
    expect(readFileSync(outsideTarget, 'utf8')).toBe('outside-original\n')
    expect(readFileSync(join(workspacePath, '.env'), 'utf8')).toBe(
      'ROOT_TOKEN=secret\n',
    )
    expect(existsSync(join(workspacePath, '.env'))).toBe(true)
  })

  it('copies nested ignored env files into the same relative workspace paths (MAR-2778)', () => {
    makeIgnoredEnvRepo()

    const result = service.syncEnvFiles({
      sourcePath,
      workspacePath,
      settings: { copyMode: 'overwrite', patterns: ['.env', '.env.*'] },
    })

    expect([...result.paths].sort()).toEqual([
      '.env',
      'apps/a/.env',
      'apps/b/.env.local',
    ])
    expect(result.fallback).toBeNull()
    expect(result.copied).toBe(3)
    expect(readFileSync(join(workspacePath, '.env'), 'utf8')).toBe(
      'ROOT_FAKE=1\n',
    )
    expect(readFileSync(join(workspacePath, 'apps', 'a', '.env'), 'utf8')).toBe(
      'APP_A_FAKE=1\n',
    )
    expect(
      readFileSync(join(workspacePath, 'apps', 'b', '.env.local'), 'utf8'),
    ).toBe('APP_B_FAKE=local\n')
    expect(existsSync(join(workspacePath, 'apps', 'a', '.env.example'))).toBe(
      false,
    )
    expect(existsSync(join(workspacePath, 'node_modules', 'x', '.env'))).toBe(
      false,
    )
  })

  it('leaves an existing nested env file alone in copy-missing mode', () => {
    makeIgnoredEnvRepo()
    mkdirSync(join(workspacePath, 'apps', 'a'), { recursive: true })
    writeFileSync(
      join(workspacePath, 'apps', 'a', '.env'),
      'APP_A_WORKSPACE_EDIT=keep\n',
    )

    const result = service.syncEnvFiles({
      sourcePath,
      workspacePath,
      settings: { copyMode: 'copy-missing', patterns: ['.env', '.env.*'] },
    })

    expect(result.fallback).toBeNull()
    expect(readFileSync(join(workspacePath, 'apps', 'a', '.env'), 'utf8')).toBe(
      'APP_A_WORKSPACE_EDIT=keep\n',
    )
    expect(result.paths).not.toContain('apps/a/.env')
    expect(result.paths).toEqual(
      expect.arrayContaining(['.env', 'apps/b/.env.local']),
    )
  })

  it('overwrites an existing nested env file when copyMode is overwrite', () => {
    makeIgnoredEnvRepo()
    mkdirSync(join(workspacePath, 'apps', 'a'), { recursive: true })
    writeFileSync(
      join(workspacePath, 'apps', 'a', '.env'),
      'APP_A_WORKSPACE_EDIT=old\n',
    )

    const result = service.syncEnvFiles({
      sourcePath,
      workspacePath,
      settings: { copyMode: 'overwrite', patterns: ['.env', '.env.*'] },
    })

    expect(result.paths).toEqual(expect.arrayContaining(['apps/a/.env']))
    expect(readFileSync(join(workspacePath, 'apps', 'a', '.env'), 'utf8')).toBe(
      'APP_A_FAKE=1\n',
    )
  })

  it('falls back to root readdir when the source is not a git repository', () => {
    makeDirs()
    writeFileSync(join(sourcePath, '.env'), 'ROOT_FAKE=1\n')
    mkdirSync(join(sourcePath, 'apps', 'a'), { recursive: true })
    writeFileSync(join(sourcePath, 'apps', 'a', '.env'), 'APP_A_FAKE=1\n')

    const result = service.syncEnvFiles({
      sourcePath,
      workspacePath,
      settings: { copyMode: 'overwrite', patterns: ['.env', '.env.*'] },
    })

    expect(result).toEqual({
      copied: 1,
      skipped: 0,
      paths: ['.env'],
      fallback: 'root-readdir',
    })
    expect(existsSync(join(workspacePath, 'apps', 'a', '.env'))).toBe(false)
  })
})
