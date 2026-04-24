import type { FC } from 'react'
import type { Project } from '@/entities/project'
import { SearchableSelect } from '@/shared/ui/searchable-select.container'
import { FolderGit2, Plus } from 'lucide-react'

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
  const items = projects.map((project) => ({
    id: project.id,
    label: project.name,
    description: project.repositoryPath,
  }))

  return (
    <div className="px-3 pb-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Project
      </p>
      <SearchableSelect
        selectedId={activeProjectId}
        value={activeProject?.name ?? 'Select project'}
        items={items}
        onChange={onSelectProject}
        searchPlaceholder="Search projects..."
        emptyMessage="No matching projects."
        triggerVariant="outline"
        triggerSize="sm"
        triggerClassName="w-full"
        contentClassName="min-w-72 max-w-[min(28rem,calc(100vw-2rem))]"
        icon={<FolderGit2 className="h-3.5 w-3.5 shrink-0" />}
        action={{
          label: 'Open a project',
          icon: <Plus className="h-3.5 w-3.5 shrink-0" />,
          onSelect: onCreateProject,
        }}
      />
    </div>
  )
}
