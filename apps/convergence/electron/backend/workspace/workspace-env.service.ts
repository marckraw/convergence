import { execFileSync } from 'child_process'
import { randomUUID } from 'crypto'
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  renameSync,
  unlinkSync,
} from 'fs'
import { dirname, join } from 'path'
import type { WorkspaceEnvFileSettings } from '../project/project-settings.pure'
import { isPathInside, selectWorkspaceEnvPaths } from './workspace-env.pure'

/** 64 MiB — belt under `--directory` (lap-1 ENOBUFS was Node's 1 MiB default). */
export const WORKSPACE_ENV_GIT_LS_FILES_MAX_BUFFER = 64 * 1024 * 1024

/**
 * Untracked files at any depth (ignored included). `--directory` collapses
 * fully-untracked trees so node_modules does not explode the buffer; parents
 * with tracked files still list nested env files. Synchronous on purpose —
 * both workspace.service callers require syncEnvFiles to stay sync (MAR-2778).
 */
export const WORKSPACE_ENV_GIT_LS_FILES_ARGS = [
  'ls-files',
  '--others',
  '-z',
  '--directory',
] as const

export type GitLsFilesRunner = (
  command: string,
  args: readonly string[],
  options: {
    cwd: string
    encoding: 'buffer'
    maxBuffer: number
    stdio: ['ignore', 'pipe', 'ignore']
  },
) => Buffer

const defaultGitLsFilesRunner: GitLsFilesRunner = (command, args, options) =>
  execFileSync(command, [...args], options)

export interface WorkspaceEnvSyncResult {
  copied: number
  skipped: number
  /** Relative paths that were successfully copied in this sync. */
  paths: string[]
  /**
   * When git enumeration is unavailable, only the repository root is scanned
   * (pre-MAR-2778 behaviour). `null` means `git ls-files` supplied the list.
   */
  fallback: 'root-readdir' | null
}

export class WorkspaceEnvService {
  constructor(
    private readonly gitLsFiles: GitLsFilesRunner = defaultGitLsFilesRunner,
  ) {}

  private copyEnvFile(sourceFile: string, targetFile: string): void {
    const temporaryFile = `${targetFile}.${randomUUID()}.tmp`

    try {
      copyFileSync(sourceFile, temporaryFile)
      renameSync(temporaryFile, targetFile)
    } catch (error) {
      try {
        unlinkSync(temporaryFile)
      } catch {
        // Best-effort cleanup for a failed temporary copy.
      }
      throw error
    }
  }

  syncEnvFiles(input: {
    sourcePath: string
    workspacePath: string
    settings: WorkspaceEnvFileSettings
  }): WorkspaceEnvSyncResult {
    if (input.settings.copyMode === 'disabled') {
      return { copied: 0, skipped: 0, paths: [], fallback: null }
    }

    const enumeration = this.listCandidateRelativePaths(input.sourcePath)
    const selected = selectWorkspaceEnvPaths(
      enumeration.paths,
      input.settings.patterns,
    )

    let copied = 0
    let skipped = 0
    const copiedPaths: string[] = []
    const workspaceReal = realpathSync(input.workspacePath)

    for (const relativePath of selected) {
      const sourceFile = join(input.sourcePath, relativePath)
      if (!existsSync(sourceFile) || !lstatSync(sourceFile).isFile()) {
        skipped += 1
        continue
      }

      const targetFile = join(input.workspacePath, relativePath)
      const targetExists = existsSync(targetFile)
      if (input.settings.copyMode === 'copy-missing' && targetExists) {
        skipped += 1
        continue
      }

      if (targetExists) {
        const target = lstatSync(targetFile)
        if (target.isSymbolicLink() || !target.isFile()) {
          skipped += 1
          continue
        }
      }

      const targetDir = dirname(targetFile)
      mkdirSync(targetDir, { recursive: true })

      // Refuse to write through a parent that resolves outside the workspace
      // (e.g. a checked-out `apps` symlink pointing at a shared tree).
      let targetDirReal: string
      try {
        targetDirReal = realpathSync(targetDir)
      } catch {
        skipped += 1
        continue
      }
      if (!isPathInside(targetDirReal, workspaceReal)) {
        skipped += 1
        continue
      }

      this.copyEnvFile(sourceFile, targetFile)
      copied += 1
      copiedPaths.push(relativePath)
    }

    return {
      copied,
      skipped,
      paths: copiedPaths,
      fallback: enumeration.fallback,
    }
  }

  private listCandidateRelativePaths(sourcePath: string): {
    paths: string[]
    fallback: 'root-readdir' | null
  } {
    try {
      const stdout = this.gitLsFiles('git', WORKSPACE_ENV_GIT_LS_FILES_ARGS, {
        cwd: sourcePath,
        encoding: 'buffer',
        maxBuffer: WORKSPACE_ENV_GIT_LS_FILES_MAX_BUFFER,
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      const paths = stdout
        .toString('utf8')
        .split('\0')
        .map((entry) => entry.replace(/\/$/, ''))
        .filter((entry) => entry.length > 0)
      return { paths, fallback: null }
    } catch (error) {
      const code =
        error && typeof error === 'object' && 'code' in error
          ? String((error as { code: unknown }).code)
          : 'unknown'
      console.warn(
        `[workspace-env] git ls-files failed (${code}); falling back to root readdir`,
      )
      return {
        paths: readdirSync(sourcePath),
        fallback: 'root-readdir',
      }
    }
  }
}
