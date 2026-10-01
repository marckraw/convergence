import type { FC } from 'react'
import { FolderOpen, GitBranch, Search } from 'lucide-react'
import {
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
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
  const canClone =
    remoteUrl.trim().length > 0 &&
    parentDirectory.trim().length > 0 &&
    directoryName.trim().length > 0 &&
    !isCloning

  return (
    <Dialog open={open} onOpenChange={(open) => onOpenChange(open)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Open a project</DialogTitle>
          <DialogDescription>
            Select a local repository or clone one from Git.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 px-6 py-5">
          <div className="grid grid-cols-2 rounded-md border border-border bg-muted/30 p-1">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onModeChange('local')}
              size="lg"
              className={cn(
                'rounded-sm shadow-none',
                mode === 'local'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <FolderOpen className="h-4 w-4" />
              Local folder
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onModeChange('clone')}
              size="lg"
              className={cn(
                'rounded-sm shadow-none',
                mode === 'clone'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <GitBranch className="h-4 w-4" />
              Clone URL
            </Button>
          </div>

          {mode === 'local' ? (
            <div className="rounded-md border border-border/70 bg-muted/20 p-4">
              <Button
                type="button"
                variant="secondary"
                onClick={onOpenLocalProject}
                disabled={isOpeningLocal}
                size="lg"
              >
                <Search className="h-4 w-4" />
                {isOpeningLocal ? 'Opening...' : 'Browse folders'}
              </Button>
            </div>
          ) : (
            <form
              id="project-clone-form"
              className="space-y-5"
              onSubmit={(event) => {
                event.preventDefault()
                if (canClone) onCloneProject()
              }}
            >
              <section className="space-y-2">
                <label
                  htmlFor="project-clone-url"
                  className="text-sm font-medium"
                >
                  Repository URL
                </label>
                <Input
                  size="lg"
                  id="project-clone-url"
                  value={remoteUrl}
                  onChange={(event) => onRemoteUrlChange(event.target.value)}
                  placeholder="https://github.com/org/repo.git"
                  autoFocus
                  disabled={isCloning}
                />
              </section>

              <section className="space-y-2">
                <label
                  htmlFor="project-clone-destination"
                  className="text-sm font-medium"
                >
                  Destination
                </label>
                <div className="flex gap-2">
                  <Input
                    size="lg"
                    id="project-clone-destination"
                    value={parentDirectory}
                    placeholder="Select a folder"
                    readOnly
                    disabled={isCloning}
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
              </section>

              <section className="space-y-2">
                <label
                  htmlFor="project-clone-folder"
                  className="text-sm font-medium"
                >
                  Folder name
                </label>
                <Input
                  size="lg"
                  id="project-clone-folder"
                  value={directoryName}
                  onChange={(event) =>
                    onDirectoryNameChange(event.target.value)
                  }
                  placeholder="repo"
                  disabled={isCloning}
                />
              </section>
            </form>
          )}

          {error ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={isOpeningLocal || isCloning}
            size="lg"
          >
            Cancel
          </Button>
          {mode === 'clone' ? (
            <Button
              type="submit"
              form="project-clone-form"
              disabled={!canClone}
              size="lg"
            >
              {isCloning ? 'Cloning...' : 'Clone project'}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
