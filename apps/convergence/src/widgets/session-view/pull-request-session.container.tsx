import { useCallback, useEffect, useState } from 'react'
import { pullRequestApi } from '@/entities/pull-request'
import type { SessionPullRequestReading } from '@/shared/types/session-pull-request.types'

export function useSessionPullRequest(sessionId: string | undefined) {
  const [readings, setReadings] = useState<
    Record<string, SessionPullRequestReading>
  >({})
  const [pending, setPending] = useState<string | null>(null)
  const store = useCallback(
    (id: string, reading: SessionPullRequestReading) => {
      setReadings((current) => ({ ...current, [id]: reading }))
    },
    [],
  )
  const refresh = useCallback(async () => {
    if (!sessionId) return
    setPending(sessionId)
    try {
      store(sessionId, await pullRequestApi.refreshForSession(sessionId))
    } catch (error) {
      store(sessionId, failedReading(error))
    } finally {
      setPending((current) => (current === sessionId ? null : current))
    }
  }, [sessionId, store])
  useEffect(() => {
    if (!sessionId) return
    let active = true
    void (async () => {
      try {
        const reading = await pullRequestApi.getForSession(sessionId)
        if (active) store(sessionId, reading)
      } catch (error) {
        if (active) store(sessionId, failedReading(error))
      }
    })()
    return () => {
      active = false
    }
  }, [sessionId, store])
  return {
    reading: sessionId ? (readings[sessionId] ?? null) : null,
    loading: pending === sessionId,
    refresh,
  }
}

function failedReading(error: unknown): SessionPullRequestReading {
  return {
    pullRequest: null,
    branchName: null,
    message: error instanceof Error ? error.message : 'PR unknown',
  }
}
