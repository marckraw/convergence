import type { ProviderSessionEmitter } from '../provider-session.emitter'
import type {
  ClaudePermissionRequest,
  ClaudePermissionResult,
} from './claude-permission.types'
import {
  readClaudeSessionRules,
  isRememberableSuggestionSet,
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

  async request(
    request: ClaudePermissionRequest,
  ): Promise<ClaudePermissionResult> {
    try {
      return await this.requestDecision(request)
    } catch {
      const denied: ClaudePermissionResult = {
        behavior: 'deny',
        message: 'Permission request failed in Convergence',
        toolUseID: request.toolUseID,
        decisionClassification: 'user_reject',
      }
      try {
        this.resolve(request.toolUseID, denied)
      } catch {
        // The callback still settles if recording its denial also fails.
      }
      return denied
    }
  }

  private requestDecision(
    request: ClaudePermissionRequest,
  ): Promise<ClaudePermissionResult> {
    this.resolve(request.toolUseID, {
      behavior: 'deny',
      message: 'superseded',
      toolUseID: request.toolUseID,
      decisionClassification: 'user_reject',
    })
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
        request.suggestions,
        request.toolName,
        !!request.matchedAskRule,
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
      supportsSessionApproval: isRememberableSuggestionSet(
        request.suggestions,
        request.toolName,
        !!request.matchedAskRule,
      ),
      permissionDetails: {
        blockedPath: request.blockedPath,
        decisionReason: request.matchedAskRule
          ? [
              request.decisionReason,
              `Ask rule: ${request.matchedAskRule.toolName}${request.matchedAskRule.ruleContent !== undefined ? `(${request.matchedAskRule.ruleContent})` : ''} (${request.matchedAskRule.source})`,
            ]
              .filter(Boolean)
              .join(' · ')
          : request.decisionReason,
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

  answer(text: string, response?: InteractionResponse): boolean {
    const pending = response?.providerItemId
      ? this.pending.get(response.providerItemId)
      : [...this.pending.values()]
          .reverse()
          .find((value) => value.question || value.plan)
    if (!pending) return false
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
      return true
    }
    if (!pending.question) return false
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
    return true
  }

  denyPendingForStop(): void {
    for (const id of this.pending.keys()) {
      try {
        this.resolve(id, {
          behavior: 'deny',
          toolUseID: id,
          decisionClassification: 'user_reject',
          message: 'Stopped in Convergence',
        })
      } catch {
        // resolve settles this callback even if recording fails; settle the rest.
      }
    }
  }

  endConnection(): void {
    if (this.pending.size)
      this.noteConnectionEnd('Pending approval cancelled: connection ended')
    for (const id of this.pending.keys()) {
      try {
        this.resolve(id, {
          behavior: 'deny',
          toolUseID: id,
          decisionClassification: 'user_reject',
          message: 'connection ended',
        })
      } catch {
        // resolve settles this callback even if recording fails; settle the rest.
      }
    }
    if (
      this.sessionAllowRules.rules.length ||
      this.sessionAllowRules.directories.length
    )
      this.noteConnectionEnd('session rule cleared: connection ended')
    this.sessionAllowRules = { rules: [], directories: [] }
  }

  get pendingAttention(): 'needs-input' | 'needs-approval' | null {
    if (
      [...this.pending.values()].some((value) => value.question || value.plan)
    )
      return 'needs-input'
    return this.pending.size ? 'needs-approval' : null
  }

  private noteConnectionEnd(text: string): void {
    try {
      this.emitter.addNote({ text, level: 'info' })
    } catch {
      // Recording a note must never prevent permission settlement or memory cleanup.
    }
  }

  private watchAbort(request: ClaudePermissionRequest): void {
    const pending = this.pending.get(request.toolUseID)!
    pending.abort = () => {
      this.noteConnectionEnd('Pending approval cancelled: connection ended')
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
    try {
      if (pending.itemId)
        this.emitter.resolveInteraction(
          pending.itemId,
          result.behavior === 'allow' ? 'approved' : 'denied',
        )
    } finally {
      pending.resolve(result)
      this.attention(this.pendingAttention ?? 'none')
    }
  }
}
