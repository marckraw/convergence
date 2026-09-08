import type { ProviderSessionEmitter } from '../provider-session.emitter'
import type {
  ClaudePermissionRequest,
  ClaudePermissionResult,
} from './claude-permission.types'
import {
  readClaudeSessionRules,
  matchesClaudeSessionRule,
  type ClaudeSessionRules,
} from './claude-session-rules.pure'
import {
  buildClaudeAskUserQuestionRequest,
  buildClaudeAskUserQuestionUpdatedInput,
  buildClaudeExitPlanModeRequest,
  type PendingClaudeAskUserQuestion,
} from './claude-ask-user-question.pure'
import type { InteractionResponse } from '../../session/conversation-item.types'

/** Mediator: owns Claude's pending decisions while the session owns the UI. */
export class ClaudePermissionsService {
  private readonly pending = new Map<
    string,
    {
      request: ClaudePermissionRequest
      itemId?: string
      abort?: () => void
      question?: PendingClaudeAskUserQuestion
      plan?: boolean
      resolve: (result: ClaudePermissionResult) => void
    }
  >()
  private sessionAllowRules: ClaudeSessionRules = { rules: [], directories: [] }
  constructor(
    private readonly emitter: ProviderSessionEmitter,
    private readonly attention: (
      value: 'none' | 'needs-approval' | 'needs-input',
    ) => void,
  ) {}

  request(request: ClaudePermissionRequest): Promise<ClaudePermissionResult> {
    if (request.signal.aborted)
      return Promise.resolve({
        behavior: 'deny',
        message: 'connection ended',
        toolUseID: request.toolUseID,
        decisionClassification: 'user_reject',
      })
    if (
      matchesClaudeSessionRule(
        this.sessionAllowRules,
        readClaudeSessionRules(request.suggestions),
      )
    ) {
      this.emitter.addNote({
        text: `↳ allowed by your session rule: ${request.displayName ?? request.toolName}`,
        level: 'info',
        agentRunId: request.agentID,
      })
      return Promise.resolve({
        behavior: 'allow',
        toolUseID: request.toolUseID,
        decisionClassification: 'user_permanent',
      })
    }
    const question = buildClaudeAskUserQuestionRequest({
      id: request.toolUseID,
      name: request.toolName,
      input: request.input,
    })
    const plan = buildClaudeExitPlanModeRequest({
      id: request.toolUseID,
      name: request.toolName,
      input: request.input,
    })
    const result = new Promise<ClaudePermissionResult>((resolve) =>
      this.pending.set(request.toolUseID, {
        request,
        resolve,
        question: question?.pending,
        plan: !!plan,
      }),
    )
    const dialog = question ?? plan
    if (dialog) {
      const itemId = this.emitter.addInputRequest({
        resolution: 'pending',
        prompt: dialog.prompt,
        request: dialog.request,
        responseProviderItemId: request.toolUseID,
        providerItemId: request.toolUseID,
        agentRunId: request.agentID,
      })
      this.pending.get(request.toolUseID)!.itemId = itemId
      this.attention('needs-input')
      this.watchAbort(request)
      return result
    }
    const itemId = this.emitter.addApprovalRequest({
      resolution: 'pending',
      description:
        request.title ??
        `${request.displayName ?? request.toolName}: ${request.description ?? ''}`,
      providerItemId: request.toolUseID,
      agentRunId: request.agentID,
      supportsSessionApproval: !!request.suggestions?.length,
      permissionDetails: {
        blockedPath: request.blockedPath,
        decisionReason: request.decisionReason,
      },
    })
    this.pending.get(request.toolUseID)!.itemId = itemId
    this.attention('needs-approval')
    this.watchAbort(request)
    return result
  }

  approve(id?: string, options?: { scope: 'once' | 'session' }): void {
    const key = id ?? this.pending.keys().next().value
    if (!key) return
    if (options?.scope === 'session') {
      const rules = readClaudeSessionRules(
        this.pending.get(key)?.request.suggestions,
      )
      this.sessionAllowRules.rules.push(...rules.rules)
      this.sessionAllowRules.directories.push(...rules.directories)
    }
    this.resolve(key, {
      behavior: 'allow',
      toolUseID: key,
      decisionClassification:
        options?.scope === 'session' ? 'user_permanent' : 'user_temporary',
    })
  }

