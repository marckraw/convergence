import type { Attachment } from '@/entities/attachment'
import type { ConversationItem } from '@/entities/session'

interface ConversationItemTimingOptions {
  locale?: string | string[]
  timeZone?: string
}

export interface ConversationItemTiming {
  startedAtLabel: string
  startedAtTitle: string
  turnElapsedLabel: string | null
  activeDurationLabel: string | null
}

export type TranscriptEntryViewKind =
  | 'user-message'
  | 'assistant-message'
  | 'thinking'
  | 'tool-call'
  | 'tool-result'
  | 'approval-request'
  | 'input-request'
  | 'note'

export interface TranscriptEntryViewModel {
  item: ConversationItem
  kind: TranscriptEntryViewKind
  label: string
  copyText: string
  timing: ConversationItemTiming
  deliveryModeLabel: string | null
  attachments: Attachment[]
  missingAttachmentIds: string[]
  toolPreview: string | null
  actionableApproval: boolean
}

export interface BuildTranscriptEntryViewModelInput {
  item: ConversationItem
  turnStartedAt?: string | null
  resolvedAttachmentsById?: Record<string, Attachment>
  actionableApproval?: boolean
  timingOptions?: ConversationItemTimingOptions
}

export function buildTranscriptEntryViewModel({
  item,
  turnStartedAt = null,
  resolvedAttachmentsById = {},
  actionableApproval = false,
  timingOptions = {},
}: BuildTranscriptEntryViewModelInput): TranscriptEntryViewModel {
  const { attachments, missingAttachmentIds } = resolveItemAttachments(
    item,
    resolvedAttachmentsById,
  )

  return {
    item,
    kind: getViewKind(item),
    label: getEntryLabel(item),
    copyText: getConversationItemCopyText(item),
    timing: getConversationItemTiming(item, turnStartedAt, timingOptions),
    deliveryModeLabel: getDeliveryModeLabel(item),
    attachments,
    missingAttachmentIds,
    toolPreview: getToolPreviewForItem(item),
    actionableApproval: item.kind === 'approval-request' && actionableApproval,
  }
}

export function getConversationItemCopyText(item: ConversationItem): string {
  switch (item.kind) {
    case 'message':
      return item.text
    case 'thinking':
      return item.text
    case 'tool-call':
      return item.inputText
    case 'tool-result':
      return item.outputText
    case 'approval-request':
      return item.description
    case 'input-request':
      return item.prompt
    case 'note':
      return item.text
  }
}

export function getConversationItemTiming(
  item: ConversationItem,
  turnStartedAt: string | null = null,
  options: ConversationItemTimingOptions = {},
): ConversationItemTiming {
  const turnElapsedMs = shouldShowTurnElapsed(item)
    ? getElapsedMs(turnStartedAt, item.createdAt)
    : null
  const activeDurationMs = shouldShowActiveDuration(item)
    ? getElapsedMs(item.createdAt, item.updatedAt)
    : null

  return {
    startedAtLabel: formatConversationItemTimestamp(item.createdAt, options),
    startedAtTitle: formatConversationItemAbsoluteTimestamp(
      item.createdAt,
      options,
    ),
    turnElapsedLabel:
      turnElapsedMs !== null && turnElapsedMs >= 1000
        ? `+${formatDuration(turnElapsedMs)}`
        : null,
    activeDurationLabel:
      activeDurationMs !== null && activeDurationMs >= 1000
        ? formatDuration(activeDurationMs)
        : null,
  }
}

export function formatConversationItemTimestamp(
  value: string,
  options: ConversationItemTimingOptions = {},
): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat(options.locale, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    ...(options.timeZone ? { timeZone: options.timeZone } : {}),
  }).format(date)
}

export function formatConversationItemAbsoluteTimestamp(
  value: string,
  options: ConversationItemTimingOptions = {},
): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat(options.locale, {
    dateStyle: 'medium',
    timeStyle: 'medium',
    ...(options.timeZone ? { timeZone: options.timeZone } : {}),
  }).format(date)
}

export function formatDuration(durationMs: number): string {
  if (durationMs < 1000) {
    return '<1s'
  }

  const totalSeconds = Math.max(0, Math.round(durationMs / 1000))
  if (totalSeconds < 60) {
    return `${totalSeconds}s`
  }

  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes < 60) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`
  }

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`
}

function getViewKind(item: ConversationItem): TranscriptEntryViewKind {
  if (item.kind === 'message') {
    return item.actor === 'user' ? 'user-message' : 'assistant-message'
  }
  return item.kind
}

function getEntryLabel(item: ConversationItem): string {
  switch (item.kind) {
    case 'message':
      return item.actor === 'user' ? 'You' : 'Agent'
    case 'thinking':
      return 'Thinking'
    case 'approval-request':
      return 'Approval needed'
    case 'input-request':
      return 'Input needed'
    default:
      return ''
  }
}

function getDeliveryModeLabel(item: ConversationItem): string | null {
  if (item.kind !== 'message' || item.actor !== 'user' || !item.deliveryMode) {
    return null
  }

  return item.deliveryMode === 'steer' ? 'Steer' : 'Follow-up'
}

function getToolPreviewForItem(item: ConversationItem): string | null {
  if (item.kind === 'tool-call') {
    return getToolPreview(`${item.toolName}: ${item.inputText}`)
  }
  if (item.kind === 'tool-result') {
    return getToolPreview(item.outputText)
  }
  return null
}

function resolveItemAttachments(
  item: ConversationItem,
  resolvedAttachmentsById: Record<string, Attachment>,
): Pick<TranscriptEntryViewModel, 'attachments' | 'missingAttachmentIds'> {
  if (item.kind !== 'message' || item.actor !== 'user' || !item.attachmentIds) {
    return { attachments: [], missingAttachmentIds: [] }
  }

  const attachments: Attachment[] = []
  const missingAttachmentIds: string[] = []

  for (const id of item.attachmentIds) {
    const attachment = resolvedAttachmentsById[id]
    if (attachment) {
      attachments.push(attachment)
    } else {
      missingAttachmentIds.push(id)
    }
  }

  return { attachments, missingAttachmentIds }
}

function getToolPreview(value: string): string {
  const singleLine = value.replace(/\s+/g, ' ').trim()
  if (singleLine.length <= 120) {
    return singleLine
  }

  return `${singleLine.slice(0, 117)}...`
}

function shouldShowTurnElapsed(item: ConversationItem): boolean {
  return !(item.kind === 'message' && item.actor === 'user')
}

function shouldShowActiveDuration(item: ConversationItem): boolean {
  return !(item.kind === 'message' && item.actor === 'user')
}

function getElapsedMs(
  startValue: string | null | undefined,
  endValue: string | null | undefined,
): number | null {
  if (!startValue || !endValue) {
    return null
  }

  const start = new Date(startValue).getTime()
  const end = new Date(endValue).getTime()
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
    return null
  }

  return end - start
}
