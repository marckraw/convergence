import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FC,
  type ReactNode,
} from 'react'
import type {
  ConversationItem,
  InteractionResponse,
  Session,
} from '@/entities/session'
import {
  sessionHtmlOutputApi,
  type SessionHtmlOutput,
} from '@/entities/session-html-output'
import {
  artifactFromConversationItem,
  type UiResponseArtifact,
} from '@/entities/ui-response-artifact'
import {
  ComposerContainer,
  type ComposerSessionContext,
} from '@/features/composer'
import { SessionTranscript } from './session-transcript.container'
import { SessionHtmlOutputPanel } from './session-html-output-panel.presentational'
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
  const [selectedHtmlOutputId, setSelectedHtmlOutputId] = useState<
    string | null
  >(null)
  const [htmlOutputs, setHtmlOutputs] = useState<SessionHtmlOutput[]>([])
  const [htmlPreview, setHtmlPreview] = useState<{
    outputId: string
    html: string | null
    isLoading: boolean
    error: string | null
  } | null>(null)
  const artifacts = useMemo(
    () => findUiResponseArtifacts(conversationItems),
    [conversationItems],
  )
  const refreshHtmlOutputs = useCallback(async () => {
    try {
      const outputs = await sessionHtmlOutputApi.list(session.id)
      setHtmlOutputs(outputs)
    } catch {
      setHtmlOutputs([])
    }
  }, [session.id])

  useEffect(() => {
    setHtmlOutputs([])
    setSelectedHtmlOutputId(null)
    setHtmlPreview(null)
    void refreshHtmlOutputs()
  }, [refreshHtmlOutputs])

  useEffect(() => {
    void refreshHtmlOutputs()
  }, [conversationItems.length, refreshHtmlOutputs])

  useEffect(() => {
    if (!session.htmlModeEnabled && session.status !== 'running') return
    const interval = window.setInterval(() => {
      void refreshHtmlOutputs()
    }, 2000)
    return () => window.clearInterval(interval)
  }, [refreshHtmlOutputs, session.htmlModeEnabled, session.status])

  const htmlOutputByItemId = useMemo(
    () => buildHtmlOutputByItemId(htmlOutputs),
    [htmlOutputs],
  )
  const selectedHtmlOutput = selectedHtmlOutputId
    ? (htmlOutputs.find((output) => output.id === selectedHtmlOutputId) ?? null)
    : null
  useEffect(() => {
    if (!selectedHtmlOutput || selectedHtmlOutput.status !== 'ready') {
      setHtmlPreview(
        selectedHtmlOutput
          ? {
              outputId: selectedHtmlOutput.id,
              html: null,
              isLoading: false,
              error: null,
            }
          : null,
      )
      return
    }

    let cancelled = false
    setHtmlPreview({
      outputId: selectedHtmlOutput.id,
      html: null,
      isLoading: true,
      error: null,
    })
    void sessionHtmlOutputApi
      .readHtml(selectedHtmlOutput.id)
      .then((html) => {
        if (cancelled) return
        setHtmlPreview({
          outputId: selectedHtmlOutput.id,
          html,
          isLoading: false,
          error: null,
        })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setHtmlPreview({
          outputId: selectedHtmlOutput.id,
          html: null,
          isLoading: false,
          error: error instanceof Error ? error.message : String(error),
        })
      })

    return () => {
      cancelled = true
    }
  }, [selectedHtmlOutput])

  const handleUiResponseArtifactSelect = useCallback(
    (conversationItemId: string) => {
      setSelectedHtmlOutputId(null)
      setSelectedArtifactItemId(conversationItemId)
    },
    [],
  )
  const handleHtmlOutputSelect = useCallback((output: SessionHtmlOutput) => {
    setSelectedArtifactItemId(null)
    setSelectedHtmlOutputId(output.id)
  }, [])
  const handleOpenHtmlOutputInBrowser = useCallback(
    (output: SessionHtmlOutput) => {
      void sessionHtmlOutputApi.openInBrowser(output.id)
    },
    [],
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
    htmlOutputByItemId,
    selectedHtmlOutputItemId: selectedHtmlOutput?.sourceItemId ?? null,
    onUiResponseArtifactSelect: handleUiResponseArtifactSelect,
    onHtmlOutputSelect: handleHtmlOutputSelect,
    onApprove,
    onDeny,
    onInputAnswer,
  })

  if (selectedHtmlOutput) {
    return (
      <div
        className="flex min-h-0 flex-1 overflow-hidden"
        data-testid="session-html-output-split"
      >
        <div className="flex min-w-0 flex-1 basis-1/2 flex-col border-r border-border">
          {conversationColumn}
        </div>
        <SessionHtmlOutputPanel
          output={selectedHtmlOutput}
          html={
            htmlPreview?.outputId === selectedHtmlOutput.id
              ? htmlPreview.html
              : null
          }
          isLoading={
            htmlPreview?.outputId === selectedHtmlOutput.id
              ? htmlPreview.isLoading
              : false
          }
          error={
            htmlPreview?.outputId === selectedHtmlOutput.id
              ? htmlPreview.error
              : null
          }
          onOpenInBrowser={handleOpenHtmlOutputInBrowser}
          className="min-w-0 flex-1 basis-1/2"
        />
      </div>
    )
  }

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
  htmlOutputByItemId: Record<string, SessionHtmlOutput>
  selectedHtmlOutputItemId: string | null
  onUiResponseArtifactSelect: (conversationItemId: string) => void
  onHtmlOutputSelect: (output: SessionHtmlOutput) => void
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
  htmlOutputByItemId,
  selectedHtmlOutputItemId,
  onUiResponseArtifactSelect,
  onHtmlOutputSelect,
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
        htmlOutputByItemId={htmlOutputByItemId}
        selectedHtmlOutputItemId={selectedHtmlOutputItemId}
        onUiResponseArtifactSelect={onUiResponseArtifactSelect}
        onHtmlOutputSelect={onHtmlOutputSelect}
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

function buildHtmlOutputByItemId(
  outputs: SessionHtmlOutput[],
): Record<string, SessionHtmlOutput> {
  const byItemId: Record<string, SessionHtmlOutput> = {}
  for (const output of outputs) {
    if (!output.sourceItemId) continue
    const existing = byItemId[output.sourceItemId]
    if (existing?.kind === 'living') continue
    if (existing && output.kind !== 'living') continue
    byItemId[output.sourceItemId] = output
  }
  return byItemId
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
