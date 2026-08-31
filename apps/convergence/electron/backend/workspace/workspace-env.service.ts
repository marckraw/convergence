import { randomUUID } from 'crypto'
import {
  copyFileSync,
  existsSync,
  lstatSync,
  readdirSync,
  renameSync,
  unlinkSync,
} from 'fs'
import { join } from 'path'
import type { WorkspaceEnvFileSettings } from '../project/project-settings.pure'
import { matchesWorkspaceEnvFilePattern } from './workspace-env.pure'

export interface WorkspaceEnvSyncResult {
  copied: number
  skipped: number
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
      return { copied: 0, skipped: 0 }
    }

    const entries = readdirSync(input.sourcePath)
    let copied = 0
    let skipped = 0

    for (const fileName of entries) {
      if (!matchesWorkspaceEnvFilePattern(fileName, input.settings.patterns)) {
        continue
      }

      const sourceFile = join(input.sourcePath, fileName)
      if (!lstatSync(sourceFile).isFile()) {
        skipped += 1
        continue
      }

      const targetFile = join(input.workspacePath, fileName)
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

      this.copyEnvFile(sourceFile, targetFile)
      copied += 1
    }

    return { copied, skipped }
  }
}
