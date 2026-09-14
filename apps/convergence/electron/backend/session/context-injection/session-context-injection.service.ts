import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import type { ProjectContextService } from '../../project-context/project-context.service'
import { projectContextItemToSerializable } from '../../project-context/project-context.types'
import {
  serializeBootBlock,
  serializeEveryTurnBlock,
} from '../../project-context/project-context-serializer.pure'
import { projectNameToSlug } from '../../project-context/project-slug.pure'
import type { ConversationItemDraft } from '../conversation-item.types'
import type { Session } from '../session.types'

export interface PrepareBootContextInput {
  session: Session
  originalText: string
  contextItemIds?: string[]
  deferAttachment?: boolean
}

export interface PreparedBootContext {
  augmentedText: string
  noteDraft: ConversationItemDraft | null
  commit?: () => void
}

export interface PrepareUserTurnContextInput {
  session: Session
  originalText: string
}

export class SessionContextInjectionService {
  constructor(
    private db: Database.Database,
    private projectContext: ProjectContextService,
  ) {}

  prepareBoot(input: PrepareBootContextInput): PreparedBootContext {
    if (input.session.contextKind === 'global' || !input.session.projectId) {
      return { augmentedText: input.originalText, noteDraft: null }
    }

    const contextItemIds = input.contextItemIds
    const commit =
      contextItemIds === undefined
        ? undefined
        : () => {
            this.projectContext.attachToSession(
              input.session.id,
              contextItemIds,
            )
          }
    if (!input.deferAttachment) commit?.()
    const items =
      input.deferAttachment && input.contextItemIds !== undefined
        ? input.contextItemIds.map((id) => {
            const item = this.projectContext.getById(id)
            if (!item) throw new Error(`Project context item not found: ${id}`)
            return item
          })
        : this.projectContext.listForSession(input.session.id)
    const deferredCommit = input.deferAttachment ? commit : undefined
    if (items.length === 0) {
      return {
        augmentedText: input.originalText,
        noteDraft: null,
        commit: deferredCommit,
      }
    }

    const result = serializeBootBlock({
      slug: this.resolveProjectSlugForSession(input.session),
      items: items.map(projectContextItemToSerializable),
      originalText: input.originalText,
    })

    return {
      augmentedText: result.augmentedText,
      commit: deferredCommit,
      noteDraft: result.note ? this.createBootContextNote(result.note) : null,
    }
  }

  prepareUserTurn(input: PrepareUserTurnContextInput): string {
    if (input.session.contextKind === 'global' || !input.session.projectId) {
      return input.originalText
    }

    const items = this.projectContext.listForSession(input.session.id)
    if (items.length === 0) return input.originalText

    return serializeEveryTurnBlock({
      slug: this.resolveProjectSlugForSession(input.session),
      items: items.map(projectContextItemToSerializable),
      originalText: input.originalText,
    })
  }

  private resolveProjectSlugForSession(session: Session): string {
    if (!session.projectId) return ''

    const row = this.db
      .prepare('SELECT name FROM projects WHERE id = ?')
      .get(session.projectId) as { name: string } | undefined
    return projectNameToSlug(row?.name ?? '')
  }

  private createBootContextNote(text: string): ConversationItemDraft {
    const timestamp = new Date().toISOString()
    return {
      id: randomUUID(),
      kind: 'note',
      level: 'info',
      text,
      state: 'complete',
      turnId: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      providerMeta: {
        providerId: 'convergence',
        providerItemId: null,
        providerEventType: 'context.boot',
      },
    }
  }
}
