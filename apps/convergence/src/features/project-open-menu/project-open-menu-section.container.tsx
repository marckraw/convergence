import { Code2, Folder } from 'lucide-react'
import { DropdownMenuItem } from '@/shared/ui/dropdown-menu'
import { useProjectOpenApps } from './use-project-open-apps'

/**
 * Open in…, as a section of a menu that holds more than it (the header's
 * Project group, MAR-3429 CH4 R4): one item per app, each named for where it
 * opens, or one disabled item saying why none can.
 */
export function ProjectOpenMenuSection({
  targetPath,
}: {
  targetPath: string | null
}) {
  const { apps, loading, disabledReason, openIn } =
    useProjectOpenApps(targetPath)

  return (
    <div role="group" aria-label="Open in">
      <div className="px-2 pb-1 pt-1.5 text-[11px] text-muted-foreground">
        Open in
      </div>
      {disabledReason ? (
        <DropdownMenuItem disabled>{disabledReason}</DropdownMenuItem>
      ) : loading ? (
        <DropdownMenuItem disabled>Detecting apps...</DropdownMenuItem>
      ) : (
        apps.map((app) => {
          const Icon = app.kind === 'file-manager' ? Folder : Code2
          return (
            <DropdownMenuItem
              key={app.id}
              onSelect={() => openIn(app)}
              className="gap-2"
            >
              <Icon className="h-3.5 w-3.5" />
              Open in {app.label}
            </DropdownMenuItem>
          )
        })
      )}
    </div>
  )
}
