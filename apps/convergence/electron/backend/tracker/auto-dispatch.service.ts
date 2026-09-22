import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import type {
  AutoDispatchRecord,
  DispatchPlan,
  WorkLedgerRecord,
} from '../../../src/shared/types/tracker.types'
import type { SessionService } from '../session/session.service'
import type { RelayService } from '../relay/relay.service'
import type { WorkLedgerService } from '../work-ledger/work-ledger.service'
import type { GitService } from '../git/git.service'
import type { SessionCrewMember } from '../crew/crew.types'
import type { TrackerBinding } from './tracker.types'
import {
  resolveAccountForAutomaticTurn,
  type AutomaticTurnAccountSource,
} from '../provider-account/provider-account-automatic-turn.pure'
import { autoDispatchText, autoDispatchTime } from './auto-dispatch.pure'

/** Capability port: the four plan readers, account readers, two sends and one note. */
export type AutoDispatchGateway = Pick<
  SessionService,
  | 'describeSeatAvailability'
  | 'getLastTurnProviderAccountId'
  | 'sendMessageWithOpener'
  | 'deliverRelayMessage'
  | 'addAutoDispatchNote'
> &
  Pick<RelayService, 'findWire'> &
  Pick<GitService, 'describeLane'> &
  Pick<WorkLedgerService, 'firstDispatchSeenAt'> &
  AutomaticTurnAccountSource

export interface AutoDispatchCrew {
  id: string
  trackerBinding?: TrackerBinding | null
  members: (SessionCrewMember & { executionHost: string })[]
}

/** Durable claim-and-send use case; the relay engine and tracker writes are absent. */
export class AutoDispatchService {
  constructor(
    private readonly db: Database.Database,
    private readonly gateway: AutoDispatchGateway,
    private readonly crews: { list(): AutoDispatchCrew[] },
    private readonly ledger: Pick<WorkLedgerService, 'currentView'>,
  ) {}

  records(crewId: string): AutoDispatchRecord[] {
    return this.db
      .prepare(
        `SELECT issue_id AS issueId, lap, sent_at AS sentAt, error
      FROM auto_dispatches WHERE crew_id = ?`,
      )
      .all(crewId) as AutoDispatchRecord[]
  }

  async act(crewId: string, plan: DispatchPlan, at: string): Promise<void> {
    const entries = this.ledger.currentView(crewId)
    // Only an observed removal releases a failed claim. Delivered facts survive forever.
    const forgetFailed = this.db.prepare(`DELETE FROM auto_dispatches
      WHERE crew_id = ? AND issue_id = ? AND lap = ? AND error IS NOT NULL`)
    for (const entry of entries) {
      if (entry.fact.dispatch !== true)
        forgetFailed.run(crewId, entry.issueId, entry.lap)
    }
    const candidates = Object.values(plan.order)
      .flat()
      .flatMap((id) => {
        const entry = entries.find((e) => e.issueId === id)
        return entry ? [entry] : []
      })
    for (const entry of candidates) {
      const word = plan.words[entry.issueId]
      if (
        word?.kind !== 'would-start' ||
        entry.lap !== 1 ||
        entry.fact.dispatch !== true
      )
        continue
      const crew = this.crews.list().find((c) => c.id === crewId)
      if (!crew?.trackerBinding?.autoDispatch) return
      const master = crew.members.find(
        (m) => m.role === 'mastermind' && m.sessionId,
      )
      const seat = crew.members.find((m) => m.batonName === entry.seat)
      if (
        !master?.sessionId ||
        !master.batonName ||
        !seat?.sessionId ||
        seat.paused ||
        !seat.providerId
      )
        continue
      const wire = this.gateway.findWire(
        crewId,
        master.sessionId,
        seat.sessionId,
      )
      if (!wire || wire.id !== word.wire.id) continue
      const providerAccountId = resolveAccountForAutomaticTurn({
        executionHost: seat.executionHost,
        lastTurnAccountId: this.gateway.getLastTurnProviderAccountId(
          seat.sessionId,
        ),
        accounts: this.gateway.listByProvider(seat.providerId),
      })
      const text = autoDispatchText({
        roleCard: seat.roleCard,
        instruction: wire.instruction,
        issueUrl: entry.issueUrl,
        mastermind: master.batonName,
      })
      // No async seam between the last availability read, durable claim and send call.
      if (this.gateway.describeSeatAvailability(seat.sessionId) !== 'idle')
        continue
      const id = randomUUID()
      const claimed = this.db
        .prepare(
          `INSERT INTO auto_dispatches
        (id, crew_id, issue_id, lap, seat, session_id, wire_id, sent_at, delivery)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'turn')
        ON CONFLICT(crew_id, issue_id, lap) DO NOTHING`,
        )
        .run(
          id,
          crewId,
          entry.issueId,
          entry.lap,
          entry.seat,
          seat.sessionId,
          wire.id,
          at,
        )
      if (claimed.changes === 0) continue
      await this.deliver(
        id,
        entry,
        master.sessionId,
        seat.sessionId,
        wire.opener,
        text,
        providerAccountId,
        at,
      )
    }
  }

  private async deliver(
    id: string,
    entry: WorkLedgerRecord,
    mastermind: string,
    sessionId: string,
    opener: string | null,
    text: string,
    providerAccountId: string | null,
    at: string,
  ): Promise<void> {
    let result:
      | Awaited<ReturnType<AutoDispatchGateway['sendMessageWithOpener']>>
      | Awaited<ReturnType<AutoDispatchGateway['deliverRelayMessage']>>
    try {
      result = opener
        ? await this.gateway.sendMessageWithOpener(sessionId, {
            opener,
            text,
            providerAccountId,
          })
        : await this.gateway.deliverRelayMessage(sessionId, {
            text,
            providerAccountId,
          })
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      this.db
        .prepare('UPDATE auto_dispatches SET error = ? WHERE id = ?')
        .run(reason, id)
      const note = `Auto-dispatch of ${entry.issueIdentifier} → ${entry.seat} failed: ${reason}`
      this.gateway.addAutoDispatchNote(mastermind, note)
      return
    }
    const queued =
      'openerQueued' in result ? result.openerQueued : result.queued
    const receipt =
      'payloadDispatchId' in result
        ? result.payloadDispatchId
        : result.dispatchId
    this.db
      .prepare(
        'UPDATE auto_dispatches SET delivery = ?, receipt = ? WHERE id = ?',
      )
      .run(queued ? 'queued' : 'turn', receipt, id)
    const note = `Auto-dispatched ${entry.issueIdentifier} "${entry.issueTitle}" → ${entry.seat} at ${autoDispatchTime(at)} (lap 1)`
    // A note failure must never turn a delivered fact into a retryable send failure.
    this.gateway.addAutoDispatchNote(mastermind, note)
  }
}