  deny(id?: string): void {
    const key = id ?? this.pending.keys().next().value
    if (!key) return
    this.resolve(key, {
      behavior: 'deny',
      message: 'Denied in Convergence',
      toolUseID: key,
      decisionClassification: 'user_reject',
    })
  }

  answer(text: string, response?: InteractionResponse): void {
    const pending = response?.providerItemId
      ? this.pending.get(response.providerItemId)
      : [...this.pending.values()].find((value) => value.question || value.plan)
    if (!pending) return
    if (pending.plan) {
      this.resolve(
        pending.request.toolUseID,
        response?.kind !== 'plan' || response.decision !== 'approve'
          ? {
              behavior: 'deny',
              toolUseID: pending.request.toolUseID,
              decisionClassification: 'user_reject',
              message:
                (response?.kind === 'plan'
                  ? response.message?.trim()
                  : undefined) ||
                text.trim() ||
                'The user rejected the plan.',
            }
          : {
              behavior: 'allow',
              toolUseID: pending.request.toolUseID,
              decisionClassification: 'user_temporary',
              updatedPermissions: [
                {
                  type: 'setMode',
                  mode: 'acceptEdits',
                  destination: 'session',
                },
              ],
            },
      )
      return
    }
    if (!pending.question) return
    this.resolve(pending.request.toolUseID, {
      behavior: 'allow',
      toolUseID: pending.request.toolUseID,
      decisionClassification: 'user_temporary',
      updatedInput: buildClaudeAskUserQuestionUpdatedInput(
        pending.question,
        response,
        text,
      ),
    })
  }

  denyPendingForStop(): void {
    for (const id of this.pending.keys())
      this.resolve(id, {
        behavior: 'deny',
        toolUseID: id,
        decisionClassification: 'user_reject',
        message: 'Stopped in Convergence',
      })
  }

  endConnection(): void {
    if (this.pending.size)
      this.emitter.addNote({
        text: 'Pending approval cancelled: connection ended',
        level: 'info',
      })
    for (const id of this.pending.keys())
      this.resolve(id, {
        behavior: 'deny',
        toolUseID: id,
        decisionClassification: 'user_reject',
        message: 'connection ended',
      })
    if (
      this.sessionAllowRules.rules.length ||
      this.sessionAllowRules.directories.length
    )
      this.emitter.addNote({
        text: 'session rule cleared: connection ended',
        level: 'info',
      })
    this.sessionAllowRules = { rules: [], directories: [] }
  }

  get pendingAttention(): 'needs-input' | 'needs-approval' | null {
    if (
      [...this.pending.values()].some((value) => value.question || value.plan)
    )
      return 'needs-input'
    return this.pending.size ? 'needs-approval' : null
  }

  private watchAbort(request: ClaudePermissionRequest): void {
    const pending = this.pending.get(request.toolUseID)!
    pending.abort = () => {
      this.emitter.addNote({
        text: 'Pending approval cancelled: connection ended',
        level: 'info',
      })
      this.resolve(request.toolUseID, {
        behavior: 'deny',
        message: 'connection ended',
        toolUseID: request.toolUseID,
        decisionClassification: 'user_reject',
      })
    }
    request.signal.addEventListener('abort', pending.abort, { once: true })
  }

  private resolve(id: string, result: ClaudePermissionResult): void {
    const pending = this.pending.get(id)
    if (!pending) return
    this.pending.delete(id)
    if (pending.abort)
      pending.request.signal.removeEventListener('abort', pending.abort)
    if (pending.itemId)
      this.emitter.resolveInteraction(
        pending.itemId,
        result.behavior === 'allow' ? 'approved' : 'denied',
      )
    pending.resolve(result)
    this.attention(this.pendingAttention ?? 'none')
  }
}
