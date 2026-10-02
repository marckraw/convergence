import type { FC } from 'react'
import { BarChart3 } from 'lucide-react'
import { cn, EmptyState } from '@convergence/ui'

interface ChartFallbackProps {
  title?: string
  description?: string
  className?: string
}

/**
 * Where a chart would be, on a machine without WebGPU: the app's empty box
 * (EmptyState), filling the chart's room, announced as a status.
 */
export const ChartFallback: FC<ChartFallbackProps> = ({
  title = 'Charts unavailable',
  description = 'This view needs WebGPU support. The surrounding metrics still work.',
  className,
}) => (
  <div role="status" className={cn('flex h-full min-h-48 w-full', className)}>
    <EmptyState
      layout="centred"
      icon={BarChart3}
      title={title}
      detail={description}
    />
  </div>
)
