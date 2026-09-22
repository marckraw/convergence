import type {
  AutoDispatchRecord,
  TrackerBinding,
  DispatchPlan,
  DispatchLane,
  SeatAvailability,
  WorkLedgerRecord,
} from '../../../src/shared/types/tracker.types'
import type { SessionCrewMember } from '../crew/crew.types'
import { planAutoDispatch } from './auto-dispatch.pure'

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
}

/** Read-only orchestration, with one volatile last-plan cache per crew. */
export class AutoDispatchPlanService {
  private readonly plans = new Map<string, DispatchPlan>()
  constructor(
    private readonly deps: AutoDispatchPlanDeps,
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
    const seats = await Promise.all(
      crew.members.map(async (member) => {
        const lanePath =
          member.lanePolicy === 'own-worktree'
            ? member.lanePath
            : member.localWorkingDirectory
        return {
          ...member,
          availability: member.sessionId
            ? this.deps.describeSeatAvailability(member.sessionId)
            : ('unknown' as const),
          lanePath,
          lane:
            member.lanePolicy === 'own-worktree' && !member.lanePath
              ? ('unset' as const)
              : member.localWorkingDirectory && lanePath
                ? await this.deps.describeLane(lanePath)
                : ('unknown' as const),
          wire:
            master?.sessionId && member.sessionId
              ? this.deps.findWire(crewId, master.sessionId, member.sessionId)
              : null,
        }
      }),
    )
    const plan = planAutoDispatch({
      plannedAt,
      autoDispatch: crew.trackerBinding?.autoDispatch ?? false,
      records: this.records(crewId),
      seats,
      entries: this.deps.currentView(crewId),
      firstSeen: this.deps.firstDispatchSeenAt(crewId),
    })
    this.plans.set(crewId, plan)
    return plan
  }
}
