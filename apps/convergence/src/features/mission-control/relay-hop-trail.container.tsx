import { useCallback, useEffect, useState } from 'react'
import type { FC } from 'react'
import { ChevronDown, ChevronRight, TriangleAlert } from 'lucide-react'
import {
  selectHopTrailForCrew,
  useSessionRelayStore,
} from '@/entities/session-relay'
import { cn } from '@/shared/lib/cn.pure'
import { Button } from '@/shared/ui/button'
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

  const [open, setOpen] = useState(false)
  const [expandedHopId, setExpandedHopId] = useState<string | null>(null)
  const [confirmingClear, setConfirmingClear] = useState(false)
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

  const confirmClear = useCallback(async () => {
    setBusy(true)
    const result = await clearHops(crewId)
    setBusy(false)
    setConfirmingClear(false)
    setExpandedHopId(null)
    setKeptNote(result ? formatKeptHopsNote(result.kept) : null)
  }, [clearHops, crewId])

  if (hops.length === 0) {
    // The note survives the trail it described: clearing the last hop empties
    // this section, and "kept 2 from a running flow" would vanish with it.
    return keptNote ? (
      <p className="text-[11px] text-muted-foreground">{keptNote}</p>
    ) : null
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          className="h-6 gap-1 px-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          {open ? (
            <ChevronDown className="size-3" />
          ) : (
            <ChevronRight className="size-3" />
          )}
          Trail
          <span className="tabular-nums">{formatHopCount(hops.length)}</span>
        </Button>

        {alarming > 0 ? (
          <span
            title={formatAlarmSummary(alarming)}
            className={cn(
              'flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none',
              'bg-red-500/20 text-red-400 ring-1 ring-red-500/40',
            )}
          >
            <TriangleAlert aria-hidden className="size-3" />
            {alarming}
            <span className="sr-only">{formatAlarmSummary(alarming)}</span>
          </span>
        ) : null}

        {confirmingClear ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => {
              void confirmClear()
            }}
            className="ml-auto h-6 shrink-0 px-2 text-[11px] text-red-400 hover:text-red-300"
          >
            {formatClearTrailConfirm(alarming)}
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => {
              setKeptNote(null)
              setConfirmingClear(true)
            }}
            className="ml-auto h-6 shrink-0 px-2 text-[11px] text-muted-foreground hover:text-foreground"
          >
            Clear trail
          </Button>
        )}
      </div>

      {keptNote ? (
        <p className="text-[11px] text-muted-foreground">{keptNote}</p>
      ) : null}

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
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => {
                void loadOlder()
              }}
              className="h-6 self-start px-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              Load older
            </Button>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
