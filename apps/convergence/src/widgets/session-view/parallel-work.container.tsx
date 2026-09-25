import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FC,
  type RefObject,
} from 'react'
import type { ConversationItem as Item, Session } from '@/entities/session'
import {
  parallelWorkRowState,
  type ParallelWorkRow,
} from '@/shared/lib/parallel-work.pure'
import { useElementWidth } from '@/shared/hooks/use-element-width'
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
  parallelWorkDetailItems,
  parallelWorkMarkers,
  workRowKey,
  workTitle,
  parallelWorkRefusal,
  withFetchedWorkItems,
} from './parallel-work.pure'
import {
  MIN_CONVERSATION_WIDTH,
  PARALLEL_WORK_PANEL_WIDTH,
  parallelDockMode,
} from './parallel-work-dock.pure'
import {
  useParallelWorkDetail,
  useParallelWorkResults,
} from './use-parallel-work'
import {
  fullDisplayRows,
  groupWorkBlocks,
  workBlockLabel,
  workDisplayRows,
} from '@/entities/session'
import { WorkBlockRow } from './work-block.presentational'
import { WORK_BLOCK_MEMBER_CLASS } from './work-block.styles'
import {
  useTranscriptViewMode,
  useTranscriptViewStore,
} from './transcript-view.model'

const itemOf = (item: Item) => item
/**
 * Radix calls the overlay's close-focus on a later task, and also when the
 * instance unmounts rather than closes -- a conversation switch remounts this
 * panel by key, and by then the next conversation may already hold focus.
 * Focus goes back to the invoker only when nothing holds it (MAR-3426 lap 2).
 */
