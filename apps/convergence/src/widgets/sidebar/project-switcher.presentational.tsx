import type { FC } from 'react'
import { orderProjectsWithLanes, type Project } from '@/entities/project'
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
  // Lanes sit under their root with a badge (MAR-2783, ruling 5); a lane is
  // listed by its own name because the root's name is the line above it.
  const items = orderProjectsWithLanes(projects).map(({ project, depth }) =>
    depth > 0 && project.laneName !== null
      ? {
          id: project.id,
          label: project.laneName,
          description: project.repositoryPath,
          depth,
          badge: { label: 'lane', title: `A lane of ${project.name}` },
        }
      : {
          id: project.id,
          label: project.name,
          description: project.repositoryPath,
        },
  )

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
