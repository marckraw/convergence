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
  const rows = useMemo(
    () =>
      record?.sessionId === sessionId
        ? buildParallelWork(record.runs, record.tasks, items)
        : [],
    [record, sessionId, items],
  )
  return {
    rows,
    error: error?.sessionId === sessionId ? error.message : null,
    loading: Boolean(sessionId) && settledSessionId !== sessionId,
  }
}