const focusIsLost = () => {
  const active = document.activeElement
  return active === null || active === document.body || !active.isConnected
}

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
  /** The session view's root row: the conversation's own space (MAR-3426). */
  rowRef: RefObject<HTMLElement | null>
  /** Widths of the other panels docked in that row right now (0 = closed). */
  otherDockedWidths: readonly number[]
  /**
   * Put focus back where the panel was opened from. The overlay calls it once
   * its focus trap is gone: a focus made while the trap is still mounted is
   * pulled back inside the dialog and lost with it (MAR-3426 R3). It is not
   * called when something else already holds focus (see `focusIsLost`).
   */
  onReturnFocus: () => void
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
  rowRef,
  otherDockedWidths,
  onReturnFocus,
}) => {
  const [olderOpen, setOlderOpen] = useState(false)
  const viewMode = useTranscriptViewMode(session.id)
  const openBlocks = useTranscriptViewStore((state) => state.openBlocks)
  const toggleBlock = useTranscriptViewStore((state) => state.toggleBlock)
  useEffect(() => setOlderOpen(false), [open, session.id])
  const [collapsed, setCollapsed] = useState(new Set<string>())
  const [stopStates, setStopStates] = useState(
    new Map<string, { pending?: boolean; error?: string }>(),
  )
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [details, setDetails] = useState(false)
  const [highlightedId, setHighlightedId] = useState(selectedId)
  const [now, setNow] = useState(Date.now())
  // MAR-3426 CH2: dock only while the conversation keeps a usable width in
  // its own row. The mode -- never the width -- is state, so a resize that
  // stays on one side of the bound renders nothing here or above.
  const overlay =
    useElementWidth(rowRef, (rowWidth) =>
      rowWidth === null
        ? 'overlay'
        : parallelDockMode({
            rowWidth,
            panelWidth: PARALLEL_WORK_PANEL_WIDTH,
            otherDockedWidths,
            minConversationWidth: MIN_CONVERSATION_WIDTH,
          }),
    ) === 'overlay'
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
    if (!open) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(timer)
  }, [open])
  useEffect(() => {
    setCollapsed((current) => {
      const next = new Set(current)
      const visited = new Set<string>()
      // `parentId` names a run id, so each ancestor is the AGENT row with that
      // id -- never a task row that happens to share it (MAR-2902). The keys
      // removed from `collapsed` are row keys, which is what the panel reads.
      const ancestor = (id: string) =>
        rows.find((row) => row.kind === 'agent' && row.id === id)
      let parent = rows.find((row) => workRowKey(row) === selectedId)?.parentId
      while (parent && !visited.has(parent)) {
        visited.add(parent)
        const row = ancestor(parent)
        if (row) next.delete(workRowKey(row))
        parent = row?.parentId
      }
      return next
    })
  }, [selectedId, rows])
  useEffect(() => {
    setStopStates(
      (current) =>
        new Map(
          [...current].filter(([key, state]) =>
            rows.some(
              (row) =>
                workRowKey(row) === key &&
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
  }, [scrollKey, open, overlay])
  const select = (id: string | null) => {
    saveScroll()
    setDetails(false)
    onSelect(id)
  }
  const selected = rows.find((row) => workRowKey(row) === selectedId)
  const confirm = rows.find((row) => workRowKey(row) === confirmId)
  // MAR-3310 O0b: the selected row's items come from main by id, so its
  // transcript, "View result" and pending decision do not depend on how much
  // of the conversation is loaded. The loaded copy of an item wins; on a fully
  // loaded conversation `panelItems` IS `items`.
  const detail = useParallelWorkDetail(session.id, open ? selected : undefined)
  const results = useParallelWorkResults(session.id, rows, open)
  // Pins are sequence-sorted. pendingAgentDecision keeps its existing stricter
  // contract: oldest explicit 'pending'; absent resolutions remain transcript-only.
  const panelItems = useMemo(
    () =>
      withFetchedWorkItems(
        withFetchedWorkItems(items, detail.items),
        results.items,
      ),
    [items, detail.items, results.items],
  )
  const visibleItems = selected
    ? parallelWorkDetailItems(panelItems, selected)
    : []
  // One scan per item/row revision, shared by the fold rule and "View result".
  const markers = useMemo(
    () => parallelWorkMarkers(panelItems, rows),
    [panelItems, rows],
  )
  // MAR-3391 R7: the sidebar folds by the transcript's own rule and follows
  // the conversation's Compact/Full choice. A marked entry is a boundary here
  // exactly as it is in the transcript (R1).
  const workRows =
    viewMode === 'full'
      ? null
      : groupWorkBlocks(visibleItems, itemOf, {
          isMarked: (item) => markers.has(item.id),
        })
  const transcriptRows = workRows
    ? workDisplayRows(workRows, itemOf, (id) => openBlocks.has(id))
    : fullDisplayRows(visibleItems, itemOf)
  const lastWorkRow = workRows?.at(-1)
  const workingBlockId =
    selected &&
    parallelWorkRowState(selected).fact?.status === 'running' &&
    lastWorkRow?.kind === 'block'
      ? lastWorkRow.id
      : null
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
      {detail.error && (
        <p role="alert" className="text-xs text-red-500">
          Could not read the earlier part of this work: {detail.error}
        </p>
      )}
      {transcriptRows.map((row) =>
        row.kind === 'block' ? (
          <WorkBlockRow
            key={row.key}
            label={workBlockLabel(row.members, {
              working: row.id === workingBlockId,
              root: session.workingDirectory,
            })}
            memberCount={row.members.length}
            open={row.open}
            working={row.id === workingBlockId}
            onToggle={() => toggleBlock(row.id)}
          />
        ) : row.kind === 'member' ? (
          <div key={row.key} className={WORK_BLOCK_MEMBER_CLASS}>
            <ConversationItem entry={row.entry} sessionId={session.id} />
          </div>
        ) : (
          <ConversationItem
            key={row.key}
            entry={row.entry}
            sessionId={session.id}
          />
        ),
      )}
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
  /**
   * Where each row's result landed in the transcript, keyed by row key so the
   * panel's "View result" reads the same identity every other per-row surface
   * does (MAR-2902).
   *
   * Two sources, and the marker wins: a return marker already names its row,
   * while a terminal task note carries only the harness's task id and has to
   * be matched against each row's evidence ids.
   */
  const resultItems = useMemo(() => {
    const byRowKey = new Map(
      [...markers]
        .filter(([, marker]) => marker.label.startsWith('Result returned'))
        .map(([itemId, marker]) => [marker.rowKey, itemId]),
    )
    const byTaskId = new Map<string, string>()
    for (const item of panelItems) {
      if (
        item.kind === 'note' &&
        item.taskId &&
        item.providerMeta.providerEventType === 'harness.task.terminal' &&
        !byTaskId.has(item.taskId)
      )
        byTaskId.set(item.taskId, item.id)
    }
    for (const row of rows) {
      const key = workRowKey(row)
      if (byRowKey.has(key)) continue
      const itemId = parallelWorkRowState(row)
        .ids.map((id) => byTaskId.get(id))
        .find(Boolean)
      if (itemId) byRowKey.set(key, itemId)
    }
    return byRowKey
  }, [panelItems, rows, markers])
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
      {(error || results.error) && (
        <p role="alert" className="p-5 text-xs text-red-500">
          Could not read parallel work: {error ?? results.error}
        </p>
      )}
      <ParallelWorkPanel
        olderOpen={olderOpen}
        onToggleOlder={() => setOlderOpen((current) => !current)}
        showEmpty={!loading && !error}
        highlightedId={selectedId ?? highlightedId}
        rows={rows}
        items={panelItems}
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
          if (overlay) close()
          onNavigate(id)
        }}
        onSpawn={(id) => {
          if (overlay) close()
          onNavigate(id)
        }}
        onResult={(id) => {
          const itemId = resultItems.get(id)
          if (itemId) {
            if (overlay) close()
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
      {overlay ? (
        <Dialog
          open={open}
          onOpenChange={(value) => {
            if (!value) close()
          }}
        >
          <DialogContent
            onCloseAutoFocus={(event) => {
              event.preventDefault()
              if (focusIsLost()) onReturnFocus()
            }}
            className="left-auto right-0 top-0 h-full max-h-none w-[min(420px,100vw)] translate-x-0 translate-y-0 rounded-none p-0 [&>button]:hidden"
            aria-describedby={undefined}
          >
            <DialogTitle className="sr-only">Parallel work</DialogTitle>
            {panel}
          </DialogContent>
        </Dialog>
      ) : (
        open && (
          <div
            className="h-full shrink-0 border-l"
            style={{ width: PARALLEL_WORK_PANEL_WIDTH }}
          >
            {panel}
          </div>
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
