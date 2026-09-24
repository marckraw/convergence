import { useSessionCrewStore } from '@/entities/session-crew'
import { useWorkLedgerStore } from '@/entities/work-ledger'
import { useLoomNavigationStore } from '@/entities/loom-navigation'
import { buildConversationProjectActions } from './conversation-actions.pure'

/** Renderer-only roster and ledger facts; no tracker or ledger commands. */
export function useConversationProjectActions(sessionId: string) {
  const crews = useSessionCrewStore((state) => state.crews)
  const snapshots = useWorkLedgerStore((state) => state.snapshots)
  const currentCrewId = useLoomNavigationStore((state) => state.shownCrewId)
  return buildConversationProjectActions({
    sessionId,
    crews,
    snapshots,
    currentCrewId,
  })
}
