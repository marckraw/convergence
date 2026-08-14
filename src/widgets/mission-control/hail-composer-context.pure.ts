import type { SessionSummary } from '@/entities/session'
import type { ComposerSessionContext } from '@/features/composer'

/**
 * Points the real composer at the Session behind a card.
 *
 * The Hail is not a second composer — it is the same one, aimed elsewhere. All
 * that changes between hailing from Mission Control and typing inside the
 * conversation is this value.
 */
export function buildHailComposerContext(
  session: SessionSummary,
): ComposerSessionContext {
  // A Chat Session has no Project to belong to. So does a Project Session that
  // somehow lost its project — and a missing projectId is worse than the
  // global context, which at least still resolves the Session itself.
  if (session.contextKind === 'global' || !session.projectId) {
    return { kind: 'global', activeSessionId: session.id }
  }

  return {
    kind: 'project',
    projectId: session.projectId,
    workspaceId: session.workspaceId,
    activeSessionId: session.id,
  }
}
