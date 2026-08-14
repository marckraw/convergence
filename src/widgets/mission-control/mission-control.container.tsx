import { useCallback, useMemo, useState } from 'react'
import type { FC } from 'react'
import { toast } from 'sonner'
import { useSessionStore } from '@/entities/session'
import type { SessionSummary } from '@/entities/session'
import {
  EMPTY_SESSION_CARD_FILTER,
  HailComposer,
  SessionCardView,
  SessionStateChips,
  isEmptySessionCardFilter,
  resolveHailOutcome,
  toggleSessionCardState,
  useMissionControlCards,
} from '@/features/mission-control'
import type {
  SessionCard,
  SessionCardFilter,
  SessionCardOrderPreset,
  SessionCardState,
} from '@/features/mission-control'
import { MissionControlView } from './mission-control.presentational'

interface MissionControlProps {
  onOpenSession?: (session: SessionSummary) => void
}

export const MissionControl: FC<MissionControlProps> = ({ onOpenSession }) => {
  const [filter, setFilter] = useState<SessionCardFilter>(
    EMPTY_SESSION_CARD_FILTER,
  )
  const [order, setOrder] = useState<SessionCardOrderPreset>('attention-first')
  const [hailSessionId, setHailSessionId] = useState<string | null>(null)
  const [hailText, setHailText] = useState('')
  const [sending, setSending] = useState(false)
  const [hailError, setHailError] = useState<string | null>(null)

  const { cards, totalCount, stateCounts } = useMissionControlCards({
    filter,
    order,
  })
  const providers = useSessionStore((state) => state.providers)
  const sendMessageToSession = useSessionStore(
    (state) => state.sendMessageToSession,
  )

  const attentionCount = useMemo(
    () => cards.filter((card) => card.session.attention !== 'none').length,
    [cards],
  )
  const runningCount = useMemo(
    () => cards.filter((card) => card.session.status === 'running').length,
    [cards],
  )

  const handleQueryChange = useCallback((query: string) => {
    setFilter((current) => ({ ...current, query }))
  }, [])

  const handleToggleState = useCallback((state: SessionCardState) => {
    setFilter((current) => ({
      ...current,
      states: toggleSessionCardState(current.states, state),
    }))
  }, [])

  const handleClearStates = useCallback(() => {
    setFilter((current) => ({ ...current, states: [] }))
  }, [])

  const handleClearFilter = useCallback(() => {
    setFilter(EMPTY_SESSION_CARD_FILTER)
  }, [])

  const closeHail = useCallback(() => {
    setHailSessionId(null)
    setHailText('')
    setHailError(null)
  }, [])

  const handleToggleHail = useCallback((card: SessionCard) => {
    setHailError(null)
    setHailSessionId((current) => {
      const next = current === card.session.id ? null : card.session.id
      if (next !== current) setHailText('')
      return next
    })
  }, [])

  const handleOpen = useCallback(
    (card: SessionCard) => {
      onOpenSession?.(card.session)
    },
    [onOpenSession],
  )

  // The outcome is recomputed from the live card on every render, so a status
  // change arriving mid-compose flips the label before the send happens.
  const hailCard = cards.find((card) => card.session.id === hailSessionId)
  const hailOutcome = hailCard
    ? resolveHailOutcome({
        status: hailCard.session.status,
        attention: hailCard.session.attention,
        provider:
          providers.find(
            (provider) => provider.id === hailCard.session.providerId,
          ) ?? null,
      })
    : null

  const handleSend = useCallback(async () => {
    if (!hailCard || !hailOutcome || hailOutcome.disabled) return
    const text = hailText.trim()
    if (!text) return

    setSending(true)
    setHailError(null)
    try {
      await sendMessageToSession({
        sessionId: hailCard.session.id,
        text,
        deliveryMode:
          hailOutcome.deliveryMode === 'normal'
            ? undefined
            : hailOutcome.deliveryMode,
      })
      const error = useSessionStore.getState().error
      if (error) {
        setHailError(error)
        return
      }
      toast.success(`${hailOutcome.label} · ${hailCard.session.name}`)
      closeHail()
    } catch (err) {
      setHailError(
        err instanceof Error ? err.message : 'Failed to send the hail',
      )
    } finally {
      setSending(false)
    }
  }, [closeHail, hailCard, hailOutcome, hailText, sendMessageToSession])

  return (
    <MissionControlView
      totalCount={totalCount}
      visibleCount={cards.length}
      attentionCount={attentionCount}
      runningCount={runningCount}
      query={filter.query}
      onQueryChange={handleQueryChange}
      order={order}
      onOrderChange={setOrder}
      filterIsEmpty={isEmptySessionCardFilter(filter)}
      onClearFilter={handleClearFilter}
      chips={
        <SessionStateChips
          selected={filter.states}
          counts={stateCounts}
          onToggle={handleToggleState}
          onClear={handleClearStates}
        />
      }
    >
      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
        {cards.map((card) => (
          <SessionCardView
            key={card.session.id}
            card={card}
            hailOpen={card.session.id === hailSessionId}
            onOpen={handleOpen}
            onToggleHail={handleToggleHail}
            hailComposer={
              hailOutcome && card.session.id === hailSessionId ? (
                <HailComposer
                  sessionName={card.session.name}
                  value={hailText}
                  outcome={hailOutcome}
                  sending={sending}
                  error={hailError}
                  onChange={setHailText}
                  onSend={() => void handleSend()}
                  onCancel={closeHail}
                />
              ) : null
            }
          />
        ))}
      </div>
    </MissionControlView>
  )
}
