import type { Attachment } from '@/entities/attachment'
import type { ConversationItem } from '@/entities/session'
import { parseAssistantUiResponse } from '@/entities/ui-response-artifact'

interface ConversationItemTimingOptions {
  locale?: string | string[]
  timeZone?: string
  now?: string | Date
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
  displayText: string
  injectedContextText: string | null
  timing: ConversationItemTiming
  deliveryModeLabel: string | null
  attachments: Attachment[]
  missingAttachmentIds: string[]
  toolPreview: string | null
  toolVisibilityLabel: string | null
  toolVisibilityTitle: string | null
  actionableApproval: boolean
  actionableInput: boolean
  uiResponseArtifactTitle: string | null
}

export interface BuildTranscriptEntryViewModelInput {
  item: ConversationItem
  turnStartedAt?: string | null
  resolvedAttachmentsById?: Record<string, Attachment>
  actionableApproval?: boolean
  actionableInput?: boolean
  injectedContextText?: string | null
  timingOptions?: ConversationItemTimingOptions
}

export function buildTranscriptEntryViewModel({
  item,
  turnStartedAt = null,
  resolvedAttachmentsById = {},
  actionableApproval = false,
  actionableInput = false,
  injectedContextText = null,
  timingOptions = {},
}: BuildTranscriptEntryViewModelInput): TranscriptEntryViewModel {
  const { attachments, missingAttachmentIds } = resolveItemAttachments(
    item,
    resolvedAttachmentsById,
  )
  const displayText = getConversationItemDisplayText(item, injectedContextText)

  return {
    item,
    kind: getViewKind(item),
    label: getEntryLabel(item),
    copyText: displayText,
    displayText,
    injectedContextText,
    timing: getConversationItemTiming(item, turnStartedAt, timingOptions),
    deliveryModeLabel: getDeliveryModeLabel(item),
    attachments,
    missingAttachmentIds,
    toolPreview: getToolPreviewForItem(item),
    toolVisibilityLabel: getToolVisibilityLabel(item),
    toolVisibilityTitle: getToolVisibilityTitle(item),
    actionableApproval: item.kind === 'approval-request' && actionableApproval,
    actionableInput: item.kind === 'input-request' && actionableInput,
    uiResponseArtifactTitle: getUiResponseArtifactTitle(item),
  }
}

export function getConversationItemDisplayText(
  item: ConversationItem,
  injectedContextText: string | null = null,
): string {
  const rawText = getConversationItemCopyText(item)

  if (item.kind === 'message' && item.actor === 'assistant') {
    return parseAssistantUiResponse(rawText).markdown
  }

  if (
    item.kind !== 'message' ||
    item.actor !== 'user' ||
    !injectedContextText ||
    !rawText.startsWith(injectedContextText)
  ) {
    return rawText
  }

  return rawText.slice(injectedContextText.length).replace(/^\s+/, '')
}

function getUiResponseArtifactTitle(item: ConversationItem): string | null {
  if (item.kind !== 'message' || item.actor !== 'assistant') {
    return null
  }

  return parseAssistantUiResponse(item.text).artifact?.title ?? null
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
      if (item.request?.kind === 'plan') {
        return item.request.plan
      }
      if (item.request?.kind === 'form') {
        return item.request.message
      }
      if (item.request?.kind === 'url') {
        return `${item.request.message}\n${item.request.url}`
      }
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

  const time = formatConversationItemTime(date, options)
  const dayDiff = getCalendarDayDiff(date, options)

  if (dayDiff === 0) {
    return `Today, ${time}`
  }

  if (dayDiff === 1) {
    return `Yesterday, ${time}`
  }

  return new Intl.DateTimeFormat(options.locale, {
    dateStyle: 'medium',
    timeStyle: 'medium',
    hour12: false,
    ...(options.timeZone ? { timeZone: options.timeZone } : {}),
  }).format(date)
}

function formatConversationItemTime(
  date: Date,
  options: ConversationItemTimingOptions,
): string {
  return new Intl.DateTimeFormat(options.locale, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    ...(options.timeZone ? { timeZone: options.timeZone } : {}),
  }).format(date)
}

function getCalendarDayDiff(
  date: Date,
  options: ConversationItemTimingOptions,
): number | null {
  const now =
    options.now instanceof Date
      ? options.now
      : new Date(options.now ?? Date.now())
  if (Number.isNaN(now.getTime())) {
    return null
  }

  const targetDay = getCalendarDaySerial(date, options)
  const currentDay = getCalendarDaySerial(now, options)
  if (targetDay === null || currentDay === null) {
    return null
  }

  return currentDay - targetDay
}

function getCalendarDaySerial(
  date: Date,
  options: ConversationItemTimingOptions,
): number | null {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(options.timeZone ? { timeZone: options.timeZone } : {}),
  }).formatToParts(date)
  const year = Number(parts.find((part) => part.type === 'year')?.value)
  const month = Number(parts.find((part) => part.type === 'month')?.value)
  const day = Number(parts.find((part) => part.type === 'day')?.value)

  if (!year || !month || !day) {
    return null
  }

  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000)
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

function isAntigravityReconstructedToolItem(item: ConversationItem): boolean {
  if (item.kind !== 'tool-call' && item.kind !== 'tool-result') {
    return false
  }

  return (
    item.providerMeta.providerId === 'antigravity' &&
    (item.providerMeta.providerEventType === 'trajectory-tool-call' ||
      item.providerMeta.providerEventType === 'trajectory-tool-result')
  )
}

function getToolVisibilityLabel(item: ConversationItem): string | null {
  return isAntigravityReconstructedToolItem(item) ? 'Post-run' : null
}

function getToolVisibilityTitle(item: ConversationItem): string | null {
  return isAntigravityReconstructedToolItem(item)
    ? 'Recovered from the Antigravity conversation database after the turn completed.'
    : null
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
