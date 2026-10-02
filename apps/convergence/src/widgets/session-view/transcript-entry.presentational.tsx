import type { CSSProperties, FC, ReactNode } from 'react'
import type {
  ConversationNoteAction,
  InteractionResponse,
} from '@/entities/session'
import type { SkillSelection } from '@/entities/skill'
import {
  User,
  Bot,
  Wrench,
  Terminal,
  AlertTriangle,
  Info,
  Library,
  FileText,
  Link,
  RotateCcw,
  Shuffle,
} from 'lucide-react'
import {
  Badge,
  Button,
  Chip,
  cn,
  CodeBlock,
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
  Divider,
} from '@convergence/ui'
import { Markdown } from '@/shared/ui/markdown.container'
import { ANNOTATION_MESSAGE_ID_ATTRIBUTE } from '@/features/response-annotations'
import {
  AttachmentChip,
  AttachmentInlinePreview,
  MissingAttachmentChip,
  type Attachment,
} from '@/entities/attachment'
import { ConversationItemShell } from './conversation-item-shell.presentational'
import { ConversationItemHeader } from './conversation-item-header.presentational'
import { ConversationItemTimestamp } from './conversation-item-timestamp.presentational'
import { ToolVisibilityBadge } from './tool-visibility-badge.presentational'
import { RequestCard } from './request-card.presentational'
import { ChoiceRequestForm } from './choice-request-form.presentational'
import { PlanRequestForm } from './plan-request-form.presentational'
import { FormRequestForm } from './form-request-form.presentational'
import { UrlRequestForm } from './url-request-form.presentational'
import type { TranscriptEntryViewModel } from './transcript-entry.pure'
import {
  agentAttributionLabel,
  approvalCardTitle,
  inputCardTitle,
} from './request-card.pure'

interface ConversationItemViewProps {
  viewModel: TranscriptEntryViewModel
  onApprove?: () => void
  onApproveSession?: () => void
  onDeny?: () => void
  onInputAnswer?: (response: InteractionResponse, displayText: string) => void
  onAttachmentOpen?: (attachment: Attachment) => void
  /**
   * Runs a note's offered action (PA11). Optional: a surface that cannot honour
   * it renders the note without the control rather than a dead button.
   */
  onNoteAction?: (action: ConversationNoteAction) => void
}

const attentionPromptMarkdownClassName =
  'mt-1 max-w-full text-muted-foreground [overflow-wrap:anywhere] [&_*]:max-w-full [&_*]:[overflow-wrap:anywhere] [&_code]:whitespace-pre-wrap'

function getHistoryImageAttachmentsClassName(count: number): string {
  return cn(
    'mt-2 grid max-w-full gap-2',
    count === 1 && 'grid-cols-1 sm:max-w-md',
    count === 2 && 'sm:max-w-144',
    count >= 3 && 'sm:max-w-220',
  )
}

/**
 * Two or more images: equal columns at least 14 rem (spacing 56) wide, as many
 * as fit. A layout formula, not a size, so it is a style on the spacing scale
 * rather than an arbitrary class.
 */
function getHistoryImageAttachmentsStyle(
  count: number,
): CSSProperties | undefined {
  if (count < 2) return undefined
  return {
    gridTemplateColumns:
      'repeat(auto-fit, minmax(min(100%, calc(var(--spacing) * 56)), 1fr))',
  }
}

/** Who speaks a transcript entry: a 28 px disc with its glyph (CONV-11). */
const AVATARS = {
  user: 'bg-strong text-on-strong',
  agent: 'bg-avatar-agent text-on-avatar-agent',
  quiet: 'bg-surface-muted text-ink-muted',
} as const

function renderAvatar(of: keyof typeof AVATARS, children: ReactNode) {
  return (
    <div
      aria-hidden
      className={cn(
        'flex size-7 shrink-0 items-center justify-center rounded-full',
        AVATARS[of],
      )}
    >
      {children}
    </div>
  )
}

/** The pill a folded block opens from: injected context, requested prompts. */
const foldPill =
  'rounded-full border border-line-soft px-2 py-0.5 text-xs text-ink-muted hover:bg-fill-hover hover:text-ink'

/** "↳ description (type)": which subagent made it. */
function renderAgentAttribution(
  attribution: Parameters<typeof agentAttributionLabel>[0],
) {
  return (
    <div className="mb-1 truncate text-xs text-muted-foreground">
      {agentAttributionLabel(attribution)}
    </div>
  )
}

/**
 * A tool call or its result (CONV-11): a disc, the time and the visibility
 * badge, and the call folded to one line that opens on the whole text.
 */
