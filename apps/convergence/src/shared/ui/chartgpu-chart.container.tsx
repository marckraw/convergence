import type { CSSProperties, FC } from 'react'
import { ChartGPU } from 'chartgpu-react'
import type { ChartGPUOptions, ChartGPUProps } from 'chartgpu-react'
import { cn } from '@/shared/lib/cn.pure'
import { ChartFallback } from './chart-fallback.presentational'

interface ChartGpuChartProps extends Pick<
  ChartGPUProps,
  | 'theme'
  | 'onReady'
  | 'onClick'
  | 'onCrosshairMove'
  | 'onZoomChange'
  | 'onDeviceLost'
> {
  options: ChartGPUOptions
  className?: string
  style?: CSSProperties
  height?: number | string
  fallbackTitle?: string
  fallbackDescription?: string
}

export function isChartGpuSupported(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator
}

export const ChartGpuChart: FC<ChartGpuChartProps> = ({
  options,
  className,
  style,
  height = 280,
  fallbackTitle,
  fallbackDescription,
  theme,
  onReady,
  onClick,
  onCrosshairMove,
  onZoomChange,
  onDeviceLost,
}) => {
  const chartStyle: CSSProperties = {
    width: '100%',
    height,
    ...style,
  }

  if (!isChartGpuSupported()) {
    return (
      <ChartFallback
        title={fallbackTitle}
        description={fallbackDescription}
        className={className}
      />
    )
  }

  return (
    <ChartGPU
      options={options}
      theme={theme}
      className={cn('w-full overflow-hidden rounded-md', className)}
      style={chartStyle}
      onReady={onReady}
      onClick={onClick}
      onCrosshairMove={onCrosshairMove}
      onZoomChange={onZoomChange}
      onDeviceLost={onDeviceLost}
    />
  )
}
