import type { SessionStatus } from '../provider/provider.types'
import type {
  CreateSessionInput,
  SessionSettledEvent,
} from '../session/session.types'
import { resolveAccountForAutomaticTurn } from '../provider-account/provider-account-automatic-turn.pure'
import type { AutomaticTurnAccountSource } from '../provider-account/provider-account-automatic-turn.pure'
import {
  buildPayloadPreview,
  flowRunBudgetMessage,
  hasFlowRunBudget,
} from './relay.pure'
import type { RelayService } from './relay.service'
import type {
  RelayHop,
  RelayHopOutcome,
  RelaySpawnSpec,
  SessionRelay,
} from './relay.types'

/**
 * The narrow face of SessionService the engine is allowed to touch.
 *
 * Relays send real prompts to real providers that spend real quota, so the
 * engine talks to sessions through this seam and nothing wider -- a test
 * substitutes it and can never accidentally start a provider process.
 */
export interface RelaySessionGateway {
  getById(sessionId: string): {
    id: string
    status: SessionStatus
    providerId: string
    /** Remote sessions cannot carry a local account (PA10). */
    executionHost: string
  } | null
  getLastAssistantMessageText(sessionId: string): string | null
  /** The account the session's newest turn ran on, or null for ambient. */
  getLastTurnProviderAccountId(sessionId: string): string | null
  sendMessage(
    sessionId: string,
    input: { text: string; providerAccountId?: string | null },
  ): Promise<void>
  create(input: CreateSessionInput): { id: string }
  start(
    sessionId: string,
    input: { text: string; providerAccountId?: string | null },
  ): Promise<void>
}

/**
 * The one crew operation a spawn performs. Narrow on purpose: the engine may
 * put a session it just made into the crew that asked for it, and nothing else.
 */
export interface RelayCrewGateway {
  addMember(crewId: string, sessionId: string): unknown
}

type RecordHopFn = (
  outcome: RelayHopOutcome,
  extra?: {
    targetSessionId?: string | null
    spawnedSessionId?: string | null
    payloadPreview?: string | null
    error?: string | null
  },
) => void

interface RelayEngineDeps {
  relays: RelayService
  sessions: RelaySessionGateway
  crews: RelayCrewGateway
  accounts: AutomaticTurnAccountSource
  /** Called for every ledger row, so windows can watch the trail live. */
  onHopAppended?: (hop: RelayHop) => void
  /** Called when the engine disarms a wire on its own. */
  onRelaysChanged?: () => void
  /** Called after a spawn joins a crew, so the roster refreshes live. */
  onCrewsChanged?: () => void
}

/**
 * The switchboard operator.
 *
 * Convergence is the only thing that moves work between sessions -- agents
 * never call agents. This engine listens for sessions coming to rest, reads
 * the wires the user drew inside a crew, and carries the finished session's
 * last assistant message along them. Every wire that actually fires writes a
 * ledger row before this returns -- deliveries, skips and errors alike. A
 * disarmed wire does not fire, and so writes nothing.
 */
export class RelayEngine {
  private readonly relays: RelayService
  private readonly sessions: RelaySessionGateway
  private readonly crews: RelayCrewGateway
  private readonly accounts: AutomaticTurnAccountSource
  private readonly onHopAppended?: (hop: RelayHop) => void
  private readonly onRelaysChanged?: () => void
  private readonly onCrewsChanged?: () => void

  constructor(deps: RelayEngineDeps) {
    this.relays = deps.relays
    this.sessions = deps.sessions
    this.crews = deps.crews
    this.accounts = deps.accounts
    this.onHopAppended = deps.onHopAppended
    this.onRelaysChanged = deps.onRelaysChanged
    this.onCrewsChanged = deps.onCrewsChanged
  }

  /**
   * Handles one settle. Never rejects: it is driven from the session
   * lifecycle, and a broken wire must not be able to damage a session.
   */
  async handleSettle(event: SessionSettledEvent): Promise<void> {
    try {
      const relays = this.relays.listForSourceSession(event.sessionId)
      if (relays.length === 0) return

      // Resolved once per settle so every wire leaving this session is
      // measured against the same run, and the same budget.
      const flowRunId = this.relays.resolveFlowRunId(event.sessionId)

      for (const relay of relays) {
        await this.fire(relay, event, flowRunId)
      }
    } catch (error) {
      console.error(
        `[relay] failed to handle settle for ${event.sessionId}`,
        error,
      )
    }
  }

