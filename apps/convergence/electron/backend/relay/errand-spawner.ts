import type { RelayCrewGateway, RelaySessionGateway } from './relay.engine'
import type { RelayService } from './relay.service'
import type { RelaySpawnSpec } from './relay.types'
import type { CreateSessionInput } from '../session/session.types'
import {
  resolveAccountForAutomaticTurn,
  type AutomaticTurnAccountSource,
} from '../provider-account/provider-account-automatic-turn.pure'

export interface ErrandSpawnContext {
  crewId: string
  returnTo: string
  /** Persist the created identity before the asynchronous start. */
  onCreated?: (sessionId: string) => void
}
export interface ErrandSpawnResult {
  sessionId: string | null
  dispatchId: string | null
  error: string | null
}

/** Shared use-case service: baton and issue dispatch use the same session, crew and return-wire lifecycle. */
export class ErrandSpawner {
  constructor(
    private readonly deps: {
      sessions: Pick<RelaySessionGateway, 'create' | 'start'>
      crews: Pick<RelayCrewGateway, 'addMember'>
      relays: Pick<RelayService, 'create'>
      accounts: AutomaticTurnAccountSource
      onCrewsChanged?: () => void
      onRelaysChanged?: () => void
    },
  ) {}

  async spawn(
    spec: RelaySpawnSpec,
    brief: string,
    context: ErrandSpawnContext,
  ): Promise<ErrandSpawnResult> {
    let spawnedSessionId: string
    try {
      const created = this.deps.sessions.create({
        origin: 'spawn',
        ...(spec.projectId
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
            }),
        ...(spec.executionHost === 'local'
          ? {}
          : {
              executionHost: spec.executionHost,
              workAddress: spec.workAddress,
            }),
      })
      spawnedSessionId = created.id
    } catch (error) {
      return {
        sessionId: null,
        dispatchId: null,
        error: `Could not open the session: ${
          error instanceof Error ? error.message : String(error)
        }`,
      }
    }

    try {
      this.deps.crews.addMember(context.crewId, spawnedSessionId)
      this.deps.onCrewsChanged?.()
    } catch {
      // Membership is a convenience, not the hop. A spawn that could not join
      // its crew is still a spawn, and the ledger names the session either way.
    }

    let dispatchId: string
    try {
      context.onCreated?.(spawnedSessionId)
      dispatchId = await this.deps.sessions.start(spawnedSessionId, {
        text: brief,
        providerAccountId: this.resolveSpawnAccountId(spec),
      })
    } catch (error) {
      return {
        sessionId: spawnedSessionId,
        dispatchId: null,
        error: `Opened the session but could not start it: ${
          error instanceof Error ? error.message : String(error)
        }`,
      }
    }

    if (spec.returnWire) {
      try {
        this.deps.relays.create({
          crewId: context.crewId,
          sourceSessionId: spawnedSessionId,
          targetSessionId: context.returnTo,
          action: 'hail',
          conditionToken: null,
          instruction: spec.returnWire.instruction,
          armed: true,
        })
        this.deps.onRelaysChanged?.()
      } catch (error) {
        return {
          sessionId: spawnedSessionId,
          dispatchId,
          error: `Started the errand but could not draw its return wire: ${
            error instanceof Error ? error.message : String(error)
          }`,
        }
      }
    }
    return { sessionId: spawnedSessionId, dispatchId, error: null }
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
    if (spec.executionHost === 'local' && spec.providerAccountId)
      return spec.providerAccountId

    return resolveAccountForAutomaticTurn({
      executionHost: spec.executionHost,
      lastTurnAccountId: null,
      accounts: this.deps.accounts.listByProvider(spec.providerId),
    })
  }
}
