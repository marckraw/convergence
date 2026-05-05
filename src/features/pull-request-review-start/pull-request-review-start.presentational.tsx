import type { FC } from 'react'
import { GitBranch, GitPullRequest, Loader2 } from 'lucide-react'
import type {
  ProviderInfo,
  ReasoningEffort,
  ResolvedProviderSelection,
} from '@/entities/session'
import type { PullRequestReviewPreview } from '@/entities/pull-request'
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
import { SessionStartSelect } from '@/features/session-start'

interface PullRequestReviewStartDialogProps {
  open: boolean
  projectName: string | null
  reference: string
  sessionName: string
  providers: ProviderInfo[]
  selection: ResolvedProviderSelection
  preview: PullRequestReviewPreview | null
  isPreviewing: boolean
  isSubmitting: boolean
  error: string | null
  onOpenChange: (open: boolean) => void
  onReferenceChange: (value: string) => void
  onSessionNameChange: (value: string) => void
  onProviderChange: (id: string) => void
  onModelChange: (id: string) => void
  onEffortChange: (id: ReasoningEffort | '') => void
  onPreview: () => void
  onSubmit: () => void
}

export const PullRequestReviewStartDialog: FC<
  PullRequestReviewStartDialogProps
> = ({
  open,
  projectName,
  reference,
  sessionName,
  providers,
  selection,
  preview,
  isPreviewing,
  isSubmitting,
  error,
  onOpenChange,
  onReferenceChange,
  onSessionNameChange,
  onProviderChange,
  onModelChange,
  onEffortChange,
  onPreview,
  onSubmit,
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

  const canPreview = reference.trim().length > 0 && !isPreviewing
  const canSubmit =
    !!preview &&
    sessionName.trim().length > 0 &&
    selection.providerId.length > 0 &&
    selection.modelId.length > 0 &&
    !isPreviewing &&
    !isSubmitting

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader className="border-b border-white/10 px-6 py-5">
          <DialogTitle className="flex items-center gap-2">
            <GitPullRequest className="h-4 w-4" />
            Review pull request
          </DialogTitle>
          <DialogDescription>
            Prepare a local workspace and start an agent review session
            {projectName ? ` for ${projectName}` : ''}.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (preview) onSubmit()
            else if (canPreview) onPreview()
          }}
        >
          <div className="space-y-5 overflow-y-auto px-6 py-5">
            <section className="space-y-2">
              <label htmlFor="pr-reference" className="text-sm font-medium">
                Pull request
              </label>
              <div className="flex gap-2">
                <Input
                  id="pr-reference"
                  value={reference}
                  onChange={(event) => onReferenceChange(event.target.value)}
                  placeholder="123, #123, acme/app#123, or GitHub PR URL"
                  autoFocus
                  disabled={isSubmitting}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={onPreview}
                  disabled={!canPreview || isSubmitting}
                >
                  {isPreviewing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  Preview
                </Button>
              </div>
            </section>

            {preview ? (
              <section className="space-y-3 rounded-md border border-border/70 bg-card/30 p-3">
                <div className="flex min-w-0 items-center gap-2">
                  <GitPullRequest className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      #{preview.number} {preview.title ?? 'Untitled PR'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {preview.repositoryOwner}/{preview.repositoryName} ·{' '}
                      {preview.state}
                      {preview.isDraft ? ' draft' : ''}
                    </p>
                  </div>
                </div>
                <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                  <div className="min-w-0">
                    <div className="uppercase">Base</div>
                    <div className="truncate text-foreground">
                      {preview.baseBranch ?? 'Unknown'}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="uppercase">Head</div>
                    <div className="truncate text-foreground">
                      {preview.headBranch ?? 'Unknown'}
                    </div>
                  </div>
                </div>
                <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                  <GitBranch className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{preview.reviewBranchName}</span>
                </div>
              </section>
            ) : null}

            <section className="space-y-2">
              <label htmlFor="pr-session-name" className="text-sm font-medium">
                Session name
              </label>
              <Input
                id="pr-session-name"
                value={sessionName}
                onChange={(event) => onSessionNameChange(event.target.value)}
                placeholder="Review PR #123"
                disabled={isSubmitting}
              />
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
                {effortItems.length > 0 ? (
                  <SessionStartSelect
                    selectedId={selection.effortId}
                    value={selection.effort?.label ?? 'Select effort'}
                    items={effortItems}
                    onChange={(id) => onEffortChange(id as ReasoningEffort)}
                  />
                ) : null}
              </div>
            </section>

            {error ? (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>

          <DialogFooter className="border-t border-white/10 px-6 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              Start review
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
