import type { FC } from 'react'
import type { SkillSelection } from '@/entities/skill'
import {
  User,
  Bot,
  Wrench,
  Terminal,
  AlertTriangle,
  Info,
  ChevronRight,
  Library,
  FileText,
} from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { Markdown } from '@/shared/ui/markdown.container'
import {
  AttachmentChip,
  MissingAttachmentChip,
  type Attachment,
} from '@/entities/attachment'
import { ConversationItemShell } from './conversation-item-shell.presentational'
import { ConversationItemHeader } from './conversation-item-header.presentational'
import { ConversationItemTimestamp } from './conversation-item-timestamp.presentational'
import type { TranscriptEntryViewModel } from './transcript-entry.pure'

interface ConversationItemViewProps {
  viewModel: TranscriptEntryViewModel
  onApprove?: () => void
  onDeny?: () => void
  onAttachmentOpen?: (attachment: Attachment) => void
}

export const ConversationItemView: FC<ConversationItemViewProps> = ({
  viewModel,
  onApprove,
  onDeny,
  onAttachmentOpen,
}) => {
  const { item: entry } = viewModel

  switch (entry.kind) {
    case 'message':
      if (entry.actor === 'user') {
        const hasAttachments = viewModel.attachments.length > 0
        const hasMissing = viewModel.missingAttachmentIds.length > 0
        return (
          <ConversationItemShell copyText={viewModel.copyText}>
            <div className="flex gap-3 py-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <User className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <ConversationItemHeader
                  createdAt={entry.createdAt}
                  label={viewModel.label}
                  timing={viewModel.timing}
                >
                  {viewModel.deliveryModeLabel && (
                    <span
                      data-testid="user-message-delivery-mode"
                      className="inline-flex items-center rounded-full border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-warning-foreground"
                    >
                      {viewModel.deliveryModeLabel}
                    </span>
                  )}
                </ConversationItemHeader>
                {renderSkillSelections(entry.skillSelections)}
                {viewModel.injectedContextText ? (
                  <details
                    className="group/context mt-1 max-w-full"
                    data-testid="injected-context-details"
                  >
                    <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-full border border-border/70 bg-muted/30 px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground">
                      <FileText className="h-3 w-3" />
                      <span>Injected context</span>
                      <ChevronRight className="h-3 w-3 transition-transform group-open/context:rotate-90" />
                    </summary>
                    <pre className="app-scrollbar mt-2 max-h-56 overflow-auto rounded-md border border-border/70 bg-muted/20 p-3 font-mono text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap">
                      {viewModel.injectedContextText}
                    </pre>
                  </details>
                ) : null}
                <Markdown
                  className="mt-1 text-foreground"
                  content={viewModel.displayText}
                  size="sm"
                />
                {(hasAttachments || hasMissing) && (
                  <div
                    className="mt-2 flex flex-wrap gap-1.5"
                    data-testid="history-attachments"
                  >
                    {viewModel.attachments.map((attachment) => (
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
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-purple-600 text-white">
              <Bot className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <ConversationItemHeader
                createdAt={entry.createdAt}
                label={viewModel.label}
                timing={viewModel.timing}
              />
              <Markdown
                className="mt-1 text-foreground"
                content={entry.text}
                size="sm"
              />
            </div>
          </div>
        </ConversationItemShell>
      )

    case 'thinking':
      return (
        <ConversationItemShell copyText={viewModel.copyText}>
          <div className="flex gap-3 py-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Bot className="h-4 w-4" />
            </div>
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
      return (
        <ConversationItemShell copyText={viewModel.copyText}>
          <div className="flex gap-3 py-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
              <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1 pt-1">
              <ConversationItemTimestamp
                createdAt={entry.createdAt}
                timing={viewModel.timing}
                className="mb-1"
              />
              <details className="group min-w-0 rounded-md border border-border/60 bg-muted/20">
                <summary className="flex cursor-pointer list-none items-start gap-2 rounded-md px-2 py-1.5 pr-10 hover:bg-muted/40">
                  <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
                    {viewModel.toolPreview}
                  </span>
                </summary>
                <pre className="app-scrollbar overflow-x-auto border-t border-border/60 px-3 py-2 font-mono text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap">
                  {entry.inputText}
                </pre>
              </details>
            </div>
          </div>
        </ConversationItemShell>
      )

    case 'tool-result':
      return (
        <ConversationItemShell copyText={viewModel.copyText}>
          <div className="flex gap-3 py-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
              <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1 pt-1">
              <ConversationItemTimestamp
                createdAt={entry.createdAt}
                timing={viewModel.timing}
                className="mb-1"
              />
              <details className="group min-w-0 rounded-md border border-border/60 bg-muted/20">
                <summary className="flex cursor-pointer list-none items-start gap-2 rounded-md px-2 py-1.5 pr-10 hover:bg-muted/40">
                  <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
                    {viewModel.toolPreview}
                  </span>
                </summary>
                <pre className="app-scrollbar overflow-x-auto border-t border-border/60 px-3 py-2 font-mono text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap">
                  {entry.outputText}
                </pre>
              </details>
            </div>
          </div>
        </ConversationItemShell>
      )

    case 'approval-request':
      return (
        <ConversationItemShell copyText={viewModel.copyText}>
          <div className="my-2 rounded-lg border border-warning/30 bg-warning/5 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pr-8">
                  <p className="text-sm font-medium">Approval needed</p>
                  <ConversationItemTimestamp
                    createdAt={entry.createdAt}
                    timing={viewModel.timing}
                  />
                </div>
                <Markdown
                  className="mt-1 text-muted-foreground"
                  content={entry.description}
                  size="sm"
                />
                {viewModel.actionableApproval && onApprove && onDeny && (
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" onClick={onApprove}>
                      Approve
                    </Button>
                    <Button variant="ghost" size="sm" onClick={onDeny}>
                      Deny
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </ConversationItemShell>
      )

    case 'input-request':
      return (
        <ConversationItemShell copyText={viewModel.copyText}>
          <div className="my-2 rounded-lg border border-blue-500/30 bg-blue-500/5 p-4">
            <div className="flex items-start gap-3">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-500" />
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pr-8">
                  <p className="text-sm font-medium">Input needed</p>
                  <ConversationItemTimestamp
                    createdAt={entry.createdAt}
                    timing={viewModel.timing}
                  />
                </div>
                <Markdown
                  className="mt-1 text-muted-foreground"
                  content={entry.prompt}
                  size="sm"
                />
              </div>
            </div>
          </div>
        </ConversationItemShell>
      )

    case 'note':
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
        <span
          key={selection.id}
          className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs text-primary"
        >
          <Library className="h-3 w-3 shrink-0" />
          <span className="truncate">{selection.displayName}</span>
          <span className="shrink-0 text-[10px] uppercase text-primary/70">
            {selection.status}
          </span>
        </span>
      ))}
    </div>
  )
}
