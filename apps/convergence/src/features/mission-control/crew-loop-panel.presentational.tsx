import type { FC } from 'react'
import type { SessionCrewMember } from '@/entities/session-crew'
import { Input } from '@/shared/ui/input'

interface CrewLoopPanelProps {
  members: readonly SessionCrewMember[]
  resolveName: (sessionId: string) => string | null
  /** Null means "the default"; the placeholder says what the default is. */
  roundCap: number | null
  stallMinutes: number | null
  defaultRoundCap: number
  defaultStallMinutes: number
  busy?: boolean
  onBatonNameChange: (sessionId: string, batonName: string) => void
  onRoundCapChange: (roundCap: number | null) => void
  onStallMinutesChange: (stallMinutes: number | null) => void
}

/**
 * The two knobs a crew turns on its own loop, and the names its batons use.
 *
 * Per crew rather than in App Settings because a loop belongs to a crew: one
 * crew's twelve rounds are another's two, and a global number would be wrong
 * for everybody the moment there were two crews. They sit beside the wires
 * they govern, in the panel that already is this crew's switchboard.
 *
 * An empty box means the default, and the placeholder says what the default
 * is — a blank field that silently meant twelve would be a setting nobody
 * could read.
 */
export const CrewLoopPanel: FC<CrewLoopPanelProps> = ({
  members,
  resolveName,
  roundCap,
  stallMinutes,
  defaultRoundCap,
  defaultStallMinutes,
  busy = false,
  onBatonNameChange,
  onRoundCapChange,
  onStallMinutesChange,
}) => {
  // A blank box is "the default", which is null — not zero, which is a cap no
  // crew could have meant and which the backend refuses outright.
  const readLimit = (value: string): number | null => {
    const trimmed = value.trim()
    if (trimmed.length === 0) return null
    const parsed = Number(trimmed)
    return Number.isInteger(parsed) && parsed >= 1 ? parsed : null
  }

  return (
    <div
      data-crew-loop-panel
      className="flex flex-col gap-1.5 rounded-md border border-white/10 bg-white/[0.02] px-2 py-2"
    >
      <p className="text-[11px] font-medium text-muted-foreground">
        Baton names
      </p>
      {members.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          Add a session to this crew to give it a baton name.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {members.map((member) => (
            <li key={member.sessionId} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-[11px]">
                {resolveName(member.sessionId) ?? member.sessionId}
              </span>
              <Input
                value={member.batonName ?? ''}
                placeholder="unnamed"
                aria-label={`Baton name for ${
                  resolveName(member.sessionId) ?? member.sessionId
                }`}
                disabled={busy}
                onChange={(event) =>
                  onBatonNameChange(member.sessionId, event.target.value)
                }
                className="h-6 w-28 shrink-0 text-xs"
              />
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          Round cap
          <Input
            type="number"
            min={1}
            value={roundCap ?? ''}
            placeholder={String(defaultRoundCap)}
            aria-label="Round cap for this crew"
            disabled={busy}
            onChange={(event) =>
              onRoundCapChange(readLimit(event.target.value))
            }
            className="h-6 w-16 text-xs"
          />
        </label>

        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          Stall after (min)
          <Input
            type="number"
            min={1}
            value={stallMinutes ?? ''}
            placeholder={String(defaultStallMinutes)}
            aria-label="Stall window for this crew, in minutes"
            disabled={busy}
            onChange={(event) =>
              onStallMinutesChange(readLimit(event.target.value))
            }
            className="h-6 w-16 text-xs"
          />
        </label>
      </div>
    </div>
  )
}
