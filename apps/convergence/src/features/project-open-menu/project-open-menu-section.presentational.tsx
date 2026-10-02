import { Code2, Folder } from 'lucide-react'
import {
  openInLabel,
  projectOpenNote,
  type ProjectOpenApp,
} from '@/entities/project-open'
import { Button } from '@convergence/ui'

interface ProjectOpenMenuSectionProps {
  apps: ProjectOpenApp[]
  loading: boolean
  disabledReason: string | null
  onOpen: (app: ProjectOpenApp) => void
}

/**
 * Open in…, as a section of a panel that holds more than it (the header's
 * Project group, MAR-3429 CH4 R4): one button per app, each named for where
 * it opens, or a line saying why none can.
 *
 * The apps come from the panel's owner, which reads them once for as long as
 * it lives (`useProjectOpenApps`), never on each open: a list read on open
 * flashes "Detecting apps…" and moves the rows below it while someone is
 * moving through them (lap 2 D).
 */
export function ProjectOpenMenuSection({
  apps,
  loading,
  disabledReason,
  onOpen,
}: ProjectOpenMenuSectionProps) {
  // The same list as the header's Open menu: one note, one label (NAV-25).
  const note = projectOpenNote({
    apps,
    loading,
    unavailableReason: disabledReason,
  })
  return (
    <div role="group" aria-label="Open in" className="flex flex-col">
      <div className="px-2 pt-1.5 pb-1 text-2xs text-ink-muted">Open in</div>
      {note ? (
        <p className="px-2 py-1.5 text-sm text-ink-muted">{note}</p>
      ) : (
        apps.map((app) => {
          const Icon = app.kind === 'file-manager' ? Folder : Code2
          return (
            <Button
              key={app.id}
              variant="ghost"
              onClick={() => onOpen(app)}
              className="w-full justify-start px-2 font-normal"
            >
              <Icon className="size-3.5" />
              {openInLabel(app)}
            </Button>
          )
        })
      )}
    </div>
  )
}
