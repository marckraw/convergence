import { useCallback, useEffect, useState } from 'react'
import type { FC } from 'react'
import { ChevronRight, TriangleAlert } from 'lucide-react'
import {
  selectHopTrailForCrew,
  useSessionRelayStore,
} from '@/entities/session-relay'
import { Badge, Button, cn, Tooltip, useConfirm } from '@convergence/ui'
import { RelayHopRow } from './relay-hop-row.presentational'
import {
  buildRelayHopLine,
  countAlarmingHops,
  formatAlarmSummary,
  formatClearTrailConfirm,
  formatHopCount,
  formatKeptHopsNote,
} from './relay-hop.pure'
import type { ResolveSessionName } from './relay-sentence.pure'

interface RelayHopTrailProps {
  crewId: string
  resolveName: ResolveSessionName
}

/**
 * The crew's ledger: every firing this crew's wires ever made, newest first.
 *
 * The trail is loaded whether or not it is open, because the alarm count above
 * it has to be honest before anyone clicks -- a crew that quietly errored
 * twelve times overnight must say so from the outside.
 */
export const RelayHopTrail: FC<RelayHopTrailProps> = ({
  crewId,
  resolveName,
}) => {
  // Subscribed to the whole map, then narrowed here: selecting inside the
  // subscription would hand zustand a fresh trail object every render.
  const hopsByCrewId = useSessionRelayStore((state) => state.hopsByCrewId)
  const loadHops = useSessionRelayStore((state) => state.loadHops)
  const loadOlderHops = useSessionRelayStore((state) => state.loadOlderHops)
  const clearHops = useSessionRelayStore((state) => state.clearHops)
  const confirm = useConfirm()

  const [open, setOpen] = useState(false)
  const [expandedHopId, setExpandedHopId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Local because it is about the press that just happened, not about the
  // trail: a note that outlived the room it was written in would be a puzzle.
  const [keptNote, setKeptNote] = useState<string | null>(null)

  useEffect(() => {
    void loadHops(crewId)
  }, [crewId, loadHops])

  const trail = selectHopTrailForCrew({ hopsByCrewId }, crewId)
  const hops = trail.hops
  const alarming = countAlarmingHops(hops)

  // One clock for the whole list, so every relative time in a trail is
  // measured from the same instant rather than drifting row by row.
  const now = new Date()

  const toggleHop = useCallback((hopId: string) => {
    setExpandedHopId((current) => (current === hopId ? null : hopId))
  }, [])

  const loadOlder = useCallback(async () => {
    setBusy(true)
    await loadOlderHops(crewId)
    setBusy(false)
  }, [crewId, loadOlderHops])

  // Clearing the trail can't be undone, so it asks first (R5): the question
  // names the scope, and the alerts the ⚠ badge counts, before anything goes.
  const clear = useCallback(async () => {
    setKeptNote(null)
    const confirmed = await confirm({
      title: 'Clear the trail?',
      description: formatClearTrailConfirm(alarming),
      confirmLabel: 'Clear trail',
      variant: 'danger',
    })
    if (!confirmed) return
    setBusy(true)
    const result = await clearHops(crewId)
    setBusy(false)
    setExpandedHopId(null)
    setKeptNote(result ? formatKeptHopsNote(result.kept) : null)
  }, [alarming, clearHops, confirm, crewId])

  if (hops.length === 0) {
    // The note survives the trail it described: clearing the last hop empties
    // this section, and "kept 2 from a running flow" would vanish with it.
    return keptNote ? (
      <p className="text-2xs text-ink-muted">{keptNote}</p>
    ) : null
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          variant="quiet"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          size="xs"
          className="px-1"
        >
          {/* One chevron that turns (MC-31). */}
          <ChevronRight
            className={cn('size-3 transition-transform', open && 'rotate-90')}
          />
          Trail
          <span className="tabular-nums">{formatHopCount(hops.length)}</span>
        </Button>

        {alarming > 0 ? (
          <Tooltip label={formatAlarmSummary(alarming)}>
            <Badge
              tone="danger"
              icon={<TriangleAlert />}
              className="font-medium"
            >
              {alarming}
              <span className="sr-only">{formatAlarmSummary(alarming)}</span>
            </Badge>
          </Tooltip>
        ) : null}

        <Button
          type="button"
          variant="quiet"
          disabled={busy}
          onClick={() => {
            void clear()
          }}
          size="xs"
          className="ml-auto shrink-0"
        >
          Clear trail…
        </Button>
      </div>

      {keptNote ? <p className="text-2xs text-ink-muted">{keptNote}</p> : null}

      {open ? (
        <>
          <ul className="flex flex-col gap-0.5">
            {hops.map((hop) => (
              <RelayHopRow
                key={hop.id}
                line={buildRelayHopLine(hop, resolveName, now)}
                expanded={expandedHopId === hop.id}
                onToggle={() => toggleHop(hop.id)}
              />
            ))}
          </ul>

          {trail.hasMore ? (
            <Button
              type="button"
              variant="quiet"
              disabled={busy}
              onClick={() => {
                void loadOlder()
              }}
              size="xs"
              className="self-start px-1"
            >
              Load older
            </Button>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
