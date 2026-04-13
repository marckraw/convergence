import type { FC } from 'react'
import type { Project } from '@/entities/project'
import { Button } from '@/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { Check, ChevronDown, FolderGit2, Plus } from 'lucide-react'

interface ProjectSwitcherProps {
  projects: Project[]
  activeProjectId: string | null
  onSelectProject: (id: string) => void
  onCreateProject: () => void
}

export const ProjectSwitcher: FC<ProjectSwitcherProps> = ({
  projects,
  activeProjectId,
  onSelectProject,
  onCreateProject,
}) => {
  const activeProject =
    projects.find((project) => project.id === activeProjectId) ?? null

  return (
    <div className="px-3 pb-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Project
      </p>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full justify-between"
          >
            <span className="flex min-w-0 items-center gap-2">
              <FolderGit2 className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {activeProject?.name ?? 'Select project'}
              </span>
            </span>
            <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-72">
          {projects.map((project) => (
            <DropdownMenuItem
              key={project.id}
              onClick={() => onSelectProject(project.id)}
              className="gap-2"
            >
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">
                  {project.name}
                </span>
                <span className="truncate text-[11px] text-muted-foreground">
                  {project.repositoryPath}
                </span>
              </div>
              {project.id === activeProjectId && (
                <Check className="ml-auto h-3.5 w-3.5" />
              )}
            </DropdownMenuItem>
          ))}
          <div className="-mx-1 my-1 h-px bg-muted" />
          <DropdownMenuItem onClick={onCreateProject} className="gap-2">
            <Plus className="h-3.5 w-3.5" />
            <span>Create Project</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
