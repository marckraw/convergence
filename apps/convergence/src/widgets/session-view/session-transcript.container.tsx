import {
  EMPTY_CONVERSATION_PREFIX,
  combineTurnStarts,
  type ConversationPrefix,
} from '@/entities/session'
import { PerfProfiler } from '@/shared/lib/perf-profiler'
import { perfApi } from '@/shared/lib/perf.api'
import type { SessionHarnessFacts } from '@/shared/types/harness-facts.types'
import { placeCompactions } from './harness-facts.pure'
import { CompactionMarker } from './compaction-marker.presentational'
import {
  isSubagentWork,
  parallelWorkRowState,
  type ParallelWorkRow,
} from '@/shared/lib/parallel-work.pure'
import { parallelWorkMarkers } from './parallel-work.pure'
import { ParallelWorkMarkerView } from './parallel-work-marker.presentational'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FC,
  type ReactNode,
} from 'react'
import type {
  ConversationItem as ConversationItemEntry,
  InteractionResponse,
  Session,
} from '@/entities/session'
import { ConversationItem } from './conversation-item.container'
import {
  buildConversationRenderPlan,
  type ConversationRenderEntry,
} from './session-transcript-render-plan.pure'
import {
  fullDisplayRows,
  groupWorkBlocks,
  workBlockLabel,
  workBlockMembership,
  workDisplayRows,
} from './work-blocks.pure'
import { WorkBlockRow } from './work-block.presentational'
import { WORK_BLOCK_MEMBER_CLASS } from './work-block.styles'
import {
  useTranscriptViewMode,
  useTranscriptViewStore,
} from './transcript-view.model'
import { isTranscriptNearBottom } from './session-transcript-scroll.pure'

/**
 * The only session fields the transcript reads (MAR-3310 F1e R2). A summary
 * update that changes none of them does not redraw the transcript; reading
 * another field means adding it here, where the memo boundary compares it.
 */
const TRANSCRIPT_SESSION_FIELDS = [
  'id',
  'status',
  'hasActiveHandle',
  'attention',
  'workingDirectory',
] as const satisfies readonly (keyof Session)[]
type TranscriptSession = Pick<
  Session,
  (typeof TRANSCRIPT_SESSION_FIELDS)[number]
>

interface SessionTranscriptProps {
  compactions?: SessionHarnessFacts['compactions']
  parallelRows?: ParallelWorkRow[]
  parallelLoading?: boolean
  onParallelSelect?: (id: string) => void
  navigationTarget?: { id: string; nonce: number } | null
  session: Session
  conversationPrefix?: ConversationPrefix
  conversationItems: ConversationItemEntry[]
  onApprove: (
    sessionId: string,
    providerApprovalId?: string,
    options?: { scope: 'once' | 'session' },
  ) => void
  onDeny: (sessionId: string, providerApprovalId?: string) => void
  onInputAnswer: (
    sessionId: string,
    response: InteractionResponse,
    displayText: string,
  ) => void
}

const EMPTY_COMPACTIONS: SessionHarnessFacts['compactions'] = []
const EMPTY_PARALLEL_ROWS: ParallelWorkRow[] = []
const TRANSCRIPT_ROW_ESTIMATE_PX = 160
const TRANSCRIPT_OVERSCAN = 6
const itemOfEntry = (entry: ConversationRenderEntry) => entry.item

interface RowActions {
  approve: () => void
  approveSession: () => void
  deny: () => void
  inputAnswer: (response: InteractionResponse, displayText: string) => void
}

/** Full and unfolded rows draw exactly as before; only open members hang. */
const MemberFrame: FC<{ member: boolean; children: ReactNode }> = ({
  member,
  children,
}) =>
  member ? <div className={WORK_BLOCK_MEMBER_CLASS}>{children}</div> : children

/** Inside the boundary only the compared fields can be read. */
type SessionTranscriptContentProps = Omit<SessionTranscriptProps, 'session'> & {
  session: TranscriptSession
}

