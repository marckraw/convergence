import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FC } from 'react'
import { turnsApi } from '@/entities/turn'
import type { Turn, TurnFileChange } from '@/entities/turn'
import { TurnCard } from './turn-card.presentational'
import { DiffViewer } from './diff-viewer.presentational'

interface TurnListProps {
  sessionId: string
}

interface Selection {
  turnId: string
  filePath: string
}

export const TurnList: FC<TurnListProps> = ({ sessionId }) => {
  const [turns, setTurns] = useState<Turn[]>([])
  const [fileChangesByTurn, setFileChangesByTurn] = useState<
    Record<string, TurnFileChange[]>
  >({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [selection, setSelection] = useState<Selection | null>(null)
  const [diff, setDiff] = useState<string>('')
  const [diffLoading, setDiffLoading] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void (async () => {
      const loaded = await turnsApi.listForSession(sessionId)
      if (cancelled) return
      setTurns(loaded)
      const changes = await Promise.all(
        loaded.map(async (turn) => [
          turn.id,
          await turnsApi.getFileChanges(turn.id),
        ]),
      )
      if (cancelled) return
      setFileChangesByTurn(Object.fromEntries(changes))
      setExpanded((prev) => {
        const next = { ...prev }
        if (loaded.length > 0 && next[loaded[loaded.length - 1].id] !== false) {
          next[loaded[loaded.length - 1].id] = true
        }
        return next
      })
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [sessionId])

  useEffect(() => {
    const unsubscribe = turnsApi.onTurnDelta((delta) => {
      if (delta.sessionId !== sessionId) return
      if (delta.kind === 'turn.add') {
        setTurns((prev) => {
          if (prev.some((t) => t.id === delta.turn.id)) {
            return prev.map((t) => (t.id === delta.turn.id ? delta.turn : t))
          }
          return [...prev, delta.turn]
        })
        setExpanded((prev) => ({ ...prev, [delta.turn.id]: true }))
        return
      }
      if (delta.kind === 'turn.fileChanges.add') {
        setFileChangesByTurn((prev) => ({
          ...prev,
          [delta.turnId]: delta.fileChanges,
        }))
      }
    })
    return unsubscribe
  }, [sessionId])

  useEffect(() => {
    if (!selection) {
      setDiff('')
      return
    }
    let cancelled = false
    setDiffLoading(true)
    void (async () => {
      const result = await turnsApi.getFileDiff(
        selection.turnId,
        selection.filePath,
      )
      if (cancelled) return
      setDiff(result || '(no diff available)')
      setDiffLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [selection])

  const handleToggle = useCallback((turnId: string) => {
    setExpanded((prev) => ({ ...prev, [turnId]: !prev[turnId] }))
  }, [])

  const handleSelectFile = useCallback((turnId: string, filePath: string) => {
    setSelection((current) => {
      if (
        current &&
        current.turnId === turnId &&
        current.filePath === filePath
      ) {
        return null
      }
      return { turnId, filePath }
    })
  }, [])

  const ordered = useMemo(
    () => [...turns].sort((a, b) => b.sequence - a.sequence),
    [turns],
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-hidden">
        {loading && turns.length === 0 ? (
          <div className="p-3 text-xs text-muted-foreground">
            Loading turns…
          </div>
        ) : turns.length === 0 ? (
          <div className="p-3">
            <p className="text-xs text-muted-foreground">
              No turns yet. Changes will appear as the agent works.
            </p>
          </div>
        ) : (
          <div className="app-scrollbar h-full overflow-y-auto">
            {ordered.map((turn) => (
              <TurnCard
                key={turn.id}
                turn={turn}
                fileChanges={fileChangesByTurn[turn.id] ?? []}
                expanded={expanded[turn.id] ?? false}
                selectedFilePath={
                  selection && selection.turnId === turn.id
                    ? selection.filePath
                    : null
                }
                onToggle={() => handleToggle(turn.id)}
                onSelectFile={(filePath) => handleSelectFile(turn.id, filePath)}
              />
            ))}
          </div>
        )}
      </div>
      <div className="min-h-0 flex-[1.2] border-t border-border">
        <DiffViewer
          file={selection?.filePath ?? null}
          diff={diff}
          loading={diffLoading}
        />
      </div>
    </div>
  )
}
