import type { FC } from 'react'
import type { ProjectScript } from '@/entities/project-script'
import { ProjectScriptIcon } from '@/entities/project-script'
import { Button } from '@/shared/ui/button'
import { ChevronDown, Play } from 'lucide-react'
import { cn } from '@/shared/lib/cn.pure'

interface ProjectActionsTriggerProps {
  selectedScript: ProjectScript | null
  running: boolean
}

export const ProjectActionsTrigger: FC<ProjectActionsTriggerProps> = ({
  selectedScript,
  running,
}) => (
  <Button
    type="button"
    variant="secondary"
    size="sm"
    className={cn(
      'h-7 min-w-28 justify-between gap-2 border border-border/70 bg-muted/50 px-2 text-xs',
      running && 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
    )}
    title="Project actions"
  >
    <span className="flex min-w-0 items-center gap-1.5">
      {selectedScript ? (
        <ProjectScriptIcon
          icon={selectedScript.icon}
          className="h-3.5 w-3.5 shrink-0"
        />
      ) : (
        <Play className="h-3.5 w-3.5 shrink-0" />
      )}
      <span className="max-w-24 truncate">
        {selectedScript?.name ?? 'Actions'}
      </span>
    </span>
    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
  </Button>
)