function renderToolEntry({
  viewModel,
  icon,
  text,
  attribution,
}: {
  viewModel: TranscriptEntryViewModel
  icon: ReactNode
  text: string
  attribution?: ReactNode
}) {
  const { item: entry } = viewModel
  return (
    <ConversationItemShell copyText={viewModel.copyText}>
      <div className="flex gap-3 py-2">
        {renderAvatar('quiet', icon)}
        <div className="min-w-0 flex-1 pt-1">
          {attribution}
          <div className="mb-1 flex min-w-0 flex-wrap items-center gap-1.5">
            <ConversationItemTimestamp
              createdAt={entry.createdAt}
              timing={viewModel.timing}
            />
            <ToolVisibilityBadge
              label={viewModel.toolVisibilityLabel}
              title={viewModel.toolVisibilityTitle}
            />
          </div>
          <Collapsible className="min-w-0">
            <CollapsibleTrigger className="flex w-full gap-2 rounded-md border border-line-soft bg-surface-muted/20 px-2 py-1.5 pr-10 text-ink-muted hover:bg-fill-hover">
              <span className="min-w-0 flex-1 truncate font-mono text-xs">
                {viewModel.toolPreview}
              </span>
            </CollapsibleTrigger>
            <CollapsiblePanel keepMounted>
              <CodeBlock
                label={
                  entry.kind === 'tool-call' ? 'Tool input' : 'Tool output'
                }
                wrap
                className="mt-1"
              >
                {text}
              </CodeBlock>
            </CollapsiblePanel>
          </Collapsible>
        </div>
      </div>
    </ConversationItemShell>
  )
}

/** A boundary across the transcript: a restart, a model change (CONV-13). */
function renderBoundary({
  testId,
  icon,
  tone,
  children,
}: {
  testId: string
  icon: ReactNode
  tone: 'warning' | 'info'
  children: ReactNode
}) {
  return (
    <Divider
      data-testid={testId}
      className={cn(
        'py-3 text-2xs leading-snug',
        tone === 'warning' ? 'text-warning-ink' : 'text-info-ink',
      )}
      label={
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="flex shrink-0 [&_svg]:size-3">
            {icon}
          </span>
          {children}
        </span>
      }
    />
  )
}

