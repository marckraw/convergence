import { useCallback, useEffect, useState } from 'react'
import type { SessionHarnessFacts } from '@/shared/types/harness-facts.types'
import { harnessFactsApi } from './harness-facts.api'
import { mcpRefusal } from './harness-facts.pure'
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
    refresh()
    return () => {
      alive = false
      unsubscribe()
    }
  }, [sessionId, revision])
  // A reconnect belongs to the conversation it was pressed in: a switch
  // away leaves its result behind (the id guards every settle).
  const [mcp, setMcp] = useState<{
    id: string
    pending: string | null
    error: { server: string; message: string } | null
  } | null>(null)
  const reconnectMcpServer = useCallback(
    async (server: string) => {
      if (!sessionId) return
      const id = sessionId
      setMcp({ id, pending: server, error: null })
      let error: { server: string; message: string } | null = null
      try {
        // The row updates through the recorded status and the facts
        // broadcast, like every other harness fact (MAR-3206 R3).
        await harnessFactsApi.refreshMcpServers(id, server)
      } catch (failure) {
        error = { server, message: mcpRefusal(failure) }
      }
      setMcp((previous) =>
        previous?.id === id ? { id, pending: null, error } : previous,
      )
    },
    [sessionId],
  )
  /** Read the running process's status again (Details opened); best effort. */
  const refreshMcpServers = useCallback(() => {
    if (sessionId)
      void harnessFactsApi.refreshMcpServers(sessionId, null).catch(() => {})
  }, [sessionId])
  const current = record?.id === sessionId ? record : null
  const mcpCurrent = mcp?.id === sessionId ? mcp : null
  return {
    facts: current?.facts ?? null,
    error: current?.error ?? null,
    loading: !!sessionId && !current,
    retry: () => setRevision((n) => n + 1),
    mcpPending: mcpCurrent?.pending ?? null,
    mcpError: mcpCurrent?.error ?? null,
    reconnectMcpServer,
    refreshMcpServers,
  }
}
