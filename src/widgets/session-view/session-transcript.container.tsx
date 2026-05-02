import { useVirtualizer } from '@tanstack/react-virtual'
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FC,
} from 'react'
import type {
  ConversationItem as ConversationItemEntry,
  Session,
} from '@/entities/session'
import { ConversationItem } from './conversation-item.container'
import { buildConversationRenderPlan } from './session-transcript-render-plan.pure'
import { isTranscriptNearBottom } from './session-transcript-scroll.pure'

interface SessionTranscriptProps {
  session: Session
  conversationItems: ConversationItemEntry[]
  onApprove: (sessionId: string) => void
  onDeny: (sessionId: string) => void
}

const TRANSCRIPT_ROW_ESTIMATE_PX = 160
const TRANSCRIPT_OVERSCAN = 6

export const SessionTranscript: FC<SessionTranscriptProps> = ({
  session,
  conversationItems,
  onApprove,
  onDeny,
}) => {
  const scrollParentRef = useRef<HTMLDivElement>(null)
  const [scrollParent, setScrollParent] = useState<HTMLDivElement | null>(null)
  const bottomFollowRef = useRef(true)
  const pendingScrollFrameRef = useRef<number | null>(null)
  const previousSessionIdRef = useRef<string | null>(null)

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
  const actionableApprovalId = useMemo(() => {
    if (session.status !== 'running' || session.attention !== 'needs-approval') {
      return null
    }

    return (
      [...conversationRenderPlan]
        .reverse()
        .find((candidate) => candidate.item.kind === 'approval-request')?.item
        .id ?? null
    )
  }, [conversationRenderPlan, session.attention, session.status])

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

  const lastItem = conversationItems[conversationItems.length - 1] ?? null
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
    conversationItems.length,
    lastItem?.id,
    lastItem?.updatedAt,
    scrollToLatest,
    session.id,
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
              entry.id === actionableApprovalId

            return (
              <div
                key={virtualItem.key}
                ref={(node) => {
                  rowVirtualizer.measureElement(node)
                  if (
                    node &&
                    bottomFollowRef.current &&
                    virtualItem.index === conversationRenderPlan.length - 1
                  ) {
                    scrollToLatest()
                  }
                }}
                data-index={virtualItem.index}
                data-testid="session-transcript-row"
                className="absolute top-0 left-0 w-full"
                style={{
                  transform: `translateY(${virtualItem.start}px)`,
                }}
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
                  turnStartedAt={
                    entry.turnId
                      ? (turnStartedAtById.get(entry.turnId) ?? null)
                      : null
                  }
                  onApprove={
                    isActionableApproval
                      ? () => onApprove(session.id)
                      : undefined
                  }
                  onDeny={
                    isActionableApproval ? () => onDeny(session.id) : undefined
                  }
                />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
