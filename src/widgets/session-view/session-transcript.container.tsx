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
import type { SessionHtmlOutput } from '@/entities/session-html-output'
import { artifactFromConversationItem } from '@/entities/ui-response-artifact'
import { cn } from '@/shared/lib/cn.pure'
import { ConversationItem } from './conversation-item.container'
import { buildConversationRenderPlan } from './session-transcript-render-plan.pure'
import { isTranscriptNearBottom } from './session-transcript-scroll.pure'

interface SessionTranscriptProps {
  session: Session
  conversationItems: ConversationItemEntry[]
  selectedUiResponseItemId?: string | null
  htmlOutputByItemId?: Record<string, SessionHtmlOutput>
  selectedHtmlOutputItemId?: string | null
  onUiResponseArtifactSelect?: (conversationItemId: string) => void
  onHtmlOutputSelect?: (output: SessionHtmlOutput) => void
  onApprove: (sessionId: string, providerApprovalId?: string) => void
  onDeny: (sessionId: string, providerApprovalId?: string) => void
  onInputAnswer: (
    sessionId: string,
    response: InteractionResponse,
    displayText: string,
  ) => void
}

const TRANSCRIPT_ROW_ESTIMATE_PX = 160
const TRANSCRIPT_OVERSCAN = 6

export const SessionTranscript: FC<SessionTranscriptProps> = ({
  session,
  conversationItems,
  selectedUiResponseItemId = null,
  htmlOutputByItemId = {},
  selectedHtmlOutputItemId = null,
  onUiResponseArtifactSelect,
  onHtmlOutputSelect,
  onApprove,
  onDeny,
  onInputAnswer,
}) => {
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

  const conversationRenderPlan = useMemo(
    () => buildConversationRenderPlan(conversationItems),
    [conversationItems],
  )
  const actionableApprovalIds = useMemo(() => {
    if (
      session.status !== 'running' ||
      session.attention !== 'needs-approval'
    ) {
      return new Set<string>()
    }

    const ids = new Set<string>()
    for (const entry of conversationRenderPlan) {
      if (
        entry.item.kind === 'approval-request' &&
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
    session.status,
  ])
  const actionableInputIds = useMemo(() => {
    if (session.status !== 'running' || session.attention !== 'needs-input') {
      return new Set<string>()
    }

    const ids = new Set<string>()
    for (const entry of conversationRenderPlan) {
      if (
        entry.item.kind === 'input-request' &&
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
            const isActionableApproval =
              entry.kind === 'approval-request' &&
              actionableApprovalIds.has(entry.id)
            const isActionableInput =
              entry.kind === 'input-request' && actionableInputIds.has(entry.id)
            const hasUiResponseArtifact = hasArtifact(entry)
            const htmlOutput =
              entry.kind === 'message' && entry.actor === 'assistant'
                ? htmlOutputByItemId[entry.id]
                : undefined
            const hasHtmlOutput = htmlOutput !== undefined
            const isSelectedUiResponseArtifact =
              hasUiResponseArtifact && entry.id === selectedUiResponseItemId
            const isSelectedHtmlOutput =
              hasHtmlOutput && entry.id === selectedHtmlOutputItemId

            return (
              <div
                key={virtualItem.key}
                ref={measureRow}
                data-index={virtualItem.index}
                data-testid="session-transcript-row"
                data-ui-response-artifact={
                  hasUiResponseArtifact ? true : undefined
                }
                data-html-output={hasHtmlOutput ? true : undefined}
                data-selected-ui-response-artifact={
                  isSelectedUiResponseArtifact ? true : undefined
                }
                data-selected-html-output={
                  isSelectedHtmlOutput ? true : undefined
                }
                className={cn(
                  'absolute top-0 left-0 w-full rounded-md transition-colors',
                  hasUiResponseArtifact && 'cursor-pointer',
                  (isSelectedUiResponseArtifact || isSelectedHtmlOutput) &&
                    'bg-muted/20',
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
                <ConversationItem
                  entry={entry}
                  sessionId={session.id}
                  injectedContextText={renderEntry.injectedContextText}
                  htmlOutput={htmlOutput}
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
                          setResolvedApprovalIds((current) => {
                            const next = new Set(current)
                            next.add(entry.id)
                            return next
                          })
                          onDeny(
                            session.id,
                            entry.providerMeta.providerItemId ?? undefined,
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
                          onInputAnswer(session.id, response, displayText)
                        }
                      : undefined
                  }
                  onHtmlOutputOpen={onHtmlOutputSelect}
                />
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
