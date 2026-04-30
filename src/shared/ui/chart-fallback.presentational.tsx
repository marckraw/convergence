import type { FC } from 'react'
import { BarChart3 } from 'lucide-react'
import { cn } from '@/shared/lib/cn.pure'

interface ChartFallbackProps {
  title?: string
  description?: string
  className?: string
}

export const ChartFallback: FC<ChartFallbackProps> = ({
  title = 'Charts unavailable',
  description = 'This view needs WebGPU support. The surrounding metrics still work.',
  className,
}) => (
  <div
    role="status"
    className={cn(
      'flex h-full min-h-48 w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-center',
      className,
    )}
  >
    <BarChart3 className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
    <div className="space-y-1">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="max-w-sm text-xs leading-5 text-muted-foreground">
        {description}
      </p>
    </div>
  </div>
)
