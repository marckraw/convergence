import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FC } from 'react'
import { turnsApi } from '@/entities/turn'
import type { Turn, TurnFileChange } from '@/entities/turn'
import { TurnCard } from './turn-card.presentational'
import { PierreDiffViewer } from './pierre-diff-viewer.container'
import { describeTurnFileChange } from './turn-file-change-notice.pure'
import { TurnFileChangeNotices } from './turn-file-change-notice.presentational'
import {
  buildTurnFileChangeRows,
  findTurnFileChangeRowForSelection,
  type TurnFileChangeRow,
} from './turn-file-change-rows.pure'

interface TurnListProps {
  sessionId: string
}

/**
 * A turn, a repository, a path. The repository is part of it since MAR-2589:
 * two repositories of one workspace can each change `README.md` in one turn,
 * and the path alone cannot say which diff the user asked for.
 */
interface Selection {
  turnId: string
  repoRoot: string | null
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
  const diffRequestIdRef = useRef(0)

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
      diffRequestIdRef.current += 1
      setDiff('')
      setDiffLoading(false)
      return
    }
    let cancelled = false
    const requestId = diffRequestIdRef.current + 1
    diffRequestIdRef.current = requestId
    setDiff('')
    setDiffLoading(true)
    void (async () => {
      try {
        const result = await turnsApi.getFileDiff(
          selection.turnId,
          selection.filePath,
          selection.repoRoot,
        )
        if (cancelled || diffRequestIdRef.current !== requestId) return
        setDiff(result || '(no diff available)')
      } catch {
        if (cancelled || diffRequestIdRef.current !== requestId) return
        setDiff('Failed to load diff.')
      } finally {
        if (!cancelled && diffRequestIdRef.current === requestId) {
          setDiffLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selection])

  const handleToggle = useCallback((turnId: string) => {
    setExpanded((prev) => ({ ...prev, [turnId]: !prev[turnId] }))
  }, [])

  const handleSelectFile = useCallback(
    (turnId: string, row: TurnFileChangeRow | null) => {
      setSelection((current) => {
        if (!row) return null
        if (
          current?.turnId === turnId &&
          current.repoRoot === row.repoRoot &&
          current.filePath === row.filePath
        ) {
          return current
        }
        return { turnId, repoRoot: row.repoRoot, filePath: row.filePath }
      })
    },
    [],
  )

  const ordered = useMemo(
    () => [...turns].sort((a, b) => b.sequence - a.sequence),
    [turns],
  )

  // Built once per turn rather than inside each card: the repository prefix a
  // row shows depends on how many repositories the whole turn spans, so the
  // rows are a property of the turn, not of any one change.
  const rowsByTurn = useMemo(() => {
    const next: Record<string, TurnFileChangeRow[]> = {}
    for (const [turnId, changes] of Object.entries(fileChangesByTurn)) {
      next[turnId] = buildTurnFileChangeRows(changes)
    }
    return next
  }, [fileChangesByTurn])

  const selectedRow = useMemo(
    () =>
      selection
        ? findTurnFileChangeRowForSelection(
            rowsByTurn[selection.turnId] ?? [],
            selection,
          )
        : null,
    [selection, rowsByTurn],
  )

  // Read from the record rather than from the diff text: a fragment and a whole
  // change look identical in the viewer, and only the flags know which this is
  // (MAR-2577).
  const selectedChange = useMemo(() => {
    if (!selection) return null
    return (
      fileChangesByTurn[selection.turnId]?.find(
        (change) =>
          change.repoRoot === selection.repoRoot &&
          change.filePath === selection.filePath,
      ) ?? null
    )
  }, [selection, fileChangesByTurn])
  const notices = useMemo(
    () => describeTurnFileChange(selectedChange),
    [selectedChange],
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
                fileRows={rowsByTurn[turn.id] ?? []}
                expanded={expanded[turn.id] ?? false}
                selectedTreePath={
                  selection && selection.turnId === turn.id
                    ? (selectedRow?.treePath ?? null)
                    : null
                }
                onToggle={() => handleToggle(turn.id)}
                onSelectFile={(row) => handleSelectFile(turn.id, row)}
              />
            ))}
          </div>
        )}
      </div>
      <div className="flex min-h-0 flex-[1.2] flex-col border-t border-border">
        <TurnFileChangeNotices notices={notices} />
        <div className="min-h-0 flex-1">
          <PierreDiffViewer
            file={selectedRow?.treePath ?? selection?.filePath ?? null}
            diff={diff}
            loading={diffLoading}
            emptyMessage="Select a changed file from a turn to inspect its diff."
            title="Turn diff"
          />
        </div>
      </div>
    </div>
  )
}
