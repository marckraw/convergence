import { useProjectOpenApps } from './use-project-open-apps'
import { ProjectOpenMenu, projectOpenNote } from '@/entities/project-open'

interface ProjectOpenMenuContainerProps {
  targetPath: string | null
}

/**
 * The session header's Open menu: the project's path in an editor or in
 * Finder, the apps read once for as long as it lives (`useProjectOpenApps`).
 * With nothing to open, the trigger stays and the list says why (NAV-25),
 * as the Project panel's section does.
 */
export function ProjectOpenMenuContainer({
  targetPath,
}: ProjectOpenMenuContainerProps) {
  const { apps, loading, disabledReason, openIn } =
    useProjectOpenApps(targetPath)

  return (
    <ProjectOpenMenu
      apps={apps}
      note={projectOpenNote({
        apps,
        loading,
        unavailableReason: disabledReason,
      })}
      onOpen={openIn}
      label="Open project"
    />
  )
}
