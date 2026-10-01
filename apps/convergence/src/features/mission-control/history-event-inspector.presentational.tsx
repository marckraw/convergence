import type { FC } from 'react'
import { X } from 'lucide-react'
import { Button, cn, IconButton } from '@convergence/ui'
import { Markdown } from '@/shared/ui/markdown.container'
import { HISTORY_TONE_TEXT } from './history-event-row.presentational'
import { HistoryFact } from './history-fact.presentational'
import type { HistoryTone } from './run-history.pure'

/** The facts a recorded event carries, exactly as they were written down. */
export interface RecordedEventFacts {
  source: string
  recipient: string
  baton: string | null
  outcome: string
  timestamp: string
  /** The reply preview the ledger stored, or null when it stored none. */
  responsePreview: string | null
  /** A human call's own message. */
  message: string | null
}

interface HistoryEventInspectorProps {
  title: string
  tone: HistoryTone
  facts: RecordedEventFacts
  /** True for a call on the chair: it can be acknowledged. */
  isCall: boolean
  /** True when this call has already been marked seen. */
  acknowledged: boolean
  /** Other calls in history, so this one does not look like the only one. */
  earlierCallCount: number
  /** The conversation to open, or null when nothing here can name one. */
  openRecipientLabel: string | null
  /**
   * Whether the connection this event fired on still exists. Separate from
   * the record on purpose (promise 6): the settings may have changed since.
   */
  hasCurrentConnection: boolean
  busy: boolean
  onOpenRecipient: () => void
  onViewCurrentConnection: () => void
  onMarkSeen: () => void
  onClose: () => void
}

/**
 * One recorded event, opened.
 *
 * Everything above the buttons is a STORED fact — what was written down when
 * it happened, not what the connection says today (promise 6). *View current
 * connection* is offered beside it, as a separate thing, because "what this
 * wire did" and "what this wire is set to now" are two questions and only one
 * of them is history.
 *
 * **Mark seen acknowledges and nothing else.** It does not send a reply, it
 * does not restart the run, and it does not approve the work. The sentence
 * under the button says all three, because a button next to a message from an
 * agent is exactly where somebody would fear otherwise.
 */
export const HistoryEventInspector: FC<HistoryEventInspectorProps> = ({
  title,
  tone,
  facts,
  isCall,
  acknowledged,
  earlierCallCount,
  openRecipientLabel,
  hasCurrentConnection,
  busy,
  onOpenRecipient,
  onViewCurrentConnection,
  onMarkSeen,
  onClose,
}) => (
  <section
    data-history-event-inspector
    aria-label="Recorded event"
    className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto border-l border-white/10 px-4 py-3"
  >
    <div className="flex items-start justify-between gap-2">
      <div className="flex flex-col gap-0.5">
        <h3 className={cn('text-sm font-medium', HISTORY_TONE_TEXT[tone])}>
          {title}
        </h3>
        <time
          dateTime={facts.timestamp}
          title={facts.timestamp}
          className="text-[11px] text-muted-foreground"
        >
          {new Date(facts.timestamp).toLocaleString()}
        </time>
      </div>
      <IconButton
        label="Close the event panel"
        type="button"
        variant="quiet"
        onClick={onClose}
        size="sm"
        className="shrink-0"
      >
        <X className="size-3.5" />
      </IconButton>
    </div>

    {facts.message ? (
      <div className="rounded-md border border-white/10 bg-white/[0.02] px-3 py-2">
        <Markdown content={facts.message} className="text-[11px]" />
      </div>
    ) : null}

    <div className="flex flex-col gap-1">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        Recorded event
      </p>
      <HistoryFact label="Source" value={facts.source} />
      <HistoryFact label="Recipient" value={facts.recipient} />
      <HistoryFact label="Baton" value={facts.baton ?? 'none declared'} />
      <HistoryFact label="Outcome" value={facts.outcome} />
    </div>

    <div className="flex flex-col gap-1">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        Response preview
      </p>
      <p className="text-[11px] text-muted-foreground">
        {facts.responsePreview ?? 'No response preview was recorded.'}
      </p>
    </div>

    <div className="flex flex-col items-start gap-1.5">
      {openRecipientLabel ? (
        <Button
          type="button"
          variant="tonal"
          onClick={onOpenRecipient}
          className="text-[11px]"
        >
          Open {openRecipientLabel} conversation
        </Button>
      ) : null}

      {hasCurrentConnection ? (
        <Button
          type="button"
          variant="ghost"
          onClick={onViewCurrentConnection}
          className="text-[11px]"
        >
          View current connection
        </Button>
      ) : null}

      {isCall ? (
        <>
          <Button
            type="button"
            variant="ghost"
            disabled={busy || acknowledged}
            onClick={onMarkSeen}
            className="text-[11px]"
          >
            {acknowledged ? 'Seen' : 'Mark seen'}
          </Button>
          <p className="text-[10px] text-muted-foreground/70">
            Mark seen acknowledges this call. It does not send a reply or
            restart the run.
          </p>
        </>
      ) : null}
    </div>

    {earlierCallCount > 0 ? (
      <p className="text-[10px] text-muted-foreground/70">
        Earlier calls · {earlierCallCount}. Earlier calls remain in history.
      </p>
    ) : null}

    <p className="mt-auto text-[10px] text-muted-foreground/70">
      These are the facts recorded when this happened. The connection’s current
      settings are shown separately.
    </p>
  </section>
)

/** The glossary the handed-back panel carries (frame 07). */
export const RUN_LAP_DELIVERY_GLOSSARY = [
  'Run: one autonomous work attempt.',
  'Lap: one correction cycle.',
  'Delivery: one message handoff.',
] as const
