import type { FC } from 'react'
import { GitFork, RefreshCw, Sparkles } from 'lucide-react'
import {
  Button,
  ChoiceCard,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogError,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Notice,
  RadioGroup,
  Textarea,
} from '@convergence/ui'
import type {
  ForkStrategy,
  ProviderInfo,
  ReasoningEffort,
  ResolvedProviderSelection,
  WorkspaceMode,
} from '@/entities/session'
import {
  AttachmentPreviewContainer,
  type Attachment,
  type AttachmentDraftController,
} from '@/entities/attachment'
import { ForkComposer } from './fork-composer.presentational'
import { ModelSelectorRow } from './model-selector-row.presentational'
import type { PreviewState } from './session-fork.types'
import type { ForkProgressLabel, SeedSizeWarning } from './session-fork.pure'

interface SessionForkDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  parentName: string
  name: string
  strategy: ForkStrategy
  summaryAllowed: boolean
  summaryDisabledReason: string | null
  providers: ProviderInfo[]
  selection: ResolvedProviderSelection
  summarizerSelection: ResolvedProviderSelection
  sizeWarning: SeedSizeWarning | null
  workspaceMode: WorkspaceMode
  workspaceBranchName: string
  additionalInstruction: string
  seedMarkdown: string
  preview: PreviewState
  progressLabel: ForkProgressLabel | null
  attachmentDraft: AttachmentDraftController
  previewAttachment: Attachment | null
  attachmentErrorByAttachmentId: Record<string, string>
  attachmentsValid: boolean
  isSubmitting: boolean
  submitError: string | null
  onNameChange: (value: string) => void
  onStrategyChange: (strategy: ForkStrategy) => void
  onProviderChange: (id: string) => void
  onModelChange: (id: string, providerId?: string) => void
  onEffortChange: (id: ReasoningEffort | '') => void
  onSummarizerProviderChange: (id: string) => void
  onSummarizerModelChange: (id: string, providerId?: string) => void
  onSummarizerEffortChange: (id: ReasoningEffort | '') => void
  onWorkspaceModeChange: (mode: WorkspaceMode) => void
  onWorkspaceBranchNameChange: (value: string) => void
  onAdditionalInstructionChange: (value: string) => void
  onSeedMarkdownChange: (value: string) => void
  onGenerateSummary: () => void
  onAttachmentOpen: (attachment: Attachment) => void
  onPreviewClose: () => void
  onConfirm: () => void
  onCancel: () => void
}

