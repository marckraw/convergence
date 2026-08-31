import type { FC } from 'react'
import { FolderOpen, GitBranch, Search } from 'lucide-react'
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
import { cn } from '@/shared/lib/cn.pure'

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader className="border-b border-white/10 px-6 py-5">
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
              className={cn(
                'h-9 rounded-sm shadow-none',
                mode === 'local'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => onModeChange('local')}
            >
              <FolderOpen className="h-4 w-4" />
              Local folder
            </Button>
            <Button
              type="button"
              variant="ghost"
              className={cn(
                'h-9 rounded-sm shadow-none',
                mode === 'clone'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => onModeChange('clone')}
            >
              <GitBranch className="h-4 w-4" />
              Clone URL
            </Button>
          </div>

          {mode === 'local' ? (
            <div className="rounded-md border border-border/70 bg-muted/20 p-4">
              <Button
                type="button"
                variant="outline"
                onClick={onOpenLocalProject}
                disabled={isOpeningLocal}
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
                    id="project-clone-destination"
                    value={parentDirectory}
                    placeholder="Select a folder"
                    readOnly
                    disabled={isCloning}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onSelectParentDirectory}
                    disabled={isCloning}
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

        <DialogFooter className="border-t border-white/10 px-6 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isOpeningLocal || isCloning}
          >
            Cancel
          </Button>
          {mode === 'clone' ? (
            <Button
              type="submit"
              form="project-clone-form"
              disabled={!canClone}
            >
              {isCloning ? 'Cloning...' : 'Clone project'}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
