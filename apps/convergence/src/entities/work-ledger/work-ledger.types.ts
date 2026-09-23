/**
 * The work ledger as the renderer reads it (MAR-3097). The shapes are P2a's,
 * defined once in `shared/types/tracker.types.ts`; this entity re-exports
 * them so its readers import one slice.
 */
export type {
  TrackerHealth,
  TrackerHealthState,
  WorkLedgerDispatch,
  WorkLedgerEntry,
  WorkLedgerSnapshot,
  WorkLedgerState,
  WorkLedgerVerdict,
} from '@/shared/types/tracker.types'
