import type { FC, ReactNode } from 'react'
import { Info } from 'lucide-react'
import { cn } from '@/shared/lib/cn.pure'
import { Button } from '@/shared/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'

interface SettingsControlFieldProps {
  title: string
  description?: string
  children: ReactNode
  className?: string
}

export const SettingsControlField: FC<SettingsControlFieldProps> = ({
  title,
  description,
  children,
  className,
}) => (
  <div
    className={cn(
      'flex items-center justify-between gap-4 rounded-xl border border-border/70 bg-card/45 px-4 py-2.5',
      className,
    )}
  >
    <div className="flex min-w-0 items-center gap-1.5">
      <p className="truncate text-sm font-medium text-foreground">{title}</p>
      {description ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`About ${title}`}
              className="size-5 shrink-0 rounded-full text-muted-foreground/60 hover:text-foreground"
            >
              <Info className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs leading-relaxed">
            {description}
          </TooltipContent>
        </Tooltip>
      ) : null}
    </div>
    <div className="min-w-0 shrink-0">{children}</div>
  </div>
)
