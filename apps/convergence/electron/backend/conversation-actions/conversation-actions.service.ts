import type { ConversationRoutineAction } from '../../../src/shared/types/electron-api'
import type { ContextDrillService } from '../context-drill/context-drill.service'
import { isLocalExecutionHost } from '../execution-host-endpoint/execution-host-endpoint.pure'
import type { ProviderExecutionHost } from '../provider/execution-host/execution-host.types'
import type { ProviderRegistry } from '../provider/provider-registry'
import { describeFork } from '../session/fork/session-fork.service'
import type { SessionService } from '../session/session.service'

export interface ConversationActionsDeps {
  sessions: Pick<
    SessionService,
    'getSummaryById' | 'describeCompactionReadiness' | 'describeAccountHandoff'
  >
  drill: Pick<ContextDrillService, 'describe'>
  providers: Pick<ProviderRegistry, 'get'>
  localHost: Pick<ProviderExecutionHost, 'capabilitiesFor'>
}

/** Facade: describes existing conversation routines without owning their rules. */
export class ConversationActionsService {
  constructor(private readonly deps: ConversationActionsDeps) {}

  async describe(sessionId: string): Promise<ConversationRoutineAction[]> {
    const { sessions, drill, providers, localHost } = this.deps
    const session = sessions.getSummaryById(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)
    const local = isLocalExecutionHost(session.executionHost)
    // Remote hosts do not support compaction or account handoff. No remote
    // catalog RPC is needed to describe the routines they can list today.
    const descriptor = local
      ? await providers.get(session.providerId)?.describe()
      : undefined
    const actions: ConversationRoutineAction[] = []
    const drillDescription = drill.describe(sessionId)
    if (drillDescription.eligible) {
      actions.push({
        id: 'drill',
        kind: 'routine',
        label: 'Run the drill',
        offered: drillDescription.offered,
        ...(drillDescription.reason ? { reason: drillDescription.reason } : {}),
      })
    }
    if (
      descriptor?.contextManagement &&
      descriptor.contextManagement.compact.availability !== 'unavailable' &&
      localHost.capabilitiesFor(session.providerId)?.supportsContextManagement
    ) {
      actions.push(
        routine(
          'compact',
          'Compact',
          sessions.describeCompactionReadiness(sessionId),
        ),
      )
    }
    // Both fork refusals are permanent conversation facts. Ask its guard
    // once, using the answer for both listing and availability.
    const fork = describeFork(session)
    if (fork.ready) actions.push(routine('fork', 'Fork', fork))
    if (local && descriptor?.accountHandoff === 'settled') {
      actions.push(
        routine(
          'hand-off',
          'Hand off',
          sessions.describeAccountHandoff(sessionId),
        ),
      )
    }
    return actions
  }
}

function routine(
  id: ConversationRoutineAction['id'],
  label: string,
  readiness: { ready: true } | { ready: false; reason: string },
): ConversationRoutineAction {
  return {
    id,
    kind: 'routine',
    label,
    offered: readiness.ready,
    ...(!readiness.ready ? { reason: readiness.reason } : {}),
  }
}
