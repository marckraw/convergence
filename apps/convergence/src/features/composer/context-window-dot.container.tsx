import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  ProviderInfo,
  SessionContextWindow,
  SessionSummary,
} from '@/entities/session'
import { useAppSettingsStore } from '@/entities/app-settings'
import {
  resolveContextDrillAction,
  useContextDrillStore,
} from '@/entities/context-drill'
import { resolveContextCompactionAction } from './context-compaction.pure'
import {
  describeContextAlert,
  getContextTone,
} from './context-window-tone.pure'
import { ContextWindowPopover } from './context-window-popover.presentational'
import { useHoverPopover } from './use-hover-popover'

interface ContextWindowDotProps {
  contextWindow: SessionContextWindow | null | undefined
  session: SessionSummary
  provider: ProviderInfo | null | undefined
  onCompact: () => Promise<void>
  hasPendingQueuedInput?: boolean
}

export function ContextWindowDot({
  contextWindow,
  session,
  provider,
  onCompact,
  hasPendingQueuedInput = false,
}: ContextWindowDotProps) {
  const { open, setOpen, openPanel, closePanelSoon, clearCloseTimer } =
    useHoverPopover()
  const [isCompacting, setIsCompacting] = useState(false)
  const [actionMessage, setActionMessage] = useState<{
    tone: 'success' | 'error'
    text: string
  } | null>(null)
  // Read from the store rather than passed down: the store is refreshed by the
  // `appSettings:updated` broadcast, so changing the threshold recolours an
  // already-open conversation's dot without a reload.
  const contextAlert = useAppSettingsStore((s) => s.settings.contextAlert)
  const tone = getContextTone(contextWindow, contextAlert)
  const alertLine = describeContextAlert(contextWindow, contextAlert)
  const compaction = resolveContextCompactionAction(session, provider, {
    hasPendingQueuedInput,
  })

  const drillDescription = useContextDrillStore(
    (s) => s.descriptions[session.id],
  )
  const drillBeat = useContextDrillStore((s) => s.beats[session.id]) ?? null
  const refreshDrill = useContextDrillStore((s) => s.refresh)
  const drill = resolveContextDrillAction(drillDescription, drillBeat)
  const [cancelRefusal, setCancelRefusal] = useState<string | null>(null)

  /**
   * Re-ask the backend whenever something it would answer differently about
   * has moved: the conversation itself, its turn, what it is waiting for, and
   * whether a send is queued behind it.
   *
   * Every one of those is a value this component already re-renders on, which
   * is the whole reason there is no interval here. A beat starting or ending
   * arrives separately, on `contextDrill:changed`, and the ending re-asks on
   * its own (the store's `handleChange`) -- so the two halves of "is it
   * offered" are both pushed, and nothing is polled.
   */
  useEffect(() => {
    void refreshDrill(session.id)
  }, [
    refreshDrill,
    session.id,
    session.status,
    session.attention,
    session.activity,
    hasPendingQueuedInput,
  ])

  /**
   * Opening the popover re-asks, once per closed-to-open transition
   * (MAR-3287 R4).
   *
   * An EVENT, not a state: the ref remembers whether the popover was already
   * open, so a re-render while it stays open asks nothing. This is what makes
   * a role set in Mission Control visible the next time the popover opens,
   * with no turn in between -- the crew is not a value this component
   * re-renders on, and subscribing to it here would be a second copy of a
   * question the backend already answers.
   */
  const wasOpenRef = useRef(false)
  useEffect(() => {
    if (open && !wasOpenRef.current) void refreshDrill(session.id)
    wasOpenRef.current = open
  }, [open, refreshDrill, session.id])

  useEffect(() => {
    setActionMessage(null)
    setCancelRefusal(null)
  }, [session.id])

  const compact = useCallback(async () => {
    clearCloseTimer()
    setActionMessage(null)
    setIsCompacting(true)
    try {
      await onCompact()
      setActionMessage({ tone: 'success', text: 'Context compacted.' })
    } catch (error) {
      setActionMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Compaction failed.',
      })
    } finally {
      setIsCompacting(false)
    }
  }, [clearCloseTimer, onCompact])

  /**
   * Started, not awaited.
   *
   * The routine takes minutes and this popover closes when the pointer
   * leaves it, so there is nothing here to await into. The store owns the
   * promise and records the ending; what this component shows next is the
   * beat, which arrives on `contextDrill:changed`.
   */
  const runDrill = useCallback(() => {
    clearCloseTimer()
    setCancelRefusal(null)
    void useContextDrillStore.getState().run(session.id)
  }, [clearCloseTimer, session.id])

  const cancelDrill = useCallback(() => {
    clearCloseTimer()
    void useContextDrillStore
      .getState()
      .cancel(session.id)
      .then(setCancelRefusal)
  }, [clearCloseTimer, session.id])

  return (
    <ContextWindowPopover
      contextWindow={contextWindow}
      tone={tone}
      alertLine={alertLine}
      compaction={compaction}
      compactionCheckedAtRun={
        provider?.contextManagement?.compact.availability === 'runtime-check'
      }
      compacting={isCompacting || session.activity === 'compacting'}
      drillRunning={drillBeat !== null}
      actionMessage={actionMessage}
      drill={drill}
      cancelRefusal={cancelRefusal}
      onCompact={() => void compact()}
      onRunDrill={runDrill}
      onCancelDrill={cancelDrill}
      open={open}
      onOpenChange={setOpen}
      onOpenPanel={openPanel}
      onClosePanelSoon={closePanelSoon}
    />
  )
}
