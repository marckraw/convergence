import {
  isSubagentWork,
  type ParallelWorkRow,
} from '@/shared/lib/parallel-work.pure'
import { parallelWorkMarkers } from './parallel-work.pure'
import { ParallelWorkMarkerView } from './parallel-work-marker.presentational'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FC,
} from 'react'
import type {
  ConversationItem as ConversationItemEntry,
  InteractionResponse,
  Session,
} from '@/entities/session'
import { artifactFromConversationItem } from '@/entities/ui-response-artifact'
import { cn } from '@/shared/lib/cn.pure'
import { ConversationItem } from './conversation-item.container'
import { buildConversationRenderPlan } from './session-transcript-render-plan.pure'
import { isTranscriptNearBottom } from './session-transcript-scroll.pure'

interface SessionTranscriptProps {
  parallelRows?: ParallelWorkRow[]
  onParallelSelect?: (id: string) => void
  navigationTarget?: { id: string; nonce: number } | null
  session: Session
  conversationItems: ConversationItemEntry[]
  selectedUiResponseItemId?: string | null
  onUiResponseArtifactSelect?: (conversationItemId: string) => void
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

const EMPTY_PARALLEL_ROWS: ParallelWorkRow[] = []
const TRANSCRIPT_ROW_ESTIMATE_PX = 160
const TRANSCRIPT_OVERSCAN = 6

export const SessionTranscript: FC<SessionTranscriptProps> = ({
  session,
  parallelRows = EMPTY_PARALLEL_ROWS,
  onParallelSelect,
  navigationTarget,
  conversationItems,
  selectedUiResponseItemId = null,
  onUiResponseArtifactSelect,
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

  const turnStartedAtById = useMemo(() => {
    const startedAtById = new Map<string, string>()
    for (const item of conversationItems) {
      if (item.turnId && !startedAtById.has(item.turnId)) {
        startedAtById.set(item.turnId, item.createdAt)
      }
    }
    return startedAtById
  }, [conversationItems])

  const workMarkers = useMemo(
    () => parallelWorkMarkers(conversationItems, parallelRows),
    [conversationItems, parallelRows],
  )
  const conversationRenderPlan = useMemo(
    () =>
      buildConversationRenderPlan(
        conversationItems.filter(
          (item) => !isSubagentWork(item) || workMarkers.has(item.id),
        ),
      ),
    [conversationItems, workMarkers],
  )
  const actionableApprovalIds = useMemo(() => {
    if (session.status !== 'running' && session.status !== 'completed') {
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
    if (session.status !== 'running' && session.status !== 'completed') {
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

  const rowVirtualizer = useVirtualizer({
    count: conversationRenderPlan.length,
    getScrollElement: () => scrollParent,
    estimateSize: () => TRANSCRIPT_ROW_ESTIMATE_PX,
    getItemKey: (index) => conversationRenderPlan[index]?.item.id ?? index,
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
    const index = conversationRenderPlan.findIndex(
      (entry) => entry.item.id === navigationTarget.id,
    )
    if (index < 0) return
    navigatedNonce.current = navigationTarget.nonce
    bottomFollowRef.current = false
    rowVirtualizer.scrollToIndex(index, { align: 'center' })
  }, [navigationTarget, conversationRenderPlan, rowVirtualizer])

  const scrollToLatest = useCallback(() => {
    if (conversationRenderPlan.length === 0) return

    if (pendingScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(pendingScrollFrameRef.current)
    }

    pendingScrollFrameRef.current = window.requestAnimationFrame(() => {
      pendingScrollFrameRef.current = null
      rowVirtualizer.scrollToIndex(conversationRenderPlan.length - 1, {
        align: 'end',
      })
    })
  }, [conversationRenderPlan.length, rowVirtualizer])

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
  useLayoutEffect(() => {
    const sessionChanged = previousSessionIdRef.current !== session.id
    previousSessionIdRef.current = session.id

    if (sessionChanged) {
      bottomFollowRef.current = true
    }

    if (sessionChanged || bottomFollowRef.current) {
      scrollToLatest()
    }
  }, [session.id, totalSize, scrollToLatest])

  useLayoutEffect(
    () => () => {
      if (pendingScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(pendingScrollFrameRef.current)
      }
    },
    [],
  )

  const virtualItems = rowVirtualizer.getVirtualItems()

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
            const renderEntry = conversationRenderPlan[virtualItem.index]
            if (!renderEntry) return null

            const entry = renderEntry.item
            const workMarker = workMarkers.get(entry.id)
            const isActionableApproval =
              entry.kind === 'approval-request' &&
              actionableApprovalIds.has(entry.id)
            const isActionableInput =
              entry.kind === 'input-request' && actionableInputIds.has(entry.id)
            const hasUiResponseArtifact = hasArtifact(entry)
            const isSelectedUiResponseArtifact =
              hasUiResponseArtifact && entry.id === selectedUiResponseItemId

            return (
              <div
                key={virtualItem.key}
                ref={measureRow}
                data-index={virtualItem.index}
                data-testid="session-transcript-row"
                data-conversation-item-id={entry.id}
                data-ui-response-artifact={
                  hasUiResponseArtifact ? true : undefined
                }
                data-selected-ui-response-artifact={
                  isSelectedUiResponseArtifact ? true : undefined
                }
                className={cn(
                  'absolute top-0 left-0 w-full rounded-md transition-colors',
                  hasUiResponseArtifact && 'cursor-pointer',
                  isSelectedUiResponseArtifact && 'bg-muted/20',
                )}
                style={{
                  transform: `translateY(${virtualItem.start}px)`,
                }}
                onClick={
                  hasUiResponseArtifact
                    ? () => onUiResponseArtifactSelect?.(entry.id)
                    : undefined
                }
              >
                {renderEntry.turnBoundary && (
                  <div
                    className="my-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground"
                    data-turn-id={entry.turnId}
                  >
                    <span className="h-px flex-1 bg-border" />
                    <span className="font-mono">
                      Turn {renderEntry.turnSequence}
                    </span>
                    <span className="h-px flex-1 bg-border" />
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
                        ? () => {
                            setResolvedApprovalIds((current) => {
                              const next = new Set(current)
                              next.add(entry.id)
                              return next
                            })
                            onApprove(
                              session.id,
                              entry.providerMeta.providerItemId ?? undefined,
                            )
                          }
                        : undefined
                    }
                    onDeny={
                      isActionableApproval
                        ? () => {
                            setResolvedApprovalIds(
                              (current) => new Set([...current, entry.id]),
                            )
                            onDeny(
                              session.id,
                              entry.providerMeta.providerItemId ?? undefined,
                            )
                          }
                        : undefined
                    }
                    onApproveSession={
                      isActionableApproval
                        ? () => {
                            setResolvedApprovalIds((current) => {
                              const next = new Set(current)
                              next.add(entry.id)
                              return next
                            })
                            onApprove(
                              session.id,
                              entry.providerMeta.providerItemId ?? undefined,
                              { scope: 'session' },
                            )
                          }
                        : undefined
                    }
                    onInputAnswer={
                      isActionableInput
                        ? (response, displayText) => {
                            setResolvedInputIds((current) => {
                              const next = new Set(current)
                              next.add(entry.id)
                              return next
                            })
                            onInputAnswer(
                              session.id,
                              entry.kind === 'input-request' &&
                                entry.responseProviderItemId
                                ? {
                                    ...response,
                                    providerItemId:
                                      entry.responseProviderItemId,
                                  }
                                : response,
                              displayText,
                            )
                          }
                        : undefined
                    }
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function hasArtifact(item: ConversationItemEntry): boolean {
  if (item.kind !== 'message' || item.actor !== 'assistant') {
    return false
  }

  return (
    artifactFromConversationItem({
      sessionId: item.sessionId,
      conversationItemId: item.id,
      text: item.text,
      createdAt: item.createdAt,
    }) !== null
  )
}
