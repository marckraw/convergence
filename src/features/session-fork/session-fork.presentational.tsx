import type { FC } from 'react'
import { GitFork, RefreshCw } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'
import { Input } from '@/shared/ui/input'
import { Textarea } from '@/shared/ui/textarea'
import { cn } from '@/shared/lib/cn.pure'
import type {
  ForkStrategy,
  ProviderInfo,
  ReasoningEffort,
  ResolvedProviderSelection,
  WorkspaceMode,
} from '@/entities/session'
import { SessionStartSelect } from '@/features/session-start'
import type { PreviewState } from './session-fork.types'
import type { SeedSizeWarning } from './session-fork.pure'

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
  sizeWarning: SeedSizeWarning | null
  workspaceMode: WorkspaceMode
  workspaceBranchName: string
  additionalInstruction: string
  seedMarkdown: string
  preview: PreviewState
  isSubmitting: boolean
  submitError: string | null
  onNameChange: (value: string) => void
  onStrategyChange: (strategy: ForkStrategy) => void
  onProviderChange: (id: string) => void
  onModelChange: (id: string) => void
  onEffortChange: (id: ReasoningEffort | '') => void
  onWorkspaceModeChange: (mode: WorkspaceMode) => void
  onWorkspaceBranchNameChange: (value: string) => void
  onAdditionalInstructionChange: (value: string) => void
  onSeedMarkdownChange: (value: string) => void
  onRetryPreview: () => void
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
  sizeWarning,
  workspaceMode,
  workspaceBranchName,
  additionalInstruction,
  seedMarkdown,
  preview,
  isSubmitting,
  submitError,
  onNameChange,
  onStrategyChange,
  onProviderChange,
  onModelChange,
  onEffortChange,
  onWorkspaceModeChange,
  onWorkspaceBranchNameChange,
  onAdditionalInstructionChange,
  onSeedMarkdownChange,
  onRetryPreview,
  onConfirm,
  onCancel,
}) => {
  const providerItems = providers.map((provider) => ({
    id: provider.id,
    label: provider.vendorLabel || provider.name,
    description:
      provider.vendorLabel && provider.vendorLabel !== provider.name
        ? provider.name
        : undefined,
  }))
  const modelItems =
    selection.provider?.modelOptions.map((model) => ({
      id: model.id,
      label: model.label,
      description: model.id,
    })) ?? []
  const effortItems =
    selection.model?.effortOptions.map((effort) => ({
      id: effort.id,
      label: effort.label,
      description: effort.description,
    })) ?? []

  const canConfirm =
    !isSubmitting &&
    name.trim().length > 0 &&
    selection.providerId.length > 0 &&
    selection.modelId.length > 0 &&
    (workspaceMode === 'reuse' || workspaceBranchName.trim().length > 0) &&
    (strategy === 'full' ||
      (preview.status === 'ready' && seedMarkdown.trim().length > 0))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader className="border-b border-white/10 px-6 py-5">
          <DialogTitle className="flex items-center gap-2">
            <GitFork className="h-4 w-4" />
            Fork session
          </DialogTitle>
          <DialogDescription>
            Create a new session seeded from &quot;{parentName}&quot;.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 overflow-y-auto px-6 py-5">
          <section className="space-y-2">
            <label htmlFor="fork-name" className="text-sm font-medium">
              Name
            </label>
            <Input
              id="fork-name"
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              placeholder="Fork name"
              disabled={isSubmitting}
            />
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-medium">Strategy</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                type="button"
                variant={strategy === 'full' ? 'secondary' : 'outline'}
                className={cn(
                  'h-auto items-start justify-start px-3 py-3 text-left',
                  strategy === 'full' && 'ring-1 ring-ring',
                )}
                onClick={() => onStrategyChange('full')}
              >
                <span className="flex flex-col gap-1">
                  <span className="text-sm font-medium">Full transcript</span>
                  <span className="text-xs text-muted-foreground">
                    Paste the entire conversation verbatim.
                  </span>
                </span>
              </Button>
              <Button
                type="button"
                variant={strategy === 'summary' ? 'secondary' : 'outline'}
                disabled={!summaryAllowed}
                className={cn(
                  'h-auto items-start justify-start px-3 py-3 text-left',
                  strategy === 'summary' && 'ring-1 ring-ring',
                )}
                onClick={() => onStrategyChange('summary')}
              >
                <span className="flex flex-col gap-1">
                  <span className="text-sm font-medium">
                    Structured summary
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {summaryDisabledReason ??
                      'LLM extracts decisions, facts, and next steps.'}
                  </span>
                </span>
              </Button>
            </div>
            {strategy === 'full' && sizeWarning && (
              <div
                role="alert"
                data-testid="fork-size-warning"
                className="space-y-2 rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm text-amber-200"
              >
                <p>
                  Full transcript is approximately {sizeWarning.percentage}% of
                  the parent provider&apos;s context window (
                  {sizeWarning.estimatedTokens.toLocaleString()} /{' '}
                  {sizeWarning.windowTokens.toLocaleString()} tokens). The child
                  session may run out of room quickly.
                </p>
                {summaryAllowed && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onStrategyChange('summary')}
                  >
                    Switch to summary
                  </Button>
                )}
              </div>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-medium">Provider</h3>
            <div className="flex flex-wrap gap-2">
              <SessionStartSelect
                selectedId={selection.providerId}
                value={selection.providerLabel || 'Select provider'}
                items={providerItems}
                onChange={onProviderChange}
              />
              <SessionStartSelect
                selectedId={selection.modelId}
                value={selection.model?.label ?? 'Select model'}
                items={modelItems}
                onChange={onModelChange}
              />
              {effortItems.length > 0 && (
                <SessionStartSelect
                  selectedId={selection.effortId}
                  value={selection.effort?.label ?? 'Select effort'}
                  items={effortItems}
                  onChange={(id) => onEffortChange(id as ReasoningEffort)}
                />
              )}
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-medium">Workspace</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                type="button"
                variant={workspaceMode === 'reuse' ? 'secondary' : 'outline'}
                className={cn(
                  'h-auto items-start justify-start px-3 py-3 text-left',
                  workspaceMode === 'reuse' && 'ring-1 ring-ring',
                )}
                onClick={() => onWorkspaceModeChange('reuse')}
              >
                <span className="flex flex-col gap-1">
                  <span className="text-sm font-medium">Reuse workspace</span>
                  <span className="text-xs text-muted-foreground">
                    Share the parent&apos;s files and branch.
                  </span>
                </span>
              </Button>
              <Button
                type="button"
                variant={workspaceMode === 'fork' ? 'secondary' : 'outline'}
                className={cn(
                  'h-auto items-start justify-start px-3 py-3 text-left',
                  workspaceMode === 'fork' && 'ring-1 ring-ring',
                )}
                onClick={() => onWorkspaceModeChange('fork')}
              >
                <span className="flex flex-col gap-1">
                  <span className="text-sm font-medium">New workspace</span>
                  <span className="text-xs text-muted-foreground">
                    Create a fresh worktree on its own branch.
                  </span>
                </span>
              </Button>
            </div>
            {workspaceMode === 'fork' && (
              <Input
                value={workspaceBranchName}
                onChange={(event) =>
                  onWorkspaceBranchNameChange(event.target.value)
                }
                placeholder="fork/branch-name"
                disabled={isSubmitting}
              />
            )}
          </section>

          {strategy === 'summary' && (
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Summary preview</h3>
                {preview.status === 'error' && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onRetryPreview}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Retry
                  </Button>
                )}
              </div>
              {preview.status === 'loading' && (
                <p className="text-xs text-muted-foreground">
                  Extracting summary from parent transcript…
                </p>
              )}
              {preview.status === 'error' && (
                <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <p>{preview.message}</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onStrategyChange('full')}
                  >
                    Switch to full transcript
                  </Button>
                </div>
              )}
              {preview.status === 'ready' && (
                <Textarea
                  value={seedMarkdown}
                  onChange={(event) => onSeedMarkdownChange(event.target.value)}
                  className="min-h-[220px] font-mono text-xs"
                  disabled={isSubmitting}
                />
              )}
            </section>
          )}

          <section className="space-y-2">
            <label htmlFor="fork-instruction" className="text-sm font-medium">
              Additional instruction (optional)
            </label>
            <Input
              id="fork-instruction"
              value={additionalInstruction}
              onChange={(event) =>
                onAdditionalInstructionChange(event.target.value)
              }
              placeholder="What should the fork focus on?"
              disabled={isSubmitting}
            />
          </section>

          {submitError && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {submitError}
            </p>
          )}
        </div>

        <DialogFooter className="border-t border-white/10 px-6 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm} disabled={!canConfirm}>
            {isSubmitting ? 'Forking…' : 'Create fork'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
