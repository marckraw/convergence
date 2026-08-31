import type { TerminalLayoutRepository } from './terminal-layout.repository'
import { validatePersistedTree } from './terminal-layout.pure'
import type { PersistedPaneTree } from './terminal-layout.types'

export interface TerminalLayoutServiceDeps {
  repository: TerminalLayoutRepository
  now?: () => string
}

export class TerminalLayoutService {
  private readonly repository: TerminalLayoutRepository
  private readonly now: () => string

  constructor(deps: TerminalLayoutServiceDeps) {
    this.repository = deps.repository
    this.now = deps.now ?? (() => new Date().toISOString())
  }

  getLayout(sessionId: string): PersistedPaneTree | null {
    const stored = this.repository.get(sessionId)
    if (!stored) return null
    try {
      return validatePersistedTree(stored)
    } catch {
      // Stored layout is malformed. Drop it silently so the next save
      // replaces the corrupt row. Callers just see "no layout yet".
      this.repository.delete(sessionId)
      return null
    }
  }

  saveLayout(sessionId: string, input: unknown): void {
    const tree = validatePersistedTree(input)
    this.repository.upsert(sessionId, tree, this.now())
  }

  clearLayout(sessionId: string): void {
    this.repository.delete(sessionId)
  }
}
