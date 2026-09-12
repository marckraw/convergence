import { cn } from '@/shared/lib/cn.pure'
import { ProviderIcon } from './provider-icon.presentational'
import { resolveProviderIcon } from './provider-icon.pure'

export function ProviderModel({
  providerId,
  model,
  className,
}: {
  providerId: string
  model?: string | null
  className?: string
}) {
  const { label, brand } = resolveProviderIcon(providerId)
  const modelLabel = model || 'Model not recorded'
  return (
    <span
      className={cn('flex min-w-0 items-center gap-1.5', className)}
      title={`${label} · ${modelLabel}`}
    >
      <ProviderIcon providerId={providerId} className="size-3.5" />
      {brand && <span className="sr-only">{label} · </span>}
      <span className="truncate">
        {brand ? modelLabel : `${label} · ${modelLabel}`}
      </span>
    </span>
  )
}
