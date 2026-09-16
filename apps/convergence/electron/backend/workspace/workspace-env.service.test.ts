import { execFileSync } from 'child_process'
import {
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type GitLsFilesRunner,
  WORKSPACE_ENV_GIT_LS_FILES_ARGS,
  WORKSPACE_ENV_GIT_LS_FILES_MAX_BUFFER,
  WorkspaceEnvService,
} from './workspace-env.service'

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
    vi.restoreAllMocks()
  })

  function makeDirs(): void {
    rmSync(sourcePath, { recursive: true, force: true })
    rmSync(workspacePath, { recursive: true, force: true })
    mkdirSync(sourcePath, { recursive: true })
    mkdirSync(workspacePath, { recursive: true })
  }

  function git(args: string[]): void {
    execFileSync('git', args, { cwd: sourcePath, stdio: 'ignore' })
  }

  /**
   * Fixture repo with tracked app parents so `--directory` still lists nested
   * env files. Every env body is fake — never a real project secret.
   */
  function makeIgnoredEnvRepo(): void {
    makeDirs()
    git(['init'])
    git(['config', 'user.email', 'test@test.com'])
    git(['config', 'user.name', 'Test'])
    writeFileSync(join(sourcePath, '.gitignore'), '.env*\n')
    mkdirSync(join(sourcePath, 'apps', 'a'), { recursive: true })
    mkdirSync(join(sourcePath, 'apps', 'b'), { recursive: true })
    writeFileSync(join(sourcePath, 'apps', 'a', 'README'), 'tracked\n')
    writeFileSync(join(sourcePath, 'apps', 'b', 'README'), 'tracked\n')
    git(['add', '.gitignore', 'apps/a/README', 'apps/b/README'])
    git(['commit', '-m', 'track app parents'])
    writeFileSync(join(sourcePath, '.env'), 'ROOT_FAKE=1\n')
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

  it('spawns git ls-files with --directory and a large maxBuffer (MAR-2778 A)', () => {
    makeDirs()
    const runner = vi.fn<GitLsFilesRunner>(() => Buffer.from('.env\0'))
    writeFileSync(join(sourcePath, '.env'), 'ROOT_FAKE=1\n')
    const local = new WorkspaceEnvService(runner)

    local.syncEnvFiles({
      sourcePath,
      workspacePath,
      settings: { copyMode: 'overwrite', patterns: ['.env'] },
    })

    expect(runner).toHaveBeenCalledTimes(1)
    const [command, args, options] = runner.mock.calls[0]!
    expect(command).toBe('git')
    expect([...args]).toEqual([...WORKSPACE_ENV_GIT_LS_FILES_ARGS])
    expect(args).toContain('--directory')
    expect(args).not.toContain('--exclude-standard')
    expect(args).not.toContain('--ignored')
    expect(options.maxBuffer).toBeGreaterThanOrEqual(16 * 1024 * 1024)
    expect(options.maxBuffer).toBe(WORKSPACE_ENV_GIT_LS_FILES_MAX_BUFFER)
  })

  it('warns and falls back when the git runner throws ENOBUFS (MAR-2778 A)', () => {
    makeDirs()
    writeFileSync(join(sourcePath, '.env'), 'ROOT_FAKE=1\n')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = Object.assign(new Error('spawnSync git ENOBUFS'), {
      code: 'ENOBUFS',
    })
    const runner = vi.fn<GitLsFilesRunner>(() => {
      throw error
    })
    const local = new WorkspaceEnvService(runner)

    const result = local.syncEnvFiles({
      sourcePath,
      workspacePath,
      settings: { copyMode: 'overwrite', patterns: ['.env'] },
    })

    expect(result.fallback).toBe('root-readdir')
    expect(result.paths).toEqual(['.env'])
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ENOBUFS'))
  })

  it('copies untracked env files when the repo has no .gitignore (MAR-2778 B)', () => {
    makeDirs()
    git(['init'])
    git(['config', 'user.email', 'test@test.com'])
    git(['config', 'user.name', 'Test'])
    mkdirSync(join(sourcePath, 'apps', 'a'), { recursive: true })
    writeFileSync(join(sourcePath, 'apps', 'a', 'README'), 'tracked\n')
    git(['add', 'apps/a/README'])
    git(['commit', '-m', 'track'])
    writeFileSync(join(sourcePath, '.env'), 'ROOT_FAKE=1\n')
    writeFileSync(join(sourcePath, 'apps', 'a', '.env'), 'APP_A_FAKE=1\n')

    const result = service.syncEnvFiles({
      sourcePath,
      workspacePath,
      settings: { copyMode: 'overwrite', patterns: ['.env', '.env.*'] },
    })

    expect(result.fallback).toBeNull()
    expect([...result.paths].sort()).toEqual(['.env', 'apps/a/.env'])
  })

  it('does not copy a tracked root .env — the checkout already carries it (MAR-2778 B)', () => {
    makeDirs()
    git(['init'])
    git(['config', 'user.email', 'test@test.com'])
    git(['config', 'user.name', 'Test'])
    // Tracked deliberately — a worktree checkout already has this file.
    writeFileSync(join(sourcePath, '.env'), 'TRACKED_FAKE=1\n')
    git(['add', '-f', '.env'])
    git(['commit', '-m', 'track env'])
    writeFileSync(join(sourcePath, '.env.local'), 'LOCAL_FAKE=1\n')

    const result = service.syncEnvFiles({
      sourcePath,
      workspacePath,
      settings: { copyMode: 'overwrite', patterns: ['.env', '.env.*'] },
    })

    expect(result.fallback).toBeNull()
    expect(result.paths).not.toContain('.env')
    expect(result.paths).toEqual(['.env.local'])
  })

  it('skips a nested copy when apps is a symlink outside the workspace (MAR-2778 C)', () => {
    makeIgnoredEnvRepo()
    const outsideApps = join(tempDir, 'outside-apps')
    mkdirSync(outsideApps, { recursive: true })
    symlinkSync(outsideApps, join(workspacePath, 'apps'))

    const result = service.syncEnvFiles({
      sourcePath,
      workspacePath,
      settings: { copyMode: 'overwrite', patterns: ['.env', '.env.*'] },
    })

    expect(result.paths).toEqual(['.env'])
    expect(result.skipped).toBeGreaterThanOrEqual(2)
    expect(existsSync(join(outsideApps, 'a', '.env'))).toBe(false)
    expect(existsSync(join(outsideApps, 'b', '.env.local'))).toBe(false)
    expect(realpathSync(join(workspacePath, 'apps'))).toBe(
      realpathSync(outsideApps),
    )
  })
})
