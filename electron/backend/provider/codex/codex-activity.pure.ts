import type { ActivitySignal } from '../provider.types'
import type { JsonRpcId } from './jsonrpc'

export type ActivityDelta = ActivitySignal | 'keep'

export interface CodexActivityState {
  pendingApprovals: Map<JsonRpcId, string>
  lastActivity: ActivitySignal
}

export type CodexActivityInput =
  | { kind: 'notification'; method: string; params: unknown }
  | { kind: 'request'; method: string; params: unknown; requestId: JsonRpcId }
  | { kind: 'close' }

export function initialCodexActivityState(): CodexActivityState {
  return { pendingApprovals: new Map(), lastActivity: null }
}

const APPROVAL_METHODS = new Set([
  'item/commandExecution/requestApproval',
  'item/fileChange/requestApproval',
  'item/fileRead/requestApproval',
  'item/mcpToolCall/requestApproval',
  'mcpServer/elicitation/request',
])

const TURN_END_METHODS = new Set(['turn/completed', 'turn/interrupt', 'error'])

function extractApprovalLabel(method: string, params: unknown): string {
  if (!params || typeof params !== 'object') {
    return method.split('/')[1] ?? 'tool'
  }
  const record = params as Record<string, unknown>
  if (typeof record.command === 'string') return record.command
  if (typeof record.name === 'string') return record.name
  if (typeof record.path === 'string') return record.path
  if (typeof record.serverName === 'string') return record.serverName
  return method.split('/')[1] ?? 'tool'
}

function extractItemRecord(params: unknown): Record<string, unknown> | null {
  if (!params || typeof params !== 'object') return null
  const record = params as { item?: unknown }
  if (!record.item || typeof record.item !== 'object') return null
  return record.item as Record<string, unknown>
}

function isContextCompactionItem(params: unknown): boolean {
  const item = extractItemRecord(params)
  return (
    item?.type === 'contextCompaction' ||
    item?.type === 'compacted' ||
    item?.type === 'context_compacted'
  )
}

function isReasoningItem(params: unknown): boolean {
  const item = extractItemRecord(params)
  return item?.type === 'reasoning' || item?.type === 'agentReasoning'
}

function extractCompletedToolName(params: unknown): string | null {
  const item = extractItemRecord(params)
  if (!item) return null
  const itemType = typeof item.type === 'string' ? item.type : null
  if (!itemType) return null
  if (itemType === 'agentMessage') return null

  if (itemType === 'commandExecution') {
    const command =
      typeof item.command === 'string'
        ? item.command.split(/\s+/)[0]
        : 'command'
    return command ?? 'command'
  }
  if (itemType === 'mcpToolCall') {
    if (typeof item.name === 'string') return item.name
    return 'mcp'
  }
  if (itemType === 'fileChange') return 'edit'
  if (itemType === 'fileRead') return 'read'
  return itemType
}

function normalize(raw: string): string {
  return raw.trim().toLowerCase() || 'tool'
}

export function reduceCodexActivity(
  prev: CodexActivityState,
  input: CodexActivityInput,
): { state: CodexActivityState; activity: ActivityDelta } {
  if (input.kind === 'close') {
    return {
      state: initialCodexActivityState(),
      activity: prev.lastActivity === null ? 'keep' : null,
    }
  }

  if (input.kind === 'request') {
    if (APPROVAL_METHODS.has(input.method)) {
      const label = extractApprovalLabel(input.method, input.params)
      const pendingApprovals = new Map(prev.pendingApprovals)
      pendingApprovals.set(input.requestId, label)
      const activity: ActivitySignal = 'waiting-approval'
      if (prev.lastActivity === activity) {
        return {
          state: { pendingApprovals, lastActivity: activity },
          activity: 'keep',
        }
      }
      return { state: { pendingApprovals, lastActivity: activity }, activity }
    }
    return { state: prev, activity: 'keep' }
  }

  // notification
  if (TURN_END_METHODS.has(input.method)) {
    return {
      state: initialCodexActivityState(),
      activity: prev.lastActivity === null ? 'keep' : null,
    }
  }

  if (input.method === 'item/agentMessage/delta') {
    const activity: ActivitySignal = 'streaming'
    if (prev.lastActivity === activity) {
      return { state: prev, activity: 'keep' }
    }
    return {
      state: { ...prev, lastActivity: activity },
      activity,
    }
  }

  if (
    input.method === 'item/started' &&
    isContextCompactionItem(input.params)
  ) {
    const activity: ActivitySignal = 'compacting'
    if (prev.lastActivity === activity) {
      return { state: prev, activity: 'keep' }
    }
    return {
      state: { ...prev, lastActivity: activity },
      activity,
    }
  }

  if (input.method === 'item/started' && isReasoningItem(input.params)) {
    const activity: ActivitySignal = 'thinking'
    if (prev.lastActivity === activity) {
      return { state: prev, activity: 'keep' }
    }
    return {
      state: { ...prev, lastActivity: activity },
      activity,
    }
  }

  if (input.method === 'item/completed') {
    if (isContextCompactionItem(input.params)) {
      if (prev.lastActivity !== 'compacting') {
        return { state: prev, activity: 'keep' }
      }
      return {
        state: { ...prev, lastActivity: null },
        activity: null,
      }
    }

    const toolName = extractCompletedToolName(input.params)
    if (!toolName) return { state: prev, activity: 'keep' }
    const activity: ActivitySignal = `tool:${normalize(toolName)}`
    if (prev.lastActivity === activity) {
      return { state: prev, activity: 'keep' }
    }
    return {
      state: { ...prev, lastActivity: activity },
      activity,
    }
  }

  return { state: prev, activity: 'keep' }
}
