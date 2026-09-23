export interface MergeReading {
  url: string
  headSha: string
  title: string
  mergeStateStatus: string
  verify: string
  mergeCommit: string | null
}

export interface ReleaseCandidate extends MergeReading {
  issueId: string
  prNumber: number
  wave: string | null
  verdict: string
}

export interface ReleaseAct {
  id: string
  crewId: string
  issueId: string
  prNumber: number
  headSha: string
  requestedAt: string
  startedAt: string | null
  completedAt: string | null
  outcome: 'pending' | 'running' | 'merged' | 'skipped' | 'failed'
  error: string | null
}

export interface ReleaseProgress {
  acts: ReleaseAct[]
  running: boolean
  waitingFor: number | null
}

export interface ReleasePlan extends ReleaseProgress {
  id: string
  candidates: ReleaseCandidate[]
  unavailable: boolean
}

export interface ReleaseSeat {
  crewId: string
  sessionId: string
}

export interface ReleaseMergeInput extends ReleaseSeat {
  planId: string
  issueIds: string[]
}