  private async fire(
    relay: SessionRelay,
    event: SessionSettledEvent,
    flowRunId: string,
  ): Promise<void> {
    const record: RecordHopFn = (outcome, extra = {}) => {
      const hop = this.relays.appendHop({
        relayId: relay.id,
        crewId: relay.crewId,
        flowRunId,
        sourceSessionId: event.sessionId,
        triggerStatus: event.status,
        targetSessionId: extra.targetSessionId ?? relay.targetSessionId,
        spawnedSessionId: extra.spawnedSessionId ?? null,
        payloadPreview: extra.payloadPreview ?? null,
        outcome,
        error: extra.error ?? null,
      })
      this.onHopAppended?.(hop)
    }

    // A disarmed wire is a switch at rest, not a firing. "No silent hops"
    // guards deliveries the user cannot see -- it was never a promise to
    // journal every session that finishes near a switched-off wire, and doing
    // so buried the real rows under noise.
    if (!relay.armed) return

    // v1 fires on completion only. A failure still writes a row, because
    // "my wire did not fire" must always have a visible answer.
    if (event.status !== 'completed') {
      record('skipped-failed', {
        error: 'The source session failed, so nothing was carried.',
      })
      return
    }

    const spentHops = this.relays.countBudgetedHops(flowRunId)
    if (!hasFlowRunBudget(spentHops)) {
      this.relays.setArmed(relay.id, false)
      this.onRelaysChanged?.()
      record('skipped-budget', { error: flowRunBudgetMessage(spentHops) })
      return
    }

    const payload = this.sessions.getLastAssistantMessageText(event.sessionId)
    if (!payload) {
      record('error', {
        error: 'The session finished without an assistant message to carry.',
      })
      return
    }
    const payloadPreview = buildPayloadPreview(payload)

    if (relay.action === 'spawn') {
      await this.spawn(relay, payload, payloadPreview, record)
      return
    }

    const targetSessionId = relay.targetSessionId
    if (!targetSessionId) {
      record('error', { payloadPreview, error: 'This relay has no target.' })
      return
    }

    const target = this.sessions.getById(targetSessionId)
    if (!target) {
      record('error', {
        payloadPreview,
        error: 'The target session no longer exists.',
      })
      return
    }

    // Read before sending: SessionService decides on its own whether a running
    // target queues the text or takes it as a mid-run follow-up, and the
    // ledger should say which of the two the user is waiting on.
    const targetWasRunning = target.status === 'running'

    try {
      await this.sessions.sendMessage(targetSessionId, {
        text: payload,
        providerAccountId: this.resolveInheritedAccountId(target),
      })
      record(targetWasRunning ? 'queued' : 'delivered', { payloadPreview })
    } catch (error) {
      record('error', {
        payloadPreview,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /**
   * Which account a hop into an existing session should ride.
   *
   * The session's own, inherited from its last turn -- a relay is another turn
   * in a conversation already under way, not a new relationship, so it should
   * not change who is paying for it. Falls back to the enrolled default, and
   * finally to ambient, which is what every hop did before this existed.
   */
  private resolveInheritedAccountId(session: {
    id: string
    providerId: string
    executionHost: string
  }): string | null {
    return resolveAccountForAutomaticTurn({
      executionHost: session.executionHost,
      lastTurnAccountId: this.sessions.getLastTurnProviderAccountId(session.id),
      accounts: this.accounts.listByProvider(session.providerId),
    })
  }

  /**
   * Which account a session this wire is about to open should be born on.
   *
   * The wire's own choice wins; otherwise the enrolled default for the provider
   * it names. This has to be right at birth: Codex fixes a session's credential
   * when its first turn starts and refuses to change it afterwards, so there is
   * no correcting a spawn that came up on the wrong account.
   */
  private resolveSpawnAccountId(spec: RelaySpawnSpec): string | null {
    if (spec.providerAccountId) return spec.providerAccountId

    return resolveAccountForAutomaticTurn({
      // A spawn opens a local session; nothing in a spawn spec can ask for a
      // remote host today.
      executionHost: 'local',
      lastTurnAccountId: null,
      accounts: this.accounts.listByProvider(spec.providerId),
    })
  }

  /**
   * Opens a brand new session and starts it on the payload.
   *
   * The spawned session joins the crew that owns the wire. A session that
   * appeared from a relay but sat outside the crew would show up in the room
   * with no visible reason for existing -- close enough to a silent hop to be
   * worth the membership row.
   *
   * Creation and start are recorded separately on purpose: a session that was
   * created but failed to start still exists, and the ledger must name it so
   * the user can find the thing that is now sitting in their room.
   */
  private async spawn(
    relay: SessionRelay,
    payload: string,
    payloadPreview: string | null,
    record: RecordHopFn,
  ): Promise<void> {
    const spec = relay.spawnSpec
    if (!spec) {
      record('error', {
        payloadPreview,
        error: 'This spawn relay has no session spec.',
      })
      return
    }

    let spawnedSessionId: string
    try {
      const created = this.sessions.create(
        spec.projectId
          ? {
              contextKind: 'project',
              projectId: spec.projectId,
              workspaceId: null,
              providerId: spec.providerId,
              model: spec.model,
              effort: spec.effort as CreateSessionInput['effort'],
              name: spec.name,
            }
          : {
              contextKind: 'global',
              providerId: spec.providerId,
              model: spec.model,
              effort: spec.effort as CreateSessionInput['effort'],
              name: spec.name,
            },
      )
      spawnedSessionId = created.id
    } catch (error) {
      record('error', {
        payloadPreview,
        error: `Could not open the session: ${
          error instanceof Error ? error.message : String(error)
        }`,
      })
      return
    }

    try {
      this.crews.addMember(relay.crewId, spawnedSessionId)
      this.onCrewsChanged?.()
    } catch {
      // Membership is a convenience, not the hop. A spawn that could not join
      // its crew is still a spawn, and the ledger names the session either way.
    }

    try {
      await this.sessions.start(spawnedSessionId, {
        text: payload,
        providerAccountId: this.resolveSpawnAccountId(spec),
      })
      record('spawned', { spawnedSessionId, payloadPreview })
    } catch (error) {
      record('error', {
        spawnedSessionId,
        payloadPreview,
        error: `Opened the session but could not start it: ${
          error instanceof Error ? error.message : String(error)
        }`,
      })
    }
  }
}
