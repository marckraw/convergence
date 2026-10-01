import type { FC, ReactNode, ReactElement } from 'react'
import {
  Button,
  ChoiceField,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Switch,
} from '@convergence/ui'
import type { WorkspaceStartStrategy } from '@/entities/project'

interface ProjectSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectName: string
  strategy: WorkspaceStartStrategy
  baseBranchName: string
  envCopyEnabled: boolean
  envOverwrite: boolean
  envPatternsText: string
  isSaving: boolean
  error: string | null
  onStrategyChange: (strategy: WorkspaceStartStrategy) => void
  onBaseBranchNameChange: (value: string) => void
  onEnvCopyEnabledChange: (enabled: boolean) => void
  onEnvOverwriteChange: (enabled: boolean) => void
  onEnvPatternsTextChange: (value: string) => void
  onSave: () => void
  trigger: ReactElement
  contextSection?: ReactNode
}

export const ProjectSettingsDialog: FC<ProjectSettingsDialogProps> = ({
  open,
  onOpenChange,
  projectName,
  strategy,
  baseBranchName,
  envCopyEnabled,
  envOverwrite,
  envPatternsText,
  isSaving,
  error,
  onStrategyChange,
  onBaseBranchNameChange,
  onEnvCopyEnabledChange,
  onEnvOverwriteChange,
  onEnvPatternsTextChange,
  onSave,
  trigger,
  contextSection,
}) => {
  return (
    <Dialog open={open} onOpenChange={(open) => onOpenChange(open)}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Project Settings</DialogTitle>
          <DialogDescription>
            Configure how new workspaces branch for {projectName}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 overflow-y-auto px-6 py-5">
          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-medium">Workspace Start Point</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                This only affects new branches. Existing branches are checked
                out as-is.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                type="button"
                variant={strategy === 'base-branch' ? 'tonal' : 'secondary'}
                onClick={() => onStrategyChange('base-branch')}
                size="lg"
                className={cn(
                  'h-auto w-full min-w-0 items-start justify-start whitespace-normal px-3 py-3 text-left',
                  strategy === 'base-branch' && 'ring-1 ring-ring',
                )}
              >
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-sm font-medium">Base branch</span>
                  <span className="whitespace-normal break-words text-xs text-muted-foreground">
                    Start from the project base branch.
                  </span>
                </span>
              </Button>

              <Button
                type="button"
                variant={strategy === 'current-head' ? 'tonal' : 'secondary'}
                onClick={() => onStrategyChange('current-head')}
                size="lg"
                className={cn(
                  'h-auto w-full min-w-0 items-start justify-start whitespace-normal px-3 py-3 text-left',
                  strategy === 'current-head' && 'ring-1 ring-ring',
                )}
              >
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-sm font-medium">Current HEAD</span>
                  <span className="whitespace-normal break-words text-xs text-muted-foreground">
                    Start from whatever commit the source repo currently has
                    checked out.
                  </span>
                </span>
              </Button>
            </div>
          </section>

          <section className="space-y-2">
            <label
              htmlFor="project-base-branch"
              className="text-sm font-medium"
            >
              Base branch name
            </label>
            <Input
              size="lg"
              id="project-base-branch"
              value={baseBranchName}
              onChange={(event) => onBaseBranchNameChange(event.target.value)}
              placeholder="Auto-detect (for example: master or main)"
              disabled={strategy !== 'base-branch' || isSaving}
            />
            <p className="text-xs text-muted-foreground">
              Leave blank to auto-detect from the repository. When an{' '}
              <code>origin/&lt;branch&gt;</code> remote-tracking ref exists,
              Convergence will use that before falling back to the local branch.
            </p>
          </section>

          <section className="space-y-3 border-t border-white/10 pt-5">
            <div>
              <h3 className="text-sm font-medium">Workspace env files</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Copy ignored root env files from the project repo when worktrees
                are created or manually synced.
              </p>
            </div>

            <ChoiceField
              label="Copy env files"
              hint="Copies matching root files such as .env and .env.local into worktrees."
              disabled={isSaving}
            >
              <Switch
                id="project-copy-env-files"
                checked={envCopyEnabled}
                onCheckedChange={(next) => onEnvCopyEnabledChange(next)}
              />
            </ChoiceField>

            <ChoiceField
              label="Overwrite existing env files"
              hint="Replace matching files during manual sync and workspace creation."
              disabled={!envCopyEnabled || isSaving}
            >
              <Switch
                id="project-overwrite-env-files"
                checked={envOverwrite}
                onCheckedChange={(next) => onEnvOverwriteChange(next)}
              />
            </ChoiceField>

            <div className="space-y-2">
              <label
                htmlFor="project-env-patterns"
                className="text-sm font-medium"
              >
                File patterns
              </label>
              <Input
                size="lg"
                id="project-env-patterns"
                value={envPatternsText}
                onChange={(event) =>
                  onEnvPatternsTextChange(event.target.value)
                }
                placeholder=".env, .env.*"
                disabled={!envCopyEnabled || isSaving}
              />
              <p className="text-xs text-muted-foreground">
                Comma-separated root filenames or simple wildcard patterns.
                Template files such as .env.example are skipped.
              </p>
            </div>
          </section>

          {error && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          {contextSection ? (
            <section className="space-y-3 border-t border-white/10 pt-5">
              {contextSection}
            </section>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
            size="lg"
          >
            Cancel
          </Button>
          <Button type="button" onClick={onSave} disabled={isSaving} size="lg">
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
