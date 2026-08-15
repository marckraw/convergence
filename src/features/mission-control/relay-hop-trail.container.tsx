import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FC } from 'react'
import { ChevronDown, ChevronRight, TriangleAlert } from 'lucide-react'
import { useSessionRelayStore } from '@/entities/session-relay'
import { cn } from '@/shared/lib/cn.pure'
import { Button } from '@/shared/ui/button'
import { RelayHopRow } from './relay-hop-row.presentational'
import {
  buildRelayHopLine,
  countAlarmingHops,
  formatAlarmSummary,
  formatHopCount,
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
  const hopsByCrewId = useSessionRelayStore((state) => state.hopsByCrewId)
  const loadHops = useSessionRelayStore((state) => state.loadHops)

  const [open, setOpen] = useState(false)
  const [expandedHopId, setExpandedHopId] = useState<string | null>(null)

  useEffect(() => {
    void loadHops(crewId)
  }, [crewId, loadHops])

  const hops = useMemo(() => hopsByCrewId[crewId] ?? [], [hopsByCrewId, crewId])
  const alarming = countAlarmingHops(hops)

  // One clock for the whole list, so every relative time in a trail is
  // measured from the same instant rather than drifting row by row.
  const now = new Date()

  const toggleHop = useCallback((hopId: string) => {
    setExpandedHopId((current) => (current === hopId ? null : hopId))
  }, [])

  if (hops.length === 0) return null

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
      </div>

      {open ? (
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
      ) : null}
    </div>
  )
}
