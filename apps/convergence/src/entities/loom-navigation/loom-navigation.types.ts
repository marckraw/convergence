import type { WorkLedgerEntry } from '@/entities/work-ledger'

export interface LoomNavigationRequest {
  crewId: string
  target:
    | { kind: 'issue'; entry: WorkLedgerEntry; sessionId: string }
    | { kind: 'seat'; sessionId: string }
}