export const ConversationItemView: FC<ConversationItemViewProps> = ({
  viewModel,
  onApprove,
  onApproveSession,
  onDeny,
  onInputAnswer,
  onAttachmentOpen,
  onNoteAction,
}) => {
  const { item: entry } = viewModel

  switch (entry.kind) {
    case 'message':
      if (entry.actor === 'user') {
        const imageAttachments = viewModel.attachments.filter(
          (attachment) => attachment.kind === 'image',
        )
        const chipAttachments = viewModel.attachments.filter(
          (attachment) => attachment.kind !== 'image',
        )
        const hasImageAttachments = imageAttachments.length > 0
        const hasChipAttachments = chipAttachments.length > 0
        const hasMissing = viewModel.missingAttachmentIds.length > 0
        return (
          <ConversationItemShell copyText={viewModel.copyText}>
            <div className="flex gap-3 py-3">
              {renderAvatar('user', <User className="size-4" />)}
              <div className="min-w-0 flex-1 pt-0.5">
                <ConversationItemHeader
                  createdAt={entry.createdAt}
                  label={viewModel.label}
                  timing={viewModel.timing}
                >
                  {viewModel.deliveryModeLabel && (
                    <Badge
                      tone="warning"
                      data-testid="user-message-delivery-mode"
                      className="font-medium uppercase tracking-eyebrow"
                    >
                      {viewModel.deliveryModeLabel}
                    </Badge>
                  )}
                </ConversationItemHeader>
                {renderSkillSelections(entry.skillSelections)}
                {viewModel.injectedContextText ? (
                  <Collapsible
                    className="mt-1 max-w-full"
                    data-testid="injected-context-details"
                  >
                    <CollapsibleTrigger
                      chevron="end"
                      className={cn(foldPill, 'gap-1.5 bg-surface-muted/30')}
                    >
                      <FileText aria-hidden className="size-3" />
                      <span>Injected context</span>
                    </CollapsibleTrigger>
                    <CollapsiblePanel keepMounted>
                      <CodeBlock label="Injected context" wrap className="mt-2">
                        {viewModel.injectedContextText}
                      </CodeBlock>
                    </CollapsiblePanel>
                  </Collapsible>
                ) : null}
                <Markdown
                  className="mt-1 text-foreground"
                  content={viewModel.displayText}
                  size="sm"
                />
                {hasImageAttachments && (
                  <div
                    className={getHistoryImageAttachmentsClassName(
                      imageAttachments.length,
                    )}
                    style={getHistoryImageAttachmentsStyle(
                      imageAttachments.length,
                    )}
                    data-testid="history-image-attachments"
                  >
                    {imageAttachments.map((attachment) => (
                      <AttachmentInlinePreview
                        key={attachment.id}
                        attachment={attachment}
                        onOpen={onAttachmentOpen ?? (() => {})}
                      />
                    ))}
                  </div>
                )}
                {(hasChipAttachments || hasMissing) && (
                  <div
                    className="mt-2 flex flex-wrap gap-1.5"
                    data-testid="history-attachments"
                  >
                    {chipAttachments.map((attachment) => (
                      <AttachmentChip
                        key={attachment.id}
                        attachment={attachment}
                        onOpen={onAttachmentOpen ?? (() => {})}
                      />
                    ))}
                    {viewModel.missingAttachmentIds.map((id) => (
                      <MissingAttachmentChip key={id} attachmentId={id} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </ConversationItemShell>
        )
      }

      return (
        <ConversationItemShell copyText={viewModel.copyText}>
          <div className="flex gap-3 py-3">
            {renderAvatar('agent', <Bot className="size-4" />)}
            <div className="min-w-0 flex-1 pt-0.5">
              <ConversationItemHeader
                createdAt={entry.createdAt}
                label={viewModel.label}
                timing={viewModel.timing}
              />
              {/*
                Marks this message as annotatable (RA2). Only when it is
                finished: a streaming message has no attribute, so selecting
                inside it offers nothing — ruling 5 enforced by absence rather
                than by a condition somebody has to remember. The wrapper sits
                around the message text alone so a quote's surrounding context
                is the agent's words, not the header's.
              */}
              <div
                {...(entry.state === 'complete'
                  ? { [ANNOTATION_MESSAGE_ID_ATTRIBUTE]: entry.id }
                  : {})}
              >
                <Markdown
                  className="mt-1 text-foreground"
                  content={viewModel.displayText}
                  size="sm"
                />
              </div>
            </div>
          </div>
        </ConversationItemShell>
      )

    case 'thinking':
      return (
        <ConversationItemShell copyText={viewModel.copyText}>
          <div className="flex gap-3 py-3">
            {renderAvatar('quiet', <Bot className="size-4" />)}
            <div className="min-w-0 flex-1 pt-0.5">
              <ConversationItemHeader
                createdAt={entry.createdAt}
                label={viewModel.label}
                timing={viewModel.timing}
              />
              <Markdown
                className="mt-1 italic text-muted-foreground"
                content={entry.text}
                size="sm"
              />
            </div>
          </div>
        </ConversationItemShell>
      )

    case 'tool-call':
      return renderToolEntry({
        viewModel,
        icon: <Wrench className="size-3.5" />,
        text: entry.inputText,
        attribution: entry.agentRunId
          ? renderAgentAttribution(entry.agentAttribution)
          : undefined,
      })

    case 'tool-result':
      return renderToolEntry({
        viewModel,
        icon: <Terminal className="size-3.5" />,
        text: entry.outputText,
      })

    case 'approval-request':
      return (
        <ConversationItemShell copyText={viewModel.copyText}>
          {entry.agentRunId && renderAgentAttribution(entry.agentAttribution)}
          <RequestCard
            testId="approval-request-card"
            title={approvalCardTitle(entry.resolution)}
            icon={<AlertTriangle />}
            timestamp={
              <ConversationItemTimestamp
                createdAt={entry.createdAt}
                timing={viewModel.timing}
              />
            }
          >
            <Markdown
              className={attentionPromptMarkdownClassName}
              content={entry.description}
              size="sm"
            />
            {entry.permissionDetails && (
              <p className="mt-1 break-words text-xs text-muted-foreground">
                {[
                  entry.permissionDetails.blockedPath,
                  entry.permissionDetails.decisionReason,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            )}
            {viewModel.actionableApproval && onApprove && onDeny && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button onClick={onApprove}>Approve</Button>
                {entry.supportsSessionApproval && onApproveSession && (
                  <Button variant="tonal" onClick={onApproveSession}>
                    Always allow (this session)
                  </Button>
                )}
                {/* R10: a permission is refused with Deny. */}
                <Button variant="ghost" onClick={onDeny}>
                  Deny
                </Button>
              </div>
            )}
          </RequestCard>
        </ConversationItemShell>
      )

    case 'input-request':
      return (
        <ConversationItemShell copyText={viewModel.copyText}>
          <RequestCard
            title={inputCardTitle(entry.request?.kind)}
            icon={
              entry.request?.kind === 'plan' ? (
                <FileText />
              ) : entry.request?.kind === 'form' ||
                entry.request?.kind === 'url' ? (
                <Link />
              ) : (
                <Info />
              )
            }
            timestamp={
              <ConversationItemTimestamp
                createdAt={entry.createdAt}
                timing={viewModel.timing}
              />
            }
          >
            {entry.request?.kind === 'plan' ? (
              <>
                {entry.request.planPath ? (
                  <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                    {entry.request.planPath}
                  </p>
                ) : null}
                <Markdown
                  className={attentionPromptMarkdownClassName}
                  content={entry.request.plan}
                  size="sm"
                />
                {entry.request.allowedPrompts &&
                entry.request.allowedPrompts.length > 0 ? (
                  <Collapsible className="mt-3 max-w-full">
                    <CollapsibleTrigger
                      className={cn(foldPill, 'gap-1.5 bg-canvas/60')}
                    >
                      Requested prompts
                    </CollapsibleTrigger>
                    <CollapsiblePanel keepMounted>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-ink-muted">
                        {entry.request.allowedPrompts.map((prompt) => (
                          <li key={prompt}>{prompt}</li>
                        ))}
                      </ul>
                    </CollapsiblePanel>
                  </Collapsible>
                ) : null}
                {viewModel.actionableInput && onInputAnswer ? (
                  <PlanRequestForm onSubmit={onInputAnswer} />
                ) : null}
              </>
            ) : entry.request?.kind === 'form' ? (
              <>
                <p className="mt-1 break-words text-sm font-medium">
                  {entry.request.title}
                </p>
                <Markdown
                  className={attentionPromptMarkdownClassName}
                  content={entry.request.message}
                  size="sm"
                />
                {viewModel.actionableInput && onInputAnswer ? (
                  <FormRequestForm
                    fields={entry.request.fields}
                    onSubmit={onInputAnswer}
                  />
                ) : null}
              </>
            ) : entry.request?.kind === 'url' ? (
              <>
                <p className="mt-1 break-words text-sm font-medium">
                  {entry.request.title}
                </p>
                <Markdown
                  className={attentionPromptMarkdownClassName}
                  content={entry.request.message}
                  size="sm"
                />
                <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
                  {entry.request.url}
                </p>
                {viewModel.actionableInput && onInputAnswer ? (
                  <UrlRequestForm onSubmit={onInputAnswer} />
                ) : null}
              </>
            ) : (
              <>
                <Markdown
                  className={attentionPromptMarkdownClassName}
                  content={entry.prompt}
                  size="sm"
                />
                {entry.request?.kind === 'choice' &&
                  viewModel.actionableInput &&
                  onInputAnswer && (
                    <ChoiceRequestForm
                      questions={entry.request.questions}
                      onSubmit={onInputAnswer}
                    />
                  )}
              </>
            )}
          </RequestCard>
        </ConversationItemShell>
      )

    case 'note':
      // A restarted conversation is a boundary, not a remark: the model's
      // memory of everything above it is gone, and a quiet italic line in a
      // long transcript is exactly the kind of thing a reader scrolls past.
      // The tag is written by the provider adapters
      // (electron/backend/provider/session-restart.pure.ts).
      if (entry.providerMeta?.providerEventType === 'session.restarted') {
        return (
          <ConversationItemShell copyText={viewModel.copyText}>
            {renderBoundary({
              testId: 'session-restart-boundary',
              tone: 'warning',
              icon: <RotateCcw />,
              children: entry.text,
            })}
          </ConversationItemShell>
        )
      }

      // A model swap is the same class of boundary seen from the other side:
      // the continuity is real, the author is not. Blue rather than the restart
      // amber, because nothing was lost — the conversation carries on, it is
      // just written by someone else from here down. The tag is written by the
      // session service (electron/backend/session/session-model-change.pure.ts).
      if (entry.providerMeta?.providerEventType === 'session.model-changed') {
        return (
          <ConversationItemShell copyText={viewModel.copyText}>
            {renderBoundary({
              testId: 'session-model-change-boundary',
              tone: 'info',
              icon: <Shuffle />,
              children: entry.text,
            })}
          </ConversationItemShell>
        )
      }

      return (
        <ConversationItemShell copyText={viewModel.copyText}>
          <div className="py-2 text-center">
            <ConversationItemTimestamp
              createdAt={entry.createdAt}
              timing={viewModel.timing}
              className="mb-1 justify-center"
            />
            <Markdown
              className="text-xs italic text-muted-foreground"
              content={entry.text}
              size="sm"
            />
            {entry.action && onNoteAction ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => onNoteAction(entry.action!)}
                className="mt-2"
              >
                Authorize for this account
              </Button>
            ) : null}
          </div>
        </ConversationItemShell>
      )

    default:
      return null
  }
}

function renderSkillSelections(selections: SkillSelection[] | undefined) {
  if (!selections || selections.length === 0) {
    return null
  }

  return (
    <div
      className="mt-1 flex flex-wrap gap-1.5"
      data-testid="message-skill-selections"
    >
      {selections.map((selection) => (
        <Chip key={selection.id} icon={<Library />}>
          {selection.displayName}
          <span className="ml-1.5 text-3xs uppercase">{selection.status}</span>
        </Chip>
      ))}
    </div>
  )
}
