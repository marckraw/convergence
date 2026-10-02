import type { FC } from 'react'
import { FolderOpen, GitBranch } from 'lucide-react'
import {
  Button,
  Field,
  FieldLabel,
  FormDialog,
  Input,
  SegmentedControl,
  SegmentedControlItem,
} from '@convergence/ui'

type ProjectOpenMode = 'local' | 'clone'

interface ProjectCreateDialogProps {
  open: boolean
  mode: ProjectOpenMode
  remoteUrl: string
  parentDirectory: string
  directoryName: string
  isOpeningLocal: boolean
  isCloning: boolean
  error: string | null
  onOpenChange: (open: boolean) => void
  onModeChange: (mode: ProjectOpenMode) => void
  onRemoteUrlChange: (value: string) => void
  onDirectoryNameChange: (value: string) => void
  onSelectParentDirectory: () => void
  onOpenLocalProject: () => void
  onCloneProject: () => void
}

/** Why Clone project waits, or nothing when it can go. */
function cloneBlock(
  remoteUrl: string,
  parentDirectory: string,
  directoryName: string,
): string | undefined {
  if (remoteUrl.trim().length === 0) return 'Paste the repository URL first.'
  if (parentDirectory.trim().length === 0)
    return 'Choose where to clone it first.'
  if (directoryName.trim().length === 0) return 'Name the folder first.'
  return undefined
}

/**
 * Opening a project (R6): Cancel, then the action, whichever way it comes.
 * A local folder's action is the system's folder picker; a clone's is the
 * clone, once its three fields are filled.
 */
export const ProjectCreateDialog: FC<ProjectCreateDialogProps> = ({
  open,
  mode,
  remoteUrl,
  parentDirectory,
  directoryName,
  isOpeningLocal,
  isCloning,
  error,
  onOpenChange,
  onModeChange,
  onRemoteUrlChange,
  onDirectoryNameChange,
  onSelectParentDirectory,
  onOpenLocalProject,
  onCloneProject,
}) => {
  const local = mode === 'local'
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Open a project"
      description="Select a local repository or clone one from Git."
      saves="on-save"
      onSave={local ? onOpenLocalProject : onCloneProject}
      saveLabel={local ? 'Browse folders…' : 'Clone project'}
      pendingLabel={local ? 'Opening…' : 'Cloning…'}
      pending={local ? isOpeningLocal : isCloning}
      saveDisabledReason={
        local
          ? undefined
          : cloneBlock(remoteUrl, parentDirectory, directoryName)
      }
      error={error}
    >
      <div className="space-y-5">
        <SegmentedControl
          aria-label="Where the project comes from"
          size="md"
          className="grid w-full grid-cols-2"
          value={mode}
          onValueChange={(next: ProjectOpenMode) => onModeChange(next)}
        >
          <SegmentedControlItem value="local">
            <FolderOpen aria-hidden />
            Local folder
          </SegmentedControlItem>
          <SegmentedControlItem value="clone">
            <GitBranch aria-hidden />
            Clone URL
          </SegmentedControlItem>
        </SegmentedControl>

        {local ? (
          <p className="text-sm text-ink-muted">
            Choose a folder that holds a git repository. It opens as a project
            right away.
          </p>
        ) : (
          <div className="space-y-5">
            <Field disabled={isCloning}>
              <FieldLabel>Repository URL</FieldLabel>
              <Input
                size="lg"
                value={remoteUrl}
                onChange={(event) => onRemoteUrlChange(event.target.value)}
                placeholder="https://github.com/org/repo.git"
                autoFocus
              />
            </Field>

            <Field disabled={isCloning}>
              <FieldLabel>Destination</FieldLabel>
              <div className="flex gap-2">
                <Input
                  size="lg"
                  value={parentDirectory}
                  placeholder="Select a folder"
                  readOnly
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={onSelectParentDirectory}
                  disabled={isCloning}
                  size="lg"
                >
                  Browse
                </Button>
              </div>
            </Field>

            <Field disabled={isCloning}>
              <FieldLabel>Folder name</FieldLabel>
              <Input
                size="lg"
                value={directoryName}
                onChange={(event) => onDirectoryNameChange(event.target.value)}
                placeholder="repo"
              />
            </Field>
          </div>
        )}
      </div>
    </FormDialog>
  )
}
