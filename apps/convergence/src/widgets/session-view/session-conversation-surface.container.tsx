import { PerfProfiler } from '@/shared/lib/perf-profiler'
import type { SessionHarnessFacts } from '@/shared/types/harness-facts.types'
import { Button } from '@/shared/ui/button'
import type { ParallelWorkRow } from '@/shared/lib/parallel-work.pure'
import { type FC, type ReactNode } from 'react'
import type {
  ConversationItem,
  InteractionResponse,
  Session,
} from '@/entities/session'
import {
  ComposerContainer,
  type ComposerSessionContext,
} from '@/features/composer'
import {
  AnnotationSelectionCapture,
  AnnotationTray,
} from '@/features/response-annotations'
import { SessionTranscript } from './session-transcript.container'

interface SessionConversationSurfaceProps {
  compactions?: SessionHarnessFacts['compactions']
  parallelRows?: ParallelWorkRow[]
  parallelLoading?: boolean
  parallelError?: string | null
  onParallelRetry?: () => void
  onParallelSelect?: (id: string) => void
  navigationTarget?: { id: string; nonce: number } | null
  session: Session
  conversationItems: ConversationItem[]
  composerContext: ComposerSessionContext | null
  composerDisabledReason?: string | null
  onApprove: (
    sessionId: string,
    providerApprovalId?: string,
    options?: { scope: 'once' | 'session' },
  ) => void
  onDeny: (sessionId: string, providerApprovalId?: string) => void
  onInputAnswer: (
    sessionId: string,
    response: InteractionResponse,
    displayText: string,
  ) => void
}

export const SessionConversationSurface: FC<
  SessionConversationSurfaceProps
> = ({
  session,
  compactions,
  parallelRows,
  parallelLoading,
  parallelError,
  onParallelRetry,
  onParallelSelect,
  navigationTarget,
  conversationItems,
  composerContext,
  composerDisabledReason = null,
  onApprove,
  onDeny,
  onInputAnswer,
}) => {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {parallelError && (
        <div role="alert" className="px-4 py-2 text-sm text-muted-foreground">
          Parallel work could not be read ·{' '}
          <Button
            type="button"
            variant="link"
            className="h-auto p-0"
            onClick={onParallelRetry}
          >
            Retry
          </Button>
        </div>
      )}
      <SessionTranscript
        session={session}
        compactions={compactions}
        parallelRows={parallelRows}
        parallelLoading={parallelLoading}
        onParallelSelect={onParallelSelect}
        navigationTarget={navigationTarget}
        conversationItems={conversationItems}
        onApprove={onApprove}
        onDeny={onDeny}
        onInputAnswer={onInputAnswer}
      />

      {/*
        Both halves of Response Annotations are composed here, by the widget:
        the popover belongs to the transcript and the tray belongs above the
        composer, and neither feature may import the other (RA2 layering).
      */}
      <AnnotationSelectionCapture key={session.id} sessionId={session.id} />

      <div className="shrink-0 px-4 py-3">
        <AnnotationTray key={session.id} sessionId={session.id} />
        {renderComposerArea(composerContext, composerDisabledReason)}
      </div>
    </div>
  )
}

function renderComposerArea(
  composerContext: ComposerSessionContext | null,
  composerDisabledReason: string | null,
): ReactNode {
  if (composerDisabledReason) {
    return (
      <div className="mx-auto w-full max-w-2xl rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning-foreground">
        {composerDisabledReason}
      </div>
    )
  }

  return composerContext ? (
    <PerfProfiler id="composer">
      <ComposerContainer context={composerContext} />
    </PerfProfiler>
  ) : null
}
