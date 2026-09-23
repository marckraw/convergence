import type { SessionSummary } from '@/entities/session'
import type { SessionCrew } from '@/entities/session-crew'
import type { WorkLedgerEntry } from '@/entities/work-ledger'

/** The complete session facts read by Loom's rows and horses. */
export type WaveBoardSession = Pick<
  SessionSummary,
  'id' | 'status' | 'attention' | 'activity' | 'executionHost'
>

export function waveBoardSessionIds(
  crews: readonly SessionCrew[],
  rows: readonly WorkLedgerEntry[],
): ReadonlySet<string> {
  return new Set(
    [
      ...crews.flatMap((crew) =>
        crew.members.map((member) => member.sessionId),
      ),
      ...rows.map((row) => row.sessionId),
    ].filter((id): id is string => id !== null),
  )
}

/**
 * A value key: Object.is keeps the subscription quiet for identical facts.
 * Reference order is independent of summary recency order. Missing sessions
 * are absent, so their arrival/removal also changes the key. PR words belong
 * to the ledger; full summaries are looked up separately for conversation doors.
 */
export function waveBoardSessionKey(
  sessions: readonly SessionSummary[],
  ids: ReadonlySet<string>,
): string {
  const byId = new Map(
    sessions
      .filter((session) => ids.has(session.id))
      .map((session) => [session.id, session]),
  )
  return JSON.stringify(
    [...ids].flatMap((id) => {
      const session = byId.get(id)
      return session
        ? [
            {
              id,
              status: session.status,
              attention: session.attention,
              activity: session.activity,
              executionHost: session.executionHost,
            },
          ]
        : []
    }),
  )
}

/** Decode only our own key, keeping every derived view on the same snapshot. */
export function waveBoardSessionsFromKey(
  key: string,
): ReadonlyMap<string, WaveBoardSession> {
  const sessions = JSON.parse(key) as WaveBoardSession[]
  return new Map(sessions.map((session) => [session.id, session]))
}
