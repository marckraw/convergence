import type { FC } from 'react'
import { ExternalLink } from 'lucide-react'
import type { ProviderInfo } from '@/entities/session'
import { Badge, buttonVariants, Card } from '@convergence/ui'

interface ProviderSettingsMetadataProps {
  provider: ProviderInfo | null
}

function valueLabel(
  option: NonNullable<ProviderInfo['configOptions']>[number],
): string {
  const current = option.currentValue
  if (!current) return 'Unavailable'
  return option.options.find((entry) => entry.id === current)?.label ?? current
}

function persistenceLabel(
  value: NonNullable<ProviderInfo['configOptions']>[number]['persistence'],
): string {
  switch (value) {
    case 'session':
      return 'Session'
    case 'provider-managed':
      return 'Provider managed'
    case 'unsupported':
      return 'Unsupported'
  }
}

function telemetryLabel(value: {
  availability: 'available' | 'partial' | 'unavailable'
}): string {
  switch (value.availability) {
    case 'available':
      return 'Available'
    case 'partial':
      return 'Partial'
    case 'unavailable':
      return 'Unavailable'
  }
}

/** One fact about the provider in its small box. */
const fact = 'rounded-md py-2'

export const ProviderSettingsMetadata: FC<ProviderSettingsMetadataProps> = ({
  provider,
}) => {
  const configOptions = provider?.configOptions ?? []
  const telemetry = provider?.telemetry
  const help = provider?.settings?.help ?? []
  const links = provider?.settings?.links ?? []
  const hasContent =
    configOptions.length > 0 || telemetry || help.length > 0 || links.length > 0

  if (!provider || !hasContent) return null

  return (
    <Card render={<section />} padding="md" className="space-y-3">
      <div>
        <p className="text-sm font-medium text-ink">{provider.name} behavior</p>
        <p className="mt-1 text-xs text-ink-muted">
          Provider-reported settings and telemetry limits.
        </p>
      </div>

      {configOptions.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {configOptions.map((option) => (
            <Card key={option.id} surface="raised" className={fact}>
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 text-xs font-medium text-ink">
                  {option.label}
                </p>
                <Badge shape="label" className="shrink-0">
                  {persistenceLabel(option.persistence)}
                </Badge>
              </div>
              <p className="mt-1 text-xs wrap-break-word text-ink-muted">
                {valueLabel(option)}
              </p>
            </Card>
          ))}
        </div>
      ) : null}

      {telemetry ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Card surface="raised" className={fact}>
            <p className="text-xs font-medium text-ink">Context window</p>
            <p className="mt-1 text-xs text-ink-muted">
              {telemetryLabel(telemetry.contextWindow)}
            </p>
          </Card>
          <Card surface="raised" className={fact}>
            <p className="text-xs font-medium text-ink">Usage</p>
            <p className="mt-1 text-xs text-ink-muted">
              {telemetryLabel(telemetry.quota)}
            </p>
          </Card>
        </div>
      ) : null}

      {help.length > 0 ? (
        <div className="space-y-2">
          {help.map((item) => (
            <div key={item.label}>
              <p className="text-xs font-medium text-ink">{item.label}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
                {item.value}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {links.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {links.map((link) => (
            // A link that looks like a button: it goes somewhere (DS-24).
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ variant: 'secondary' })}
            >
              <ExternalLink className="size-3.5" />
              {link.label}
            </a>
          ))}
        </div>
      ) : null}
    </Card>
  )
}
