import type { FC } from 'react'
import { ArrowRight, Pencil, Trash2, TriangleAlert } from 'lucide-react'
import type { SessionRelay } from '@/entities/session-relay'
import { cn } from '@/shared/lib/cn.pure'
import { Button } from '@/shared/ui/button'
import type { RelaySentence } from './relay-sentence.pure'
import {
  RELAY_INSTRUCTION_MARKER,
  formatArmedLabel,
} from './relay-sentence.pure'

interface RelayRowProps {
  relay: SessionRelay
  sentence: RelaySentence
  /** True while this row's delete is asking a second time. */
  confirmingDelete: boolean
  busy?: boolean
  onToggleArmed: (relay: SessionRelay, armed: boolean) => void
  onEdit: (relay: SessionRelay) => void
  onRequestDelete: (relay: SessionRelay) => void
  onConfirmDelete: (relay: SessionRelay) => void
}

/**
 * One wire, read as a sentence, with its switch in reach.
 *
 * The arm toggle is the first thing on the row and takes one click: a wire
 * that sends real prompts to real providers must never need a menu to stop.
 */
export const RelayRow: FC<RelayRowProps> = ({
  relay,
  sentence,
  confirmingDelete,
  busy = false,
  onToggleArmed,
  onEdit,
  onRequestDelete,
  onConfirmDelete,
}) => {
  const broken = sentence.source.missing || sentence.target.missing
  const armedLabel = formatArmedLabel(relay.armed)

  return (
    <li
      data-relay-row
      className={cn(
        'flex items-center gap-2 rounded-md border border-white/10 px-2 py-1.5',
        !relay.armed && 'opacity-60',
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        role="switch"
        aria-checked={relay.armed}
        aria-label={`${armedLabel}: ${sentence.text}`}
        title={`${armedLabel} — click to ${relay.armed ? 'disarm' : 'arm'}`}
        disabled={busy}
        onClick={() => onToggleArmed(relay, !relay.armed)}
        className={cn(
          'relative h-4 w-7 shrink-0 rounded-full p-0 transition-colors hover:bg-current/0',
          relay.armed ? 'bg-emerald-500/70' : 'bg-white/15',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'absolute top-0.5 size-3 rounded-full bg-white transition-all',
            relay.armed ? 'left-3.5' : 'left-0.5',
          )}
        />
      </Button>

      <p className="flex min-w-0 flex-1 flex-wrap items-center gap-1 text-[11px] leading-tight text-muted-foreground">
        {/* Read from the sentence rather than typed here, the same way the
            action's own words already are: a row must never be able to say
            "finishes" about a wire that fires on something else. */}
        <span>{sentence.trigger.prefix}</span>
        <span
          className={cn(
            'font-medium',
            sentence.source.missing ? 'text-amber-400' : 'text-foreground',
          )}
        >
          {sentence.source.name}
        </span>
        <span>{sentence.trigger.suffix}</span>
        <ArrowRight aria-hidden className="size-3 shrink-0" />
        <span>{sentence.connector}</span>
        <span
          className={cn(
            'font-medium',
            sentence.target.missing ? 'text-amber-400' : 'text-foreground',
          )}
        >
          {sentence.target.name}
        </span>
        {sentence.detail ? (
          <span className="text-muted-foreground/70">· {sentence.detail}</span>
        ) : null}
        {/* The brief itself stays in the form: a row is scanned, and a
            paragraph here would hide the wiring it exists to show. Hover
            reads it out in full. */}
        {sentence.instruction ? (
          <span
            title={sentence.instruction}
            className="text-muted-foreground/70"
          >
            · {RELAY_INSTRUCTION_MARKER}
          </span>
        ) : null}
      </p>

      {broken ? (
        <TriangleAlert
          className="size-3.5 shrink-0 text-amber-400"
          aria-label="This wire has an end that no longer exists"
        />
      ) : null}

      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Edit relay: ${sentence.text}`}
        disabled={busy}
        onClick={() => onEdit(relay)}
        className="size-6 shrink-0 p-0 text-muted-foreground hover:text-foreground"
      >
        <Pencil className="size-3" />
      </Button>

      {confirmingDelete ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => onConfirmDelete(relay)}
          className="h-6 shrink-0 px-2 text-[11px] text-red-400 hover:text-red-300"
        >
          Delete wire?
        </Button>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Delete relay: ${sentence.text}`}
          disabled={busy}
          onClick={() => onRequestDelete(relay)}
          className="size-6 shrink-0 p-0 text-muted-foreground hover:text-red-400"
        >
          <Trash2 className="size-3" />
        </Button>
      )}
    </li>
  )
}