const SessionTranscriptContent: FC<SessionTranscriptContentProps> = ({
  session,
  compactions = EMPTY_COMPACTIONS,
  parallelRows = EMPTY_PARALLEL_ROWS,
  parallelLoading = false,
  onParallelSelect,
  navigationTarget,
  conversationItems,
  conversationPrefix = EMPTY_CONVERSATION_PREFIX,
  onApprove,
  onDeny,
  onInputAnswer,
}) => {
  const navigatedNonce = useRef<number | null>(null)
  const scrollParentRef = useRef<HTMLDivElement>(null)
  const [scrollParent, setScrollParent] = useState<HTMLDivElement | null>(null)
  const bottomFollowRef = useRef(true)
  const pendingScrollFrameRef = useRef<number | null>(null)
  const previousSessionIdRef = useRef<string | null>(null)
  const [resolvedApprovalIds, setResolvedApprovalIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [resolvedInputIds, setResolvedInputIds] = useState<Set<string>>(
    () => new Set(),
  )
  // R3: a row's handlers are made once per item and call the latest props,
  // so a redraw of the transcript does not redraw an actionable row.
  const latestRef = useRef({
    sessionId: session.id,
    onApprove,
    onDeny,
    onInputAnswer,
  })
  useLayoutEffect(() => {
    latestRef.current = {
      sessionId: session.id,
      onApprove,
      onDeny,
      onInputAnswer,
    }
  })
  const rowActionsRef = useRef(new WeakMap<ConversationItemEntry, RowActions>())
  const rowActions = (entry: ConversationItemEntry): RowActions => {
    const cached = rowActionsRef.current.get(entry)
    if (cached) return cached
    const providerApprovalId = entry.providerMeta.providerItemId ?? undefined
    const resolveApproval = () =>
      setResolvedApprovalIds((current) => new Set([...current, entry.id]))
    const actions: RowActions = {
      approve: () => {
        resolveApproval()
        latestRef.current.onApprove(
          latestRef.current.sessionId,
          providerApprovalId,
        )
      },
      deny: () => {
        resolveApproval()
        latestRef.current.onDeny(
          latestRef.current.sessionId,
          providerApprovalId,
        )
      },
      approveSession: () => {
        resolveApproval()
        latestRef.current.onApprove(
          latestRef.current.sessionId,
          providerApprovalId,
          { scope: 'session' },
        )
      },
      inputAnswer: (response, displayText) => {
        setResolvedInputIds((current) => new Set([...current, entry.id]))
        latestRef.current.onInputAnswer(
          latestRef.current.sessionId,
          entry.kind === 'input-request' && entry.responseProviderItemId
            ? { ...response, providerItemId: entry.responseProviderItemId }
            : response,
          displayText,
        )
      },
    }
    rowActionsRef.current.set(entry, actions)
    return actions
  }

  const turnStartedAtById = useMemo(
    () => combineTurnStarts(conversationPrefix, conversationItems),
    [conversationPrefix, conversationItems],
  )

  const workMarkers = useMemo(
    () =>
      parallelWorkMarkers(
        conversationItems,
        parallelLoading ? [] : parallelRows,
      ),
    [conversationItems, parallelRows, parallelLoading],
  )
  const knownAgentIds = useMemo(
    () =>
      new Set(
        parallelRows
          .filter((row) => row.kind === 'agent')
          .flatMap((row) => parallelWorkRowState(row).ids),
      ),
    [parallelRows],
  )
  const conversationRenderPlan = useMemo(
    () =>
      buildConversationRenderPlan(
        conversationPrefix,
        conversationItems,
        conversationItems.filter(
          (item) =>
            !isSubagentWork(
              item,
              parallelLoading ? undefined : knownAgentIds,
            ) || workMarkers.has(item.id),
        ),
      ),
    [
      conversationPrefix,
      conversationItems,
      workMarkers,
      knownAgentIds,
      parallelLoading,
    ],
  )
  const compactionPlacement = useMemo(
    () =>
      placeCompactions(
        conversationRenderPlan.map((entry) => entry.item),
        compactions,
      ),
    [conversationRenderPlan, compactions],
  )
  const viewMode = useTranscriptViewMode(session.id)
  const openBlocks = useTranscriptViewStore((state) => state.openBlocks)
  const toggleBlock = useTranscriptViewStore((state) => state.toggleBlock)
  const openBlock = useTranscriptViewStore((state) => state.openBlock)
  // MAR-3391 R1: runs of tool items fold by the one rule the sidebar shares.
  // A block never swallows a turn divider or a compaction marker: the entry
  // that carries one starts the next block, and the block's line draws it.
  const workRows = useMemo(
    () =>
      viewMode === 'full'
        ? null
        : groupWorkBlocks(conversationRenderPlan, itemOfEntry, {
            isMarked: (entry) => workMarkers.has(entry.item.id),
            startsNewBlock: (entry) =>
              entry.turnBoundary ||
              compactionPlacement.before.has(entry.item.id),
          }),
    [viewMode, conversationRenderPlan, workMarkers, compactionPlacement],
  )
  const blockOfMember = useMemo(
    () =>
      workRows
        ? workBlockMembership(workRows, itemOfEntry)
        : new Map<string, string>(),
    [workRows],
  )
  const displayRows = useMemo(
    () =>
      workRows
        ? workDisplayRows(workRows, itemOfEntry, (id) => openBlocks.has(id))
        : fullDisplayRows(conversationRenderPlan, itemOfEntry),
    [workRows, openBlocks, conversationRenderPlan],
  )
  // R4: the last row still grows while the conversation runs; the next
  // boundary (the agent speaks, asks, errs) makes it not-last and closes it.
  const lastWorkRow = workRows?.at(-1)
  const workingBlockId =
    session.status === 'running' && lastWorkRow?.kind === 'block'
      ? lastWorkRow.id
      : null
  const actionableApprovalIds = useMemo(() => {
    if (
      session.status !== 'running' &&
      session.status !== 'answered' &&
      session.status !== 'completed'
    ) {
      return new Set<string>()
    }

    const ids = new Set<string>()
    for (const entry of conversationRenderPlan) {
      if (
        entry.item.kind === 'approval-request' &&
        (entry.item.resolution === 'pending'
          ? session.hasActiveHandle === true
          : entry.item.resolution === undefined &&
            session.status === 'running' &&
            session.attention === 'needs-approval') &&
        !resolvedApprovalIds.has(entry.item.id)
      ) {
        ids.add(entry.item.id)
      }
    }
    return ids
  }, [
    conversationRenderPlan,
    resolvedApprovalIds,
    session.attention,
    session.hasActiveHandle,
    session.status,
  ])
  const actionableInputIds = useMemo(() => {
    if (
      session.status !== 'running' &&
      session.status !== 'answered' &&
      session.status !== 'completed'
    ) {
      return new Set<string>()
    }

    const ids = new Set<string>()
    for (const entry of conversationRenderPlan) {
      if (
        entry.item.kind === 'input-request' &&
        (entry.item.resolution === 'pending'
          ? session.hasActiveHandle === true
          : entry.item.resolution === undefined &&
            session.status === 'running' &&
            session.attention === 'needs-input') &&
        (entry.item.request?.kind === 'choice' ||
          entry.item.request?.kind === 'plan' ||
          entry.item.request?.kind === 'form' ||
          entry.item.request?.kind === 'url') &&
        !resolvedInputIds.has(entry.item.id)
      ) {
        ids.add(entry.item.id)
      }
    }
    return ids
  }, [
    conversationRenderPlan,
    resolvedInputIds,
    session.attention,
    session.hasActiveHandle,
    session.status,
  ])

  useEffect(() => {
    setResolvedApprovalIds(new Set())
    setResolvedInputIds(new Set())
  }, [session.id])

  useEffect(() => {
    if (session.attention !== 'needs-approval') {
      setResolvedApprovalIds(new Set())
    }
  }, [session.attention])

  useEffect(() => {
    if (session.attention !== 'needs-input') {
      setResolvedInputIds(new Set())
    }
  }, [session.attention])

  // R2: a new getItemKey drops every measurement, so it changes only with
  // the rows themselves.
  const getItemKey = useCallback(
    (index: number) => displayRows[index]?.key ?? index,
    [displayRows],
  )
  const rowVirtualizer = useVirtualizer({
    count: displayRows.length,
    getScrollElement: () => scrollParent,
    estimateSize: () => TRANSCRIPT_ROW_ESTIMATE_PX,
    getItemKey,
    overscan: TRANSCRIPT_OVERSCAN,
    enabled: scrollParent !== null,
    initialRect: {
      width: 0,
      height: 800,
    },
  })

  useEffect(() => {
    if (!navigationTarget || navigatedNonce.current === navigationTarget.nonce)
      return
    const index = displayRows.findIndex(
      (row) =>
        row.kind !== 'block' && row.entry.item.id === navigationTarget.id,
    )
    const blockId =
      index < 0 ? blockOfMember.get(navigationTarget.id) : undefined
    if (index < 0 && !blockId) {
      // MAR-3310 F1e R7: a jump that cannot land is dropped, and it leaves
      // the scroll where it was; a reply streaming below keeps following.
      navigatedNonce.current = navigationTarget.nonce
      return
    }
    // The jump owns the scroll: bottom-follow stops and a queued
    // scroll-to-latest frame is dropped, or it fires after the jump and wins.
    bottomFollowRef.current = false
    if (pendingScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(pendingScrollFrameRef.current)
      pendingScrollFrameRef.current = null
    }
    if (blockId) {
      // R6: a jump into a folded block opens it; the rows it adds bring this
      // effect back, and the second pass lands on the item itself.
      openBlock(blockId)
      return
    }
    navigatedNonce.current = navigationTarget.nonce
    rowVirtualizer.scrollToIndex(index, { align: 'center' })
  }, [navigationTarget, displayRows, blockOfMember, openBlock, rowVirtualizer])

  const scrollToLatest = useCallback(() => {
    if (displayRows.length === 0) return

    if (pendingScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(pendingScrollFrameRef.current)
    }

    pendingScrollFrameRef.current = window.requestAnimationFrame(() => {
      pendingScrollFrameRef.current = null
      rowVirtualizer.scrollToIndex(displayRows.length - 1, {
        align: 'end',
      })
    })
  }, [displayRows.length, rowVirtualizer])

  const updateBottomFollow = useCallback(() => {
    const scrollParent = scrollParentRef.current
    if (!scrollParent) return

    const nearBottom = isTranscriptNearBottom({
      scrollHeight: scrollParent.scrollHeight,
      scrollTop: scrollParent.scrollTop,
      clientHeight: scrollParent.clientHeight,
    })
    bottomFollowRef.current = nearBottom
  }, [])

  const handleScrollParentRef = useCallback((node: HTMLDivElement | null) => {
    scrollParentRef.current = node
    setScrollParent(node)
  }, [])

  const measureRow = useCallback(
    (node: HTMLDivElement | null) => {
      rowVirtualizer.measureElement(node)
    },
    [rowVirtualizer],
  )

  const totalSize = rowVirtualizer.getTotalSize()
  const lastCompactionSequence = compactions.at(-1)?.sequence
  useLayoutEffect(() => {
    const sessionChanged = previousSessionIdRef.current !== session.id
    previousSessionIdRef.current = session.id

    if (sessionChanged) {
      bottomFollowRef.current = true
    }

    if (sessionChanged || bottomFollowRef.current) {
      scrollToLatest()
    }
  }, [
    session.id,
    totalSize,
    compactions.length,
    lastCompactionSequence,
    scrollToLatest,
  ])

  useLayoutEffect(
    () => () => {
      if (pendingScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(pendingScrollFrameRef.current)
      }
    },
    [],
  )

  const virtualItems = rowVirtualizer.getVirtualItems()

  const renderDecorations = (renderEntry: ConversationRenderEntry) => (
    <>
      {compactionPlacement.before.get(renderEntry.item.id)?.map((fact) => (
        <CompactionMarker key={fact.sequence} fact={fact} />
      ))}
      {renderEntry.turnBoundary && (
        <div
          className="my-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground"
          data-turn-id={renderEntry.item.turnId}
        >
          <span className="h-px flex-1 bg-border" />
          <span className="font-mono">Turn {renderEntry.turnSequence}</span>
          <span className="h-px flex-1 bg-border" />
        </div>
      )}
    </>
  )

  return (
    <div
      ref={handleScrollParentRef}
      className="app-scrollbar flex-1 overflow-y-auto px-4"
      data-testid="session-transcript-scroll-region"
      onScroll={updateBottomFollow}
    >
      <div className="mx-auto max-w-2xl py-4">
        <div
          className="relative w-full"
          style={{ height: rowVirtualizer.getTotalSize() }}
        >
          {virtualItems.map((virtualItem) => {
            const row = displayRows[virtualItem.index]
            if (!row) return null

            if (row.kind === 'block') {
              const first = row.members[0]!
              return (
                <div
                  key={virtualItem.key}
                  ref={measureRow}
                  data-index={virtualItem.index}
                  data-testid="session-transcript-row"
                  data-work-block-id={row.id}
                  className="absolute top-0 left-0 w-full rounded-md transition-colors"
                  style={{
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  {renderDecorations(first)}
                  <WorkBlockRow
                    label={workBlockLabel(row.members.map(itemOfEntry), {
                      working: row.id === workingBlockId,
                      root: session.workingDirectory,
                    })}
                    memberCount={row.members.length}
                    open={row.open}
                    working={row.id === workingBlockId}
                    onToggle={() => toggleBlock(row.id)}
                  />
                </div>
              )
            }

            const renderEntry = row.entry
            const entry = renderEntry.item
            const workMarker = workMarkers.get(entry.id)
            const isActionableApproval =
              entry.kind === 'approval-request' &&
              actionableApprovalIds.has(entry.id)
            const isActionableInput =
              entry.kind === 'input-request' && actionableInputIds.has(entry.id)

            return (
              <div
                key={virtualItem.key}
                ref={measureRow}
                data-index={virtualItem.index}
                data-testid="session-transcript-row"
                data-conversation-item-id={entry.id}
                data-work-block-member={
                  row.kind === 'member' ? row.blockId : undefined
                }
                className="absolute top-0 left-0 w-full rounded-md transition-colors"
                style={{
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                <MemberFrame member={row.kind === 'member'}>
                  {/* An open block's line already drew what sits above it. */}
                  {row.kind === 'entry' && renderDecorations(renderEntry)}
                  {isSubagentWork(entry) &&
                    !knownAgentIds.has(entry.agentRunId!) &&
                    entry.kind !== 'tool-call' && (
                      <div className="mb-1 truncate text-xs text-muted-foreground">
                        {entry.agentAttribution?.description?.trim()
                          ? `↳ ${entry.agentAttribution.description} (${entry.agentAttribution.agentType ?? 'unknown'})`
                          : '↳ subagent'}
                      </div>
                    )}
                  {workMarker && (
                    <ParallelWorkMarkerView
                      marker={workMarker}
                      onSelect={(id) => onParallelSelect?.(id)}
                    />
                  )}
                  {!workMarker?.replace && (
                    <ConversationItem
                      entry={entry}
                      sessionId={session.id}
                      injectedContextText={renderEntry.injectedContextText}
                      turnStartedAt={
                        entry.turnId
                          ? (turnStartedAtById.get(entry.turnId) ?? null)
                          : null
                      }
                      onApprove={
                        isActionableApproval
                          ? rowActions(entry).approve
                          : undefined
                      }
                      onDeny={
                        isActionableApproval
                          ? rowActions(entry).deny
                          : undefined
                      }
                      onApproveSession={
                        isActionableApproval
                          ? rowActions(entry).approveSession
                          : undefined
                      }
                      onInputAnswer={
                        isActionableInput
                          ? rowActions(entry).inputAnswer
                          : undefined
                      }
                    />
                  )}
                </MemberFrame>
              </div>
            )
          })}
        </div>
        {compactionPlacement.tail.map((fact) => (
          <CompactionMarker key={fact.sequence} fact={fact} />
        ))}
      </div>
    </div>
  )
}

/**
 * R2: every prop by identity, and the session by the fields the transcript
 * reads, so a summary update that changes none of them makes no commit.
 */
function sameTranscriptProps(
  previous: Readonly<SessionTranscriptProps>,
  next: Readonly<SessionTranscriptProps>,
): boolean {
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)])
  for (const key of keys) {
    if (key === 'session') continue
    const name = key as keyof SessionTranscriptProps
    if (!Object.is(previous[name], next[name])) return false
  }
  return TRANSCRIPT_SESSION_FIELDS.every((field) =>
    Object.is(previous.session[field], next.session[field]),
  )
}

// The preload flag is immutable; off keeps the original component boundary.
export const SessionTranscript = memo<SessionTranscriptProps>(
  perfApi.isEnabled()
    ? (props) => (
        <PerfProfiler id="transcript">
          <SessionTranscriptContent {...props} />
        </PerfProfiler>
      )
    : SessionTranscriptContent,
  sameTranscriptProps,
)
