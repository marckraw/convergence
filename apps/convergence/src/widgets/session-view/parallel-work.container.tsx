import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FC,
} from 'react'
import type { ConversationItem as Item, Session } from '@/entities/session'
import {
  isSubagentWork,
  parallelWorkRowState,
  type ParallelWorkRow,
} from '@/shared/lib/parallel-work.pure'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/shared/ui/dialog'
import { ConversationItem } from './conversation-item.container'
import { ParallelWorkPanel } from './parallel-work.presentational'
import { parallelWorkApi } from './parallel-work.api'
import {
  parallelWorkMarkers,
  workTitle,
  parallelWorkRefusal,
} from './parallel-work.pure'

interface Props {
  session: Session
  rows: ParallelWorkRow[]
  items: Item[]
  open: boolean
  selectedId: string | null
  onSelect: (id: string | null) => void
  onClose: () => void
  onNavigate: (id: string) => void
  loading: boolean
  error: string | null
}

export const ParallelWork: FC<Props> = ({
  session,
  rows,
  items,
  open,
  selectedId,
  onSelect,
  onClose,
  onNavigate,
  loading,
  error,
}) => {
  const [collapsed, setCollapsed] = useState(new Set<string>())
  const [stopStates, setStopStates] = useState(
    new Map<string, { pending?: boolean; error?: string }>(),
  )
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [details, setDetails] = useState(false)
  const [highlightedId, setHighlightedId] = useState(selectedId)
  const [now, setNow] = useState(Date.now())
  const [narrow, setNarrow] = useState(
    () =>
      typeof matchMedia === 'function' &&
      matchMedia('(max-width: 1100px)').matches,
  )
  const host = useRef<HTMLDivElement>(null)
  const scrollPositions = useRef(new Map<string, number>())
  const scrollKey = selectedId ?? 'list'
  const previousScrollKey = useRef(scrollKey)
  const saveScroll = () => {
    const scroll = host.current?.querySelector('[data-parallel-scroll]')
    if (scroll)
      scrollPositions.current.set(previousScrollKey.current, scroll.scrollTop)
  }
  const close = () => {
    saveScroll()
    onClose()
  }
  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const query = matchMedia('(max-width: 1100px)')
    const update = () => setNarrow(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    if (
      !open ||
      !rows.some((row) => parallelWorkRowState(row).fact?.status === 'running')
    )
      return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [open, rows])
  useEffect(() => {
    setCollapsed((current) => {
      const next = new Set(current)
      const visited = new Set<string>()
      let parent = rows.find((row) => row.id === selectedId)?.parentId
      while (parent && !visited.has(parent)) {
        visited.add(parent)
        next.delete(parent)
        parent = rows.find((row) => row.id === parent)?.parentId
      }
      return next
    })
  }, [selectedId, rows])
  useEffect(() => {
    setStopStates(
      (current) =>
        new Map(
          [...current].filter(([id, state]) =>
            rows.some(
              (row) =>
                row.id === id &&
                (state.error ||
                  parallelWorkRowState(row).fact?.status === 'running'),
            ),
          ),
        ),
    )
  }, [rows])
  useLayoutEffect(() => {
    const scroll = host.current?.querySelector('[data-parallel-scroll]')
    if (scroll) scroll.scrollTop = scrollPositions.current.get(scrollKey) ?? 0
    previousScrollKey.current = scrollKey
  }, [scrollKey, open, narrow])
  const select = (id: string | null) => {
    saveScroll()
    setDetails(false)
    onSelect(id)
  }
  const selected = rows.find((row) => row.id === selectedId)
  const confirm = rows.find((row) => row.id === confirmId)
  const visibleItems = selected
    ? items.filter((item) =>
        selected.kind === 'agent'
          ? parallelWorkRowState(selected).ids.includes(
              item.agentRunId ?? '',
            ) && isSubagentWork(item)
          : parallelWorkRowState(selected).ids.includes(item.taskId ?? '') &&
            ['tool-call', 'tool-result'].includes(item.kind),
      )
    : []
  const transcript = (
    <div className="space-y-2 border-t pt-3">
      <h3 className="text-sm font-medium">
        {selected?.kind === 'agent' ? 'Agent transcript' : 'Task output'}
      </h3>
      {selected?.kind === 'agent' &&
        !visibleItems.some((item) => item.kind === 'message') && (
          <p className="text-xs text-muted-foreground">
            Transcript not available for sessions recorded before this version
          </p>
        )}
      {!visibleItems.length && (
        <p className="text-xs text-muted-foreground">Not reported</p>
      )}
      {visibleItems.map((item) => (
        <ConversationItem key={item.id} entry={item} sessionId={session.id} />
      ))}
    </div>
  )
  const fact = selected ? parallelWorkRowState(selected).fact : undefined
  const detailFields =
    selected && fact
      ? [
          ['Id', selected.id],
          ['Parent', selected.parentId],
          ['Type', selected.run?.agentType ?? selected.task?.taskType],
          ['Description', fact.description],
          ...(selected.run
            ? [
                ['Model', selected.run.model],
                ['Depth', selected.run.depth],
              ]
            : []),
          ['Started', fact.startedAt],
          ['Ended', fact.endedAt],
          ['Usage', selected.run?.usageJson],
          [
            'Transcript source',
            selected.run?.transcriptPath ?? selected.task?.outputFile,
          ],
        ]
      : []
  const resultItems = useMemo(() => {
    const resultItems = new Map(
      [...parallelWorkMarkers(items, rows)]
        .filter(([, marker]) => marker.label.startsWith('Result returned'))
        .map(([itemId, marker]) => [marker.agentId, itemId]),
    )
    for (const item of items) {
      if (
        item.kind === 'note' &&
        item.taskId &&
        item.providerMeta.providerEventType === 'harness.task.terminal' &&
        !resultItems.has(item.taskId)
      )
        resultItems.set(item.taskId, item.id)
    }
    for (const row of rows) {
      const ids = parallelWorkRowState(row).ids
      const itemId = ids.map((id) => resultItems.get(id)).find(Boolean)
      if (itemId) for (const id of ids) resultItems.set(id, itemId)
    }
    return resultItems
  }, [items, rows])
  const panel = (
    <div
      ref={host}
      className="flex h-full min-h-0 flex-col"
      onScrollCapture={(event) => {
        if (
          event.target instanceof HTMLElement &&
          event.target.hasAttribute('data-parallel-scroll')
        )
          scrollPositions.current.set(
            previousScrollKey.current,
            event.target.scrollTop,
          )
      }}
    >
      {loading && (
        <p className="p-5 text-xs text-muted-foreground">
          Loading parallel work…
        </p>
      )}
      {error && (
        <p role="alert" className="p-5 text-xs text-red-500">
          Could not read parallel work: {error}
        </p>
      )}
      <ParallelWorkPanel
        showEmpty={!loading && !error}
        highlightedId={selectedId ?? highlightedId}
        rows={rows}
        items={items}
        now={now}
        selectedId={selectedId}
        collapsed={collapsed}
        stopStates={stopStates}
        canStop={session.canStopTasks}
        resultItems={resultItems}
        onSelect={select}
        onBack={() => {
          setHighlightedId(selectedId)
          select(null)
        }}
        onClose={close}
        onToggle={(id) =>
          setCollapsed((current) => {
            const next = new Set(current)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
          })
        }
        onStop={setConfirmId}
        onDetails={(id) => {
          select(id)
          setDetails(true)
        }}
        onDecision={(id) => {
          if (narrow) close()
          onNavigate(id)
        }}
        onSpawn={(id) => {
          if (narrow) close()
          onNavigate(id)
        }}
        onResult={(id) => {
          const itemId = resultItems.get(id)
          if (itemId) {
            if (narrow) close()
            onNavigate(itemId)
          }
        }}
        transcript={transcript}
        details={
          details ? (
            <dl className="space-y-3 border-t pt-3 text-xs">
              {detailFields.map(([label, value]) => (
                <div key={String(label)}>
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="break-all whitespace-pre-wrap">
                    {value ?? 'Not reported'}
                  </dd>
                </div>
              ))}
            </dl>
          ) : undefined
        }
      />
    </div>
  )
  return (
    <>
      {narrow ? (
        <Dialog
          open={open}
          onOpenChange={(value) => {
            if (!value) close()
          }}
        >
          <DialogContent
            onCloseAutoFocus={(event) => event.preventDefault()}
            className="left-auto right-0 top-0 h-full max-h-none w-[min(420px,100vw)] translate-x-0 translate-y-0 rounded-none p-0 [&>button]:hidden"
            aria-describedby={undefined}
          >
            <DialogTitle className="sr-only">Parallel work</DialogTitle>
            {panel}
          </DialogContent>
        </Dialog>
      ) : (
        open && (
          <div className="h-full w-[420px] shrink-0 border-l">{panel}</div>
        )
      )}
      <Dialog
        open={Boolean(confirm)}
        onOpenChange={(value) => {
          if (!value) setConfirmId(null)
        }}
      >
        <DialogContent className="p-6">
          <DialogTitle>
            Stop {confirm ? workTitle(confirm) : 'task'}?
          </DialogTitle>
          <DialogDescription>
            Only this task receives the stop request. The main conversation
            stays open.
          </DialogDescription>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setConfirmId(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!confirmId || !confirm) return
                const id = confirmId
                setConfirmId(null)
                setStopStates((current) =>
                  new Map(current).set(id, { pending: true }),
                )
                void parallelWorkApi
                  .stop(session.id, parallelWorkRowState(confirm).stopId)
                  .catch((failure) =>
                    setStopStates((current) =>
                      new Map(current).set(id, {
                        error: parallelWorkRefusal(failure),
                      }),
                    ),
                  )
              }}
            >
              Stop task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
