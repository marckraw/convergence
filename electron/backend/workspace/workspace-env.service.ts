import { copyFileSync, existsSync, lstatSync, readdirSync } from 'fs'
import { join } from 'path'
import type { WorkspaceEnvFileSettings } from '../project/project-settings.pure'
import { matchesWorkspaceEnvFilePattern } from './workspace-env.pure'

export interface WorkspaceEnvSyncResult {
  copied: number
  skipped: number
}

export class WorkspaceEnvService {
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
      if (
        input.settings.copyMode === 'copy-missing' &&
        existsSync(targetFile)
      ) {
        skipped += 1
        continue
      }

      copyFileSync(sourceFile, targetFile)
      copied += 1
    }

    return { copied, skipped }
  }
}
