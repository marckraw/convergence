import type { TranscriptEntry } from '../provider/provider.types'
import type { ConversationItemRow } from '../database/database.types'
import type {
  BuildConversationItemFromTranscriptEntryInput,
  ConversationItem,
  ConversationItemInsertRow,
  ConversationItemKind,
  ConversationItemState,
} from './conversation-item.types'
import type {
  SkillInvocationStatus,
  SkillProviderId,
  SkillScope,
  SkillSelection,
} from '../skills/skills.types'

function noteLevelFromText(
  text: string,
): Extract<ConversationItem, { kind: 'note' }>['level'] {
  const normalized = text.trim().toLowerCase()
  if (
    normalized.startsWith('error:') ||
    normalized.startsWith('failed:') ||
    normalized.includes('process exited with code') ||
    normalized.includes('process error')
  ) {
    return 'error'
  }
  if (
    normalized.startsWith('warning:') ||
    normalized.startsWith('turn interrupted')
  ) {
    return 'warning'
  }
  return 'info'
}

function stateFromTranscriptEntry(
  entry: TranscriptEntry,
): ConversationItemState {
  if (entry.type === 'assistant' && entry.streaming) {
    return 'streaming'
  }
  if (entry.type === 'system' && noteLevelFromText(entry.text) === 'error') {
    return 'error'
  }
  return 'complete'
}

function kindFromValue(value: string): ConversationItemKind {
  switch (value) {
    case 'message':
    case 'thinking':
    case 'tool-call':
    case 'tool-result':
    case 'approval-request':
    case 'input-request':
    case 'note':
      return value
    default:
      throw new Error(`Unknown conversation item kind: ${value}`)
  }
}

