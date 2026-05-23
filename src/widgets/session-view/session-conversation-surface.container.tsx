import { useMemo, useState, type FC, type ReactNode } from 'react'
import type {
  ConversationItem,
  InteractionResponse,
  Session,
} from '@/entities/session'
import {
  artifactFromConversationItem,
  type UiResponseArtifact,
} from '@/entities/ui-response-artifact'
import {
  ComposerContainer,
  type ComposerSessionContext,
} from '@/features/composer'
import { SessionTranscript } from './session-transcript.container'
import { UiResponsePanel } from './ui-response-panel.presentational'

interface SessionConversationSurfaceProps {
  session: Session
  conversationItems: ConversationItem[]
  composerContext: ComposerSessionContext | null
  composerDisabledReason?: string | null
  onApprove: (sessionId: string, providerApprovalId?: string) => void
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
  conversationItems,
  composerContext,
  composerDisabledReason = null,
  onApprove,
  onDeny,
  onInputAnswer,
}) => {
  const [selectedArtifactItemId, setSelectedArtifactItemId] = useState<
    string | null
  >(null)
  const artifacts = useMemo(
    () => findUiResponseArtifacts(conversationItems),
    [conversationItems],
  )
  const artifact =
    (selectedArtifactItemId
      ? artifacts.find(
          (entry) => entry.conversationItemId === selectedArtifactItemId,
        )
      : null) ??
    artifacts[artifacts.length - 1] ??
    null

  const conversationColumn = renderConversationColumn({
    session,
    conversationItems,
    composerContext,
    composerDisabledReason,
    selectedUiResponseItemId: artifact?.conversationItemId ?? null,
    onUiResponseArtifactSelect: setSelectedArtifactItemId,
    onApprove,
    onDeny,
    onInputAnswer,
  })

  if (!artifact) {
    return conversationColumn
  }

  return (
    <div
      className="flex min-h-0 flex-1 overflow-hidden"
      data-testid="session-ui-response-split"
    >
      <div className="flex min-w-0 flex-1 basis-1/2 flex-col border-r border-border">
        {conversationColumn}
      </div>
      <UiResponsePanel
        artifact={artifact}
        className="min-w-0 flex-1 basis-1/2"
      />
    </div>
  )
}

interface RenderConversationColumnInput {
  session: Session
  conversationItems: ConversationItem[]
  composerContext: ComposerSessionContext | null
  composerDisabledReason: string | null
  selectedUiResponseItemId: string | null
  onUiResponseArtifactSelect: (conversationItemId: string) => void
  onApprove: (sessionId: string, providerApprovalId?: string) => void
  onDeny: (sessionId: string, providerApprovalId?: string) => void
  onInputAnswer: (
    sessionId: string,
    response: InteractionResponse,
    displayText: string,
  ) => void
}

function renderConversationColumn({
  session,
  conversationItems,
  composerContext,
  composerDisabledReason,
  selectedUiResponseItemId,
  onUiResponseArtifactSelect,
  onApprove,
  onDeny,
  onInputAnswer,
}: RenderConversationColumnInput): ReactNode {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SessionTranscript
        session={session}
        conversationItems={conversationItems}
        selectedUiResponseItemId={selectedUiResponseItemId}
        onUiResponseArtifactSelect={onUiResponseArtifactSelect}
        onApprove={onApprove}
        onDeny={onDeny}
        onInputAnswer={onInputAnswer}
      />

      <div className="shrink-0 px-4 py-3">
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
    <ComposerContainer context={composerContext} />
  ) : null
}

function findUiResponseArtifacts(
  items: ConversationItem[],
): UiResponseArtifact[] {
  return items.flatMap((item) => {
    if (!item || item.kind !== 'message' || item.actor !== 'assistant') {
      return []
    }

    const artifact = artifactFromConversationItem({
      sessionId: item.sessionId,
      conversationItemId: item.id,
      text: item.text,
      createdAt: item.createdAt,
    })
    return artifact ? [artifact] : []
  })
}
