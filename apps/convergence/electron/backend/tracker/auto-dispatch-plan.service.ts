import type {
  AutoDispatchRecord,
  TrackerBinding,
  DispatchPlan,
  DispatchLane,
  SeatAvailability,
  WorkLedgerRecord,
} from '../../../src/shared/types/tracker.types'
import type { SessionCrewMember } from '../crew/crew.types'
import type { RelayService } from '../relay/relay.service'
import { issueNeedsFigma } from '../../../src/shared/lib/figma-link.pure'
import { planAutoDispatch } from './auto-dispatch.pure'
import type { SeatFigmaAnswer } from './seat-figma-reach.service'

/** The crew read includes each resident conversation's local lane; remote or missing is null. */
export interface DispatchCrew {
  id: string
  trackerBinding?: TrackerBinding | null
  members: (SessionCrewMember & { localWorkingDirectory: string | null })[]
}

/** Reader port: no delivery, steering, queue, or persistence capabilities. */
export interface AutoDispatchPlanDeps {
  listCrews(): DispatchCrew[]
  currentView(crewId: string): WorkLedgerRecord[]
  firstDispatchSeenAt(crewId: string): Map<string, string>
  describeSeatAvailability(sessionId: string): SeatAvailability
  findWire(
    crewId: string,
    sourceSessionId: string,
    targetSessionId: string,
  ): { id: string; opener: string | null } | null
  describeLane(path: string): Promise<DispatchLane>
  /**
   * Whether a resident seat's account reaches Figma (MAR-3526); asked only
   * for a seat with a design-sourced issue assigned. Absent: never asked,
   * and such an issue stops.
   */
  seatFigmaReach?(sessionId: string): Promise<SeatFigmaAnswer>
}

/** Optional recipe readers keep the resident-only planner usable without a spawn door. */
export interface RecipeDispatchPlanDeps {
  findSpawnWire: RelayService['findSpawnWire']
  liveSpawnCount(crewId: string, seat: string): number
}

/** Read-only orchestration, with one volatile last-plan cache per crew. */
export class AutoDispatchPlanService {
  private readonly plans = new Map<string, DispatchPlan>()
  constructor(
    private readonly deps: AutoDispatchPlanDeps &
      Partial<RecipeDispatchPlanDeps>,
    private readonly records: (
      crewId: string,
    ) => readonly AutoDispatchRecord[] = () => [],
  ) {}

  cached(crewId: string): DispatchPlan | null {
    return this.plans.get(crewId) ?? null
  }

  async refresh(crewId: string, plannedAt: string): Promise<DispatchPlan> {
    // A failed refresh must not leave a previous permission looking current.
    this.plans.delete(crewId)
    const crew = this.deps.listCrews().find((c) => c.id === crewId)
    if (!crew) throw new Error(`Crew not found: ${crewId}`)
    const master = crew.members.find(
      (m) => m.role === 'mastermind' && m.sessionId,
    )
    const entries = this.deps.currentView(crewId)
    const records = this.records(crewId)
    // Asked only for a design issue that could otherwise start: labels set,
    // not blocked, lap 1, not already sent. A groom-me issue with a Figma
    // link sitting for days never costs a check (MAR-3526).
    const needFigma = new Set(
      entries
        .filter(
          (entry) =>
            entry.state === 'assigned' &&
            entry.seat !== null &&
            issueNeedsFigma(entry.fact) &&
            entry.fact.groomed === true &&
            entry.fact.grounded === true &&
            entry.fact.dispatch === true &&
            !entry.blocked &&
            entry.lap <= 1 &&
            !records.some(
              (record) =>
                record.issueId === entry.issueId && record.lap === entry.lap,
            ),
        )
        .map((entry) => entry.seat),
    )
    const seats = await Promise.all(
      crew.members.map(async (member) => {
        const recipe = member.kind === 'dynamic'
        const lanePath =
          !recipe && member.lanePolicy === 'own-worktree'
            ? member.lanePath
            : member.localWorkingDirectory
        return {
          ...member,
          liveSpawns:
            recipe && member.batonName
              ? (this.deps.liveSpawnCount?.(crewId, member.batonName) ?? 0)
              : 0,
          availability: recipe
            ? ('idle' as const)
            : member.sessionId
              ? this.deps.describeSeatAvailability(member.sessionId)
              : ('unknown' as const),
          lanePath,
          lane:
            !recipe && member.lanePolicy === 'own-worktree' && !member.lanePath
              ? ('unset' as const)
              : member.localWorkingDirectory && lanePath
                ? await this.deps.describeLane(lanePath)
                : ('unknown' as const),
          wire:
            recipe && master?.sessionId && member.batonName
              ? (this.deps.findSpawnWire?.(
                  crewId,
                  master.sessionId,
                  member.batonName,
                ) ?? null)
              : master?.sessionId && member.sessionId
                ? this.deps.findWire(crewId, master.sessionId, member.sessionId)
                : null,
          // A recipe seat's spawn has no account yet: left unasked (unknown).
          ...(!recipe &&
          member.sessionId &&
          member.batonName &&
          needFigma.has(member.batonName) &&
          this.deps.seatFigmaReach
            ? { figma: await this.deps.seatFigmaReach(member.sessionId) }
            : {}),
        }
      }),
    )
    const plan = planAutoDispatch({
      plannedAt,
      autoDispatch: crew.trackerBinding?.autoDispatch ?? false,
      records,
      seats,
      entries,
      firstSeen: this.deps.firstDispatchSeenAt(crewId),
    })
    this.plans.set(crewId, plan)
    return plan
  }
}