export const SessionForkDialog: FC<SessionForkDialogProps> = ({
  open,
  onOpenChange,
  parentName,
  name,
  strategy,
  summaryAllowed,
  summaryDisabledReason,
  providers,
  selection,
  summarizerSelection,
  sizeWarning,
  workspaceMode,
  workspaceBranchName,
  additionalInstruction,
  seedMarkdown,
  preview,
  progressLabel,
  attachmentDraft,
  previewAttachment,
  attachmentErrorByAttachmentId,
  attachmentsValid,
  isSubmitting,
  submitError,
  onNameChange,
  onStrategyChange,
  onProviderChange,
  onModelChange,
  onEffortChange,
  onSummarizerProviderChange,
  onSummarizerModelChange,
  onSummarizerEffortChange,
  onWorkspaceModeChange,
  onWorkspaceBranchNameChange,
  onAdditionalInstructionChange,
  onSeedMarkdownChange,
  onGenerateSummary,
  onAttachmentOpen,
  onPreviewClose,
  onConfirm,
  onCancel,
}) => {
  const canConfirm =
    !isSubmitting &&
    attachmentsValid &&
    name.trim().length > 0 &&
    selection.providerId.length > 0 &&
    selection.modelId.length > 0 &&
    (workspaceMode === 'reuse' || workspaceBranchName.trim().length > 0) &&
    (strategy === 'full' ||
      (preview.status === 'ready' && seedMarkdown.trim().length > 0))

  return (
    <Dialog open={open} onOpenChange={(open) => onOpenChange(open)}>
      {/* R11: today's 672 px is the nearest size, lg (720). */}
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitFork aria-hidden className="size-4" />
            Fork session
          </DialogTitle>
          <DialogDescription>
            Create a new session seeded from &quot;{parentName}&quot;.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-5">
          <section className="space-y-2">
            <label htmlFor="fork-name" className="text-sm font-medium">
              Name
            </label>
            <Input
              size="lg"
              id="fork-name"
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              placeholder="Fork name"
              disabled={isSubmitting}
            />
          </section>

          <section className="space-y-2">
            <h3 id="fork-strategy" className="text-sm font-medium">
              Strategy
            </h3>
            <RadioGroup
              aria-labelledby="fork-strategy"
              value={strategy}
              onValueChange={(value) => onStrategyChange(value as ForkStrategy)}
              className="grid gap-2 sm:grid-cols-2"
            >
              <ChoiceCard
                value="full"
                title="Full transcript"
                description="Paste the entire conversation verbatim."
              />
              <ChoiceCard
                value="summary"
                disabled={!summaryAllowed}
                title="Structured summary"
                description={
                  summaryDisabledReason ??
                  'LLM extracts decisions, facts, and next steps.'
                }
              />
            </RadioGroup>
            {strategy === 'full' && sizeWarning && (
              <Notice
                tone="warning"
                data-testid="fork-size-warning"
                title={`Full transcript is approximately ${sizeWarning.percentage}% of the parent provider's context window (${sizeWarning.estimatedTokens.toLocaleString()} / ${sizeWarning.windowTokens.toLocaleString()} tokens).`}
                actions={
                  summaryAllowed ? (
                    <Button
                      variant="secondary"
                      onClick={() => onStrategyChange('summary')}
                    >
                      Switch to summary
                    </Button>
                  ) : undefined
                }
              >
                The child session may run out of room quickly.
              </Notice>
            )}
          </section>

          <section className="space-y-2">
            <label htmlFor="fork-instruction" className="text-sm font-medium">
              Additional instruction (optional)
            </label>
            <ForkComposer
              textareaId="fork-instruction"
              value={additionalInstruction}
              onChange={onAdditionalInstructionChange}
              disabled={isSubmitting}
              attachmentDraft={attachmentDraft}
              attachmentErrorByAttachmentId={attachmentErrorByAttachmentId}
              onAttachmentOpen={onAttachmentOpen}
              providers={providers}
              selection={selection}
              onProviderChange={onProviderChange}
              onModelChange={onModelChange}
              onEffortChange={onEffortChange}
            />
          </section>

          <section className="space-y-2">
            <h3 id="fork-workspace" className="text-sm font-medium">
              Workspace
            </h3>
            <RadioGroup
              aria-labelledby="fork-workspace"
              value={workspaceMode}
              onValueChange={(value) =>
                onWorkspaceModeChange(value as WorkspaceMode)
              }
              className="grid gap-2 sm:grid-cols-2"
            >
              <ChoiceCard
                value="reuse"
                title="Reuse workspace"
                description="Share the parent's files and branch."
              />
              <ChoiceCard
                value="fork"
                title="New workspace"
                description="Create a fresh worktree on its own branch."
              />
            </RadioGroup>
            {workspaceMode === 'fork' && (
              <Input
                size="lg"
                value={workspaceBranchName}
                onChange={(event) =>
                  onWorkspaceBranchNameChange(event.target.value)
                }
                placeholder="fork/branch-name"
                aria-label="New workspace branch"
                disabled={isSubmitting}
              />
            )}
          </section>

          {strategy === 'summary' && (
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Summary preview</h3>
                {(preview.status === 'ready' || preview.status === 'error') && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={onGenerateSummary}
                    disabled={isSubmitting}
                  >
                    <RefreshCw aria-hidden />
                    {preview.status === 'error' ? 'Retry' : 'Regenerate'}
                  </Button>
                )}
              </div>
              <div className="space-y-1">
                <p className="text-xs text-ink-muted">Summarize with</p>
                <div className="flex flex-wrap items-center gap-1">
                  <ModelSelectorRow
                    providers={providers}
                    selection={summarizerSelection}
                    onProviderChange={onSummarizerProviderChange}
                    onModelChange={onSummarizerModelChange}
                    onEffortChange={onSummarizerEffortChange}
                  />
                </div>
              </div>
              {preview.status === 'idle' && (
                <div className="space-y-2" data-testid="fork-preview-idle">
                  <p className="text-xs text-ink-muted">
                    Summarise the parent transcript into a structured seed.
                    Nothing runs until you generate it.
                  </p>
                  <Button
                    type="button"
                    variant="tonal"
                    onClick={onGenerateSummary}
                    disabled={isSubmitting}
                  >
                    <Sparkles aria-hidden />
                    Generate summary
                  </Button>
                </div>
              )}
              {preview.status === 'loading' && (
                <div className="space-y-1" data-testid="fork-preview-progress">
                  <p className="text-xs text-ink-muted">
                    {progressLabel?.primary ??
                      'Extracting summary from parent transcript…'}
                  </p>
                  {progressLabel?.secondary && (
                    <p className="text-xs text-ink-muted">
                      {progressLabel.secondary}
                    </p>
                  )}
                  {progressLabel?.stale && (
                    <Notice
                      tone="warning"
                      data-testid="fork-preview-stale"
                      className="text-xs"
                      title="No output in the last 30s. The provider may be stuck."
                    />
                  )}
                </div>
              )}
              {preview.status === 'error' && (
                <Notice
                  tone="danger"
                  title="Couldn't summarise the transcript"
                  actions={
                    <Button
                      variant="secondary"
                      onClick={() => onStrategyChange('full')}
                    >
                      Switch to full transcript
                    </Button>
                  }
                >
                  {preview.message}
                </Notice>
              )}
              {preview.status === 'ready' && (
                <Textarea
                  aria-label="Summary seed"
                  value={seedMarkdown}
                  onChange={(event) => onSeedMarkdownChange(event.target.value)}
                  className="min-h-55 font-mono text-xs"
                  disabled={isSubmitting}
                />
              )}
            </section>
          )}
        </DialogBody>

        <DialogError className="pt-3">{submitError}</DialogError>
        <DialogFooter>
          <Button
            variant="secondary"
            onClick={onCancel}
            disabled={isSubmitting}
            size="lg"
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={!canConfirm}
            pending={isSubmitting}
            pendingLabel="Forking…"
            size="lg"
          >
            Create fork
          </Button>
        </DialogFooter>
        <AttachmentPreviewContainer
          attachment={previewAttachment}
          onClose={onPreviewClose}
        />
      </DialogContent>
    </Dialog>
  )
}
