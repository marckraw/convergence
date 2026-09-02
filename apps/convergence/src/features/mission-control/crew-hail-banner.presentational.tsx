import type { FC } from 'react'
import { Armchair } from 'lucide-react'
import type { CrewHail } from '@/entities/crew-hail'
import { Button } from '@/shared/ui/button'

interface CrewHailBannerProps {
  hails: readonly CrewHail[]
  resolveName: (sessionId: string) => string | null
  onAcknowledge: (id: string) => void
}

/**
 * What a parked loop says out loud.
 *
 * Every call carries the message that produced it, not a reference to it: the
 * whole reason the loop stopped is in those words, and a banner that only said
 * "the loop parked" would send him hunting through a transcript for the thing
 * he is being asked about.
 *
 * Amber rather than red on purpose. A terminal baton is the loop working
 * exactly as designed — a station said the work is his — and painting it as a
 * fault would teach him to dread the mechanism that is protecting him.
 */
export const CrewHailBanner: FC<CrewHailBannerProps> = ({
  hails,
  resolveName,
  onAcknowledge,
}) => {
  if (hails.length === 0) return null

  return (
    <ul
      data-crew-hails
      aria-label="Calls waiting on you"
      className="flex flex-col gap-1"
    >
      {hails.map((hail) => (
        <li
          key={hail.id}
          className="rounded-md border border-amber-400/40 bg-amber-400/[0.06] px-2 py-1.5"
        >
          <div className="flex items-start gap-2">
            <Armchair
              aria-hidden
              className="mt-0.5 size-3 shrink-0 text-amber-300"
            />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-amber-100">
                <span className="font-medium">
                  {resolveName(hail.sessionId) ??
                    'a session that no longer exists'}
                </span>{' '}
                {hail.detail}
              </p>
              {hail.message ? (
                // Clamped rather than scrolled: this is the glance, and the
                // session itself is one click away for the whole thing.
                <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-[11px] text-amber-100/70">
                  {hail.message}
                </p>
              ) : null}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Answer this hail"
              onClick={() => onAcknowledge(hail.id)}
              className="h-6 shrink-0 px-2 text-[11px] text-amber-200/80 hover:text-amber-100"
            >
              Seen
            </Button>
          </div>
        </li>
      ))}
    </ul>
  )
}
