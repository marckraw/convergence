import type { FC, ReactNode, ReactElement } from 'react'
import {
  ChoiceCard,
  ChoiceField,
  Field,
  FieldDescription,
  FieldLabel,
  Fieldset,
  FieldsetDescription,
  FieldsetLegend,
  FormDialog,
  Input,
  RadioGroup,
  settingsHeading,
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
  /** The last save that failed; each change saves itself. */
  error: string | null
  onStrategyChange: (strategy: WorkspaceStartStrategy) => void
  onBaseBranchNameChange: (value: string) => void
  onEnvCopyEnabledChange: (enabled: boolean) => void
  onEnvOverwriteChange: (enabled: boolean) => void
  onEnvPatternsTextChange: (value: string) => void
  /** What opens it; left out where the dialog store opens it (the sidebar's menus). */
  trigger?: ReactElement
  contextSection?: ReactNode
}

/**
 * A project's settings (DLG-10, R6): each change is kept as it is made, as
 * its context items always were, so the dialog ends in one Done and no
 * Cancel pretends to undo them.
 */
export const ProjectSettingsDialog: FC<ProjectSettingsDialogProps> = ({
  open,
  onOpenChange,
  projectName,
  strategy,
  baseBranchName,
  envCopyEnabled,
  envOverwrite,
  envPatternsText,
  error,
  onStrategyChange,
  onBaseBranchNameChange,
  onEnvCopyEnabledChange,
  onEnvOverwriteChange,
  onEnvPatternsTextChange,
  trigger,
  contextSection,
}) => (
  <FormDialog
    open={open}
    onOpenChange={onOpenChange}
    trigger={trigger}
    title="Project settings"
    description={`Configure how new workspaces branch for ${projectName}.`}
    saves="as-you-go"
    error={error}
  >
    <div className="space-y-5">
      <Fieldset
        render={
          <RadioGroup
            value={strategy}
            onValueChange={(next: WorkspaceStartStrategy) =>
              onStrategyChange(next)
            }
          />
        }
        className="gap-3"
      >
        <FieldsetLegend>Workspace start point</FieldsetLegend>
        {/* Describes the radios, so it is read with the group (DLG-7). */}
        <FieldsetDescription className="-mt-1.5">
          This only affects new branches. Existing branches are checked out
          as-is.
        </FieldsetDescription>
        <div className="grid gap-2 sm:grid-cols-2">
          <ChoiceCard
            value="base-branch"
            title="Base branch"
            description="Start from the project base branch."
          />
          <ChoiceCard
            value="current-head"
            title="Current HEAD"
            description="Start from whatever commit the source repo currently has checked out."
          />
        </div>
      </Fieldset>

      <Field disabled={strategy !== 'base-branch'}>
        <FieldLabel>Base branch name</FieldLabel>
        <Input
          size="lg"
          value={baseBranchName}
          onChange={(event) => onBaseBranchNameChange(event.target.value)}
          placeholder="Auto-detect (for example: master or main)"
        />
        <FieldDescription>
          Leave blank to auto-detect from the repository. When an{' '}
          <code>origin/&lt;branch&gt;</code> remote-tracking ref exists,
          Convergence will use that before falling back to the local branch.
        </FieldDescription>
      </Field>

      <section className="space-y-3 border-t border-line-soft pt-5">
        <div>
          <h3 className={settingsHeading}>Workspace env files</h3>
          <p className="mt-1 text-xs text-ink-muted">
            Copy ignored root env files from the project repo when worktrees are
            created or manually synced.
          </p>
        </div>

        <ChoiceField
          label="Copy env files"
          hint="Copies matching root files such as .env and .env.local into worktrees."
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
          disabled={!envCopyEnabled}
        >
          <Switch
            id="project-overwrite-env-files"
            checked={envOverwrite}
            onCheckedChange={(next) => onEnvOverwriteChange(next)}
          />
        </ChoiceField>

        <Field disabled={!envCopyEnabled}>
          <FieldLabel>File patterns</FieldLabel>
          <Input
            size="lg"
            value={envPatternsText}
            onChange={(event) => onEnvPatternsTextChange(event.target.value)}
            placeholder=".env, .env.*"
          />
          <FieldDescription>
            Comma-separated root filenames or simple wildcard patterns. Template
            files such as .env.example are skipped.
          </FieldDescription>
        </Field>
      </section>

      {contextSection ? (
        <section className="space-y-3 border-t border-line-soft pt-5">
          {contextSection}
        </section>
      ) : null}
    </div>
  </FormDialog>
)
