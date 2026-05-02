import { useCallback, useEffect } from 'react'
import type { FC } from 'react'
import {
  providerDebugApi,
  useProviderDebugStore,
} from '@/entities/provider-debug'
import { SessionDebugDrawer } from './session-debug-drawer.presentational'

interface SessionDebugDrawerContainerProps {
  sessionId: string
  open: boolean
  onOpenChange: (next: boolean) => void
}

export const SessionDebugDrawerContainer: FC<
  SessionDebugDrawerContainerProps
> = ({ sessionId, open, onOpenChange }) => {
  const entries = useProviderDebugStore((s) => s.bySession[sessionId] ?? [])
  const hydrate = useProviderDebugStore((s) => s.hydrate)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void providerDebugApi.list(sessionId).then((existing) => {
      if (cancelled) return
      hydrate(sessionId, existing)
    })
    return () => {
      cancelled = true
    }
  }, [open, sessionId, hydrate])

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
