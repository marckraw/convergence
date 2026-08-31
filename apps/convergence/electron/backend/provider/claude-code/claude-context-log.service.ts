import { existsSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { SessionContextWindow } from '../provider.types'
import {
  deriveClaudeContextWindow,
  deriveClaudeEstimatedContextWindow,
} from '../context-window.pure'

interface ReadClaudeLoggedContextWindowOptions {
  sessionId: string
  workingDirectory: string
  fallbackModel: string | null | undefined
  projectsRoot?: string
}

export function toClaudeProjectsKey(workingDirectory: string): string {
  return workingDirectory.replace(/[ /]/g, '-')
}

function getClaudeProjectsRoot(projectsRoot?: string): string {
  return projectsRoot ?? join(homedir(), '.claude', 'projects')
}

export function readClaudeLoggedContextWindow({
  sessionId,
  workingDirectory,
  fallbackModel,
  projectsRoot,
}: ReadClaudeLoggedContextWindowOptions): SessionContextWindow | null {
  const logPath = join(
    getClaudeProjectsRoot(projectsRoot),
    toClaudeProjectsKey(workingDirectory),
    `${sessionId}.jsonl`,
  )

  if (!existsSync(logPath)) {
    return null
  }

  const lines = readFileSync(logPath, 'utf8').split('\n')
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]?.trim()
    if (!line) {
      continue
    }

    try {
      const parsed = JSON.parse(line) as unknown
      const contextWindow =
        deriveClaudeContextWindow(parsed) ??
        deriveClaudeEstimatedContextWindow(parsed, fallbackModel)

      if (contextWindow) {
        return contextWindow
      }
    } catch {
      // Skip malformed lines.
    }
  }

  return null
}
