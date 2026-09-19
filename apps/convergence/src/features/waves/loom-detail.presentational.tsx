import { ExternalLink, X } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import type { LoomIssueDetail } from './loom-detail.pure'
import {
  LOOM_DETAIL_CHIP_CLASS,
  LOOM_DETAIL_CLASS,
  LOOM_DETAIL_FOOTER_CLASS,
  LOOM_DETAIL_MUTED_CLASS,
  LOOM_DETAIL_SECTION_CLASS,
} from './wave-panel.styles'

interface LoomDetailViewProps<TSession> {
  detail: LoomIssueDetail<TSession>
  onClose: () => void
  onOpenConversation: (session: TSession) => void
  /** Focus lands here when the detail opens, so Esc and Tab start inside. */
  closeRef?: (element: HTMLButtonElement | null) => void
}

/**
 * One issue, read in place (MAR-3195).
 *
 * READ-ONLY by construction, not by intention: every fact is a `<span>` or a
 * `<p>`, the two external doors are anchors, and the only buttons are Close
 * and Open conversation. There is no form control in this file, which is
 * what R6's test asserts rather than trusting this sentence.
 *
 * It decides nothing: `loomIssueDetail` has already chosen every word.
 */
export const LoomDetailView = <TSession,>({
  detail,
  onClose,
  onOpenConversation,
  closeRef,
}: LoomDetailViewProps<TSession>) => (
  <div className={LOOM_DETAIL_CLASS} data-loom-detail={detail.key}>
    <div className="flex items-start gap-2">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="font-mono text-[11px] text-muted-foreground">
          {detail.identifier}
        </span>
        {/* Wrapping, never truncated: the title is the thing being read. */}
        <h4 className="whitespace-normal text-xs font-medium">
          {detail.title}
        </h4>
      </div>
      <span className="flex-1" />
      <Button
        ref={closeRef}
        type="button"
        variant="ghost"
        size="sm"
        aria-label="Close the issue detail"
        className="size-6 shrink-0 p-0"
        onClick={onClose}
      >
        <X className="size-3.5" />
      </Button>
    </div>

    <p className={LOOM_DETAIL_MUTED_CLASS}>{detail.statusLine}</p>
    <p className="whitespace-normal">{detail.summary}</p>

    <section aria-label="Labels" className="flex flex-wrap gap-1">
      {detail.labelsEmpty ? (
        <span className={LOOM_DETAIL_MUTED_CLASS}>{detail.labelsEmpty}</span>
      ) : (
        detail.labels.map((label) => (
          <span key={label} className={LOOM_DETAIL_CHIP_CLASS}>
            {label}
          </span>
        ))
      )}
    </section>

    <p className={LOOM_DETAIL_MUTED_CLASS}>{detail.seatLine}</p>

    <section
      aria-label="Linked pull request"
      className={LOOM_DETAIL_SECTION_CLASS}
    >
      {detail.pr.linked ? (
        <>
          <a
            href={detail.pr.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 underline-offset-2 hover:underline"
          >
            {detail.pr.headline}
            <ExternalLink className="size-3" aria-hidden />
          </a>
          {detail.pr.title ? (
            <span className="whitespace-normal">{detail.pr.title}</span>
          ) : null}
          <span className={LOOM_DETAIL_MUTED_CLASS}>
            {[detail.pr.checked, detail.pr.review, detail.pr.ci]
              .filter((part): part is string => part !== null)
              .join(' · ')}
          </span>
        </>
      ) : (
        <span className={LOOM_DETAIL_MUTED_CLASS}>{detail.pr.line}</span>
      )}
    </section>

    <section aria-label="Conversation" className={LOOM_DETAIL_SECTION_CLASS}>
      {detail.conversation.canOpen ? (
        <>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 justify-start px-1 text-[11px]"
            onClick={() => {
              if (detail.conversation.canOpen) {
                onOpenConversation(detail.conversation.session)
              }
            }}
          >
            Open conversation →
          </Button>
          <span className={LOOM_DETAIL_MUTED_CLASS}>
            {detail.conversation.line}
          </span>
        </>
      ) : (
        <>
          <span className={LOOM_DETAIL_MUTED_CLASS}>
            {detail.conversation.reason}
          </span>
          <span className={LOOM_DETAIL_MUTED_CLASS}>
            {detail.conversation.note}
          </span>
        </>
      )}
    </section>

    <a
      href={detail.url}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-1 underline-offset-2 hover:underline"
    >
      Open issue in Linear
      <ExternalLink className="size-3" aria-hidden />
    </a>

    <p className={LOOM_DETAIL_FOOTER_CLASS}>{detail.footer}</p>
  </div>
)
