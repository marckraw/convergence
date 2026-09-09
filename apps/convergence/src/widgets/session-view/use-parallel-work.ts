import { useEffect, useMemo, useState } from 'react'
import type { ConversationItem } from '@/entities/session'
import type {
  SessionAgentRun,
  SessionTask,
} from '@/shared/types/harness-evidence.types'
import { buildParallelWork } from '@/shared/lib/parallel-work.pure'
import { parallelWorkApi } from './parallel-work.api'

export function useParallelWork(
  sessionId: string | null,
  items: ConversationItem[],
) {
  const [settledSessionId, setSettledSessionId] = useState<string | null>(null)
  const [record, setRecord] = useState<{
    sessionId: string
    runs: SessionAgentRun[]
    tasks: SessionTask[]
  } | null>(null)
  const [error, setError] = useState<{
    sessionId: string
    message: string
  } | null>(null)
  useEffect(() => {
    if (!sessionId) return
    let active = true
    let revision = 0
    const read = async () => {
      const current = ++revision
      try {
        const next = await parallelWorkApi.read(sessionId)
        if (active && current === revision) {
          setRecord({ sessionId, ...next })
          setError(null)
        }
      } catch (failure) {
        if (active && current === revision)
          setError({
            sessionId,
            message:
              failure instanceof Error ? failure.message : String(failure),
          })
      } finally {
        if (active && current === revision) setSettledSessionId(sessionId)
      }
    }
    void read()
    const unsubscribe = parallelWorkApi.subscribe((event) => {
      if (event.sessionId === sessionId) void read()
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [sessionId])
  const parentByItem = new Map(
    items.map((item) => [item.id, item.agentRunId ?? null]),
  )
  const parentLinksKey = JSON.stringify(
    (record?.runs ?? []).map((run) => [
      run.spawnedByItemId,
      parentByItem.get(run.spawnedByItemId) ?? null,
    ]),
  )
  const rows = useMemo(() => {
    const links = JSON.parse(parentLinksKey) as Array<[string, string | null]>
    return record?.sessionId === sessionId
      ? buildParallelWork(
          record.runs,
          record.tasks,
          links.map(([id, agentRunId]) => ({ id, agentRunId })),
        )
      : []
  }, [record, sessionId, parentLinksKey])
  return {
    rows,
    error: error?.sessionId === sessionId ? error.message : null,
    loading: Boolean(sessionId) && settledSessionId !== sessionId,
  }
}
