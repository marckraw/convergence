import type { FC } from 'react'
import { ProjectScriptIcon } from '@/entities/project-script'
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/shared/ui/dropdown-menu'
import { cn } from '@/shared/lib/cn.pure'
import { Plus, ScrollText } from 'lucide-react'
import { formatProjectActionRunMeta } from './project-actions-menu.pure'
import type { ProjectActionItem } from './project-actions-menu.types'

interface ProjectActionsMenuPresentationalProps {
  projectName: string
  items: ProjectActionItem[]
  onRun: (item: ProjectActionItem) => void
  onAdd: () => void
  onManage: () => void
}

export const ProjectActionsMenuPresentational: FC<
  ProjectActionsMenuPresentationalProps
> = ({ projectName, items, onRun, onAdd, onManage }) => (
  <DropdownMenuContent align="end" className="w-80 p-1.5">
    <div className="flex items-center justify-between border-b border-border/70 px-2 py-1.5 text-[11px] text-muted-foreground">
      <span>Project actions</span>
      <span className="max-w-32 truncate">{projectName}</span>
    </div>

    {items.length === 0 ? (
      <div className="px-2 py-3 text-xs text-muted-foreground">
        No actions yet. Add one for this project.
      </div>
    ) : (
      items.map((item) => (
        <DropdownMenuItem
          key={item.script.id}
          onClick={() => onRun(item)}
          className="grid cursor-pointer grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2 px-2 py-2"
        >
          <span
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground',
              item.running && 'border-emerald-500/40 text-emerald-300',
            )}
          >
            <ProjectScriptIcon icon={item.script.icon} className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">
              {item.script.name}
            </span>
            <span className="block truncate font-mono text-[11px] text-muted-foreground">
              {item.script.command}
            </span>
          </span>
          <span
            className={cn(
              'text-[11px] text-muted-foreground',
              item.latestRun?.status === 'failed' && 'text-destructive',
              item.running && 'text-emerald-300',
            )}
          >
            {formatProjectActionRunMeta(item.latestRun)}
          </span>
        </DropdownMenuItem>
      ))
    )}

    <DropdownMenuSeparator />
    <DropdownMenuItem onClick={onAdd} className="cursor-pointer gap-2 text-sm">
      <Plus className="h-3.5 w-3.5" />
      Add action
    </DropdownMenuItem>
    <DropdownMenuItem
      onClick={onManage}
      className="cursor-pointer gap-2 text-sm"
    >
      <ScrollText className="h-3.5 w-3.5" />
      Manage actions
    </DropdownMenuItem>
  </DropdownMenuContent>
)