function stateFromValue(value: string): ConversationItemState {
  switch (value) {
    case 'streaming':
    case 'complete':
    case 'error':
      return value
    default:
      throw new Error(`Unknown conversation item state: ${value}`)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function skillProviderIdFromValue(value: unknown): SkillProviderId | null {
  switch (value) {
    case 'codex':
    case 'claude-code':
    case 'pi':
      return value
    default:
      return null
  }
}

function skillScopeFromValue(value: unknown): SkillScope | null {
  switch (value) {
    case 'product':
    case 'system':
    case 'global':
    case 'user':
    case 'project':
    case 'plugin':
    case 'admin':
    case 'team':
    case 'settings':
    case 'unknown':
      return value
    default:
      return null
  }
}

function skillStatusFromValue(value: unknown): SkillInvocationStatus | null {
  switch (value) {
    case 'selected':
    case 'sent':
    case 'confirmed':
    case 'unavailable':
    case 'failed':
      return value
    default:
      return null
  }
}

function parseSkillSelection(value: unknown): SkillSelection | null {
  if (!isRecord(value)) {
    return null
  }

  const providerId = skillProviderIdFromValue(value.providerId)
  const scope = skillScopeFromValue(value.scope)
  const status = skillStatusFromValue(value.status)

  if (
    !providerId ||
    !scope ||
    !status ||
    typeof value.id !== 'string' ||
    typeof value.providerName !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.displayName !== 'string' ||
    typeof value.sourceLabel !== 'string'
  ) {
    return null
  }

  return {
    id: value.id,
    providerId,
    providerName: value.providerName,
    name: value.name,
    displayName: value.displayName,
    path: typeof value.path === 'string' ? value.path : null,
    scope,
    rawScope: typeof value.rawScope === 'string' ? value.rawScope : null,
    sourceLabel: value.sourceLabel,
    status,
    argumentText:
      typeof value.argumentText === 'string' ? value.argumentText : undefined,
  }
}

function parseSkillSelections(value: unknown): SkillSelection[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }

  const selections = value
    .map(parseSkillSelection)
    .filter((selection): selection is SkillSelection => selection !== null)

  return selections.length > 0 ? selections : undefined
}

export function buildConversationItemFromTranscriptEntry(
  input: BuildConversationItemFromTranscriptEntryInput,
): ConversationItem {
  const base = {
    id: input.id,
    sessionId: input.sessionId,
    sequence: input.sequence,
    turnId: input.turnId,
    state: stateFromTranscriptEntry(input.entry),
    createdAt: input.entry.timestamp,
    updatedAt: input.entry.timestamp,
    providerMeta: {
      providerId: input.providerId,
      providerItemId: null,
      providerEventType: input.entry.type,
    },
  }

  switch (input.entry.type) {
    case 'user':
      return {
        ...base,
        kind: 'message',
        actor: 'user',
        text: input.entry.text,
        attachmentIds: input.entry.attachmentIds,
      }

    case 'assistant':
      return {
        ...base,
        kind: 'message',
        actor: 'assistant',
        text: input.entry.text,
      }

    case 'tool-use':
      return {
        ...base,
        kind: 'tool-call',
        toolName: input.entry.tool,
        inputText: input.entry.input,
      }

    case 'tool-result':
      return {
        ...base,
        kind: 'tool-result',
        toolName: null,
        relatedItemId: null,
        outputText: input.entry.result,
      }

    case 'approval-request':
      return {
        ...base,
        kind: 'approval-request',
        description: input.entry.description,
      }

    case 'input-request':
      return {
        ...base,
        kind: 'input-request',
        prompt: input.entry.prompt,
      }

    case 'system':
      return {
        ...base,
        kind: 'note',
        level: noteLevelFromText(input.entry.text),
        text: input.entry.text,
      }
  }
}

export function migrateTranscriptToConversationItems(input: {
  sessionId: string
  providerId: string
  entries: TranscriptEntry[]
}): ConversationItem[] {
  let currentTurnId: string | null = null
  let turnIndex = 0

  return input.entries.map((entry, index) => {
    if (entry.type === 'user') {
      turnIndex += 1
      currentTurnId = `${input.sessionId}:turn:${turnIndex}`
    }

    return buildConversationItemFromTranscriptEntry({
      id: `${input.sessionId}:item:${index + 1}`,
      sessionId: input.sessionId,
      providerId: input.providerId,
      sequence: index + 1,
      turnId: currentTurnId,
      entry,
    })
  })
}

export function conversationItemToInsertRow(
  item: ConversationItem,
): ConversationItemInsertRow {
  const {
    id,
    sessionId,
    sequence,
    turnId,
    kind,
    state,
    createdAt,
    updatedAt,
    providerMeta,
    ...payload
  } = item

  return {
    id,
    sessionId,
    sequence,
    turnId,
    kind,
    state,
    payloadJson: JSON.stringify(payload),
    providerItemId: providerMeta.providerItemId,
    providerEventType: providerMeta.providerEventType,
    createdAt,
    updatedAt,
  }
}

export function conversationItemFromRow(
  row: ConversationItemRow,
): ConversationItem {
  const kind = kindFromValue(row.kind)
  const state = stateFromValue(row.state)
  const payload = JSON.parse(row.payload_json) as Record<string, unknown>
  const base = {
    id: row.id,
    sessionId: row.session_id,
    sequence: row.sequence,
    turnId: row.turn_id,
    kind,
    state,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    providerMeta: {
      providerId: row.provider_id,
      providerItemId: row.provider_item_id,
      providerEventType: row.provider_event_type,
    },
  }

  switch (kind) {
    case 'message': {
      const deliveryModeValue = payload.deliveryMode
      const deliveryMode =
        deliveryModeValue === 'steer' || deliveryModeValue === 'follow-up'
          ? deliveryModeValue
          : undefined
      return {
        ...base,
        kind,
        actor: payload.actor as 'user' | 'assistant',
        text: payload.text as string,
        attachmentIds: payload.attachmentIds as string[] | undefined,
        skillSelections: parseSkillSelections(payload.skillSelections),
        ...(deliveryMode ? { deliveryMode } : {}),
      }
    }

    case 'thinking':
      return {
        ...base,
        kind,
        actor: 'assistant',
        text: payload.text as string,
      }

    case 'tool-call':
      return {
        ...base,
        kind,
        toolName: payload.toolName as string,
        inputText: payload.inputText as string,
      }

    case 'tool-result':
      return {
        ...base,
        kind,
        toolName: (payload.toolName as string | null | undefined) ?? null,
        relatedItemId:
          (payload.relatedItemId as string | null | undefined) ?? null,
        outputText: payload.outputText as string,
      }

    case 'approval-request':
      return {
        ...base,
        kind,
        description: payload.description as string,
      }

    case 'input-request':
      return {
        ...base,
        kind,
        prompt: payload.prompt as string,
      }

    case 'note':
      return {
        ...base,
        kind,
        level: payload.level as 'info' | 'warning' | 'error',
        text: payload.text as string,
      }
  }
}
