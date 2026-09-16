import { execFileSync } from 'child_process'
import { randomUUID } from 'crypto'
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  renameSync,
  unlinkSync,
} from 'fs'
import { dirname, join } from 'path'
import type { WorkspaceEnvFileSettings } from '../project/project-settings.pure'
import { selectWorkspaceEnvPaths } from './workspace-env.pure'

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

    const enumeration = listCandidateRelativePaths(input.sourcePath)
    const selected = selectWorkspaceEnvPaths(
      enumeration.paths,
      input.settings.patterns,
    )

    let copied = 0
    let skipped = 0
    const copiedPaths: string[] = []

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

      mkdirSync(dirname(targetFile), { recursive: true })
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
}

function listCandidateRelativePaths(sourcePath: string): {
  paths: string[]
  fallback: 'root-readdir' | null
} {
  try {
    const stdout = execFileSync(
      'git',
      ['ls-files', '--others', '--ignored', '--exclude-standard', '-z'],
      {
        cwd: sourcePath,
        encoding: 'buffer',
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    )
    const paths = stdout
      .toString('utf8')
      .split('\0')
      .filter((entry) => entry.length > 0)
    return { paths, fallback: null }
  } catch {
    return {
      paths: readdirSync(sourcePath),
      fallback: 'root-readdir',
    }
  }
}
