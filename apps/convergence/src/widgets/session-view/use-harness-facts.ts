import { useEffect, useState } from 'react'
import type { SessionHarnessFacts } from '@/shared/types/harness-facts.types'
import { harnessFactsApi } from './harness-facts.api'
export function useHarnessFacts(sessionId: string | null) {
  const [record, setRecord] = useState<{
    id: string
    facts: SessionHarnessFacts | null
    error: string | null
  } | null>(null)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    if (!sessionId) return
    let alive = true,
      scheduled = false,
      generation = 0
    const refresh = () => {
      if (scheduled) return
      scheduled = true
      queueMicrotask(async () => {
        scheduled = false
        if (!alive) return
        const request = ++generation
        try {
          const facts = await harnessFactsApi.read(sessionId)
          if (alive && request === generation)
            setRecord({ id: sessionId, facts, error: null })
        } catch (error) {
          if (alive && request === generation)
            setRecord((previous) => ({
              id: sessionId,
              facts: previous?.id === sessionId ? previous.facts : null,
              error:
                error instanceof Error
                  ? error.message
                  : 'Could not read harness facts',
            }))
        }
      })
    }
    const update = (event: { sessionId: string }) => {
      if (event.sessionId === sessionId) refresh()
    }
    const unsubscribe = harnessFactsApi.subscribe(update)
    const unsubscribeSummary = harnessFactsApi.subscribeSummary(update)
    refresh()
    return () => {
      alive = false
      unsubscribe()
      unsubscribeSummary()
    }
  }, [sessionId, revision])
  const current = record?.id === sessionId ? record : null
  return {
    facts: current?.facts ?? null,
    error: current?.error ?? null,
    loading: !!sessionId && !current,
    retry: () => setRevision((n) => n + 1),
  }
}
