import { forwardRef } from 'react'
import type { ComponentPropsWithoutRef, CSSProperties } from 'react'
import type { ProjectScript } from '@/entities/project-script'
import { ProjectScriptIcon } from '@/entities/project-script'
import { Button, cn, Tooltip } from '@convergence/ui'
import { ChevronDown, Play } from 'lucide-react'

interface ProjectActionsTriggerProps extends ComponentPropsWithoutRef<'button'> {
  selectedScript: ProjectScript | null
  running: boolean
}

export const ProjectActionsTrigger = forwardRef<
  HTMLButtonElement,
  ProjectActionsTriggerProps
>(({ selectedScript, running, className, style, ...props }, ref) => (
  <Tooltip label="Project actions">
    <Button
      ref={ref}
      type="button"
      variant="tonal"
      size="sm"
      className={cn(
        'min-w-28 justify-between gap-2 border border-border/70 bg-muted/50',
        running && 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
        className,
      )}
      style={
        {
          WebkitAppRegion: 'no-drag',
          ...style,
        } as CSSProperties
      }
      {...props}
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
          {selectedScript?.name ?? 'Project actions'}
        </span>
      </span>
      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    </Button>
  </Tooltip>
))

ProjectActionsTrigger.displayName = 'ProjectActionsTrigger'
