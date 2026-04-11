import type { FC, ReactNode } from 'react'
import type { Project } from '@/entities/project'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'

interface ProjectHeaderShellProps {
  activeProject: Project
  projects: Project[]
  onSwitchProject: (id: string) => void
  onDeleteProject: (id: string) => void
  createButton: ReactNode
}

export const ProjectHeaderShell: FC<ProjectHeaderShellProps> = ({
  activeProject,
  projects,
  onSwitchProject,
  onDeleteProject,
  createButton,
}) => (
  <header className="flex h-14 items-center justify-between border-b px-4">
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="gap-2 text-base font-semibold">
          {activeProject.name}
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {projects.map((project) => (
          <DropdownMenuItem
            key={project.id}
            onClick={() => onSwitchProject(project.id)}
            className="flex flex-col items-start"
          >
            <span className="font-medium">{project.name}</span>
            <span className="text-xs text-muted-foreground truncate max-w-full">
              {project.repositoryPath}
            </span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => onDeleteProject(activeProject.id)}
          className="text-destructive focus:text-destructive"
        >
          Delete "{activeProject.name}"
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <div>{createButton}</div>
  </header>
)
