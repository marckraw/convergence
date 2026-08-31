import { useCallback, useEffect } from 'react'
import type { FC } from 'react'
import {
  providerDebugApi,
  useProviderDebugStore,
  type ProviderDebugEntry,
} from '@/entities/provider-debug'
import { SessionDebugDrawer } from './session-debug-drawer.presentational'

interface SessionDebugDrawerContainerProps {
  sessionId: string
  open: boolean
  onOpenChange: (next: boolean) => void
}

const EMPTY_DEBUG_ENTRIES: ProviderDebugEntry[] = []

export const SessionDebugDrawerContainer: FC<
  SessionDebugDrawerContainerProps
> = ({ sessionId, open, onOpenChange }) => {
  const entries = useProviderDebugStore(
    (s) => s.bySession[sessionId] ?? EMPTY_DEBUG_ENTRIES,
  )
  const hydrate = useProviderDebugStore((s) => s.hydrate)
  const ingest = useProviderDebugStore((s) => s.ingest)
  const drop = useProviderDebugStore((s) => s.drop)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const unsubscribe = providerDebugApi.subscribe(sessionId, (entry) => {
      if (entry.sessionId === sessionId) ingest(entry)
    })
    void providerDebugApi.list(sessionId).then((existing) => {
      if (cancelled) return
      hydrate(sessionId, existing)
    })
    return () => {
      cancelled = true
      unsubscribe()
      drop(sessionId)
    }
  }, [drop, hydrate, ingest, open, sessionId])

  const handleCopyAll = useCallback(() => {
    const payload = entries
      .map((entry) => {
        try {
          return JSON.stringify(entry)
        } catch {
          return '{"error":"unserializable"}'
        }
      })
      .join('\n')
    void navigator.clipboard.writeText(payload).catch(() => {
      // Clipboard access can fail in some embeddings; ignore.
    })
  }, [entries])

  const handleOpenLogFolder = useCallback(() => {
    void providerDebugApi.openFolder()
  }, [])

  return (
    <SessionDebugDrawer
      open={open}
      onOpenChange={onOpenChange}
      sessionId={sessionId}
      entries={entries}
      onCopyAll={handleCopyAll}
      onOpenLogFolder={handleOpenLogFolder}
    />
  )
}
