export interface ClaudePermissionRequest {
  toolName: string
  input: Record<string, unknown>
  toolUseID: string
  requestId: string
  signal: AbortSignal
  agentID?: string
  title?: string
  displayName?: string
  description?: string
  blockedPath?: string
  decisionReason?: string
  matchedAskRule?: { source: string; toolName: string; ruleContent?: string }
  suggestions?: unknown[]
}

export type ClaudePermissionResult =
  | {
      behavior: 'allow'
      toolUseID: string
      decisionClassification: 'user_temporary' | 'user_permanent'
      updatedInput?: Record<string, unknown>
      updatedPermissions?: Array<{
        type: 'setMode'
        mode: 'acceptEdits'
        destination: 'session'
      }>
    }
  | {
      behavior: 'deny'
      message: string
      toolUseID: string
      decisionClassification: 'user_reject'
    }
