import type { FC } from 'react'
import { ExternalLink } from 'lucide-react'
import type { ProviderInfo } from '@/entities/session'
import { Button } from '@/shared/ui/button'

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
    <section className="space-y-3 rounded-lg border border-border/70 bg-card/35 px-4 py-4">
      <div>
        <p className="text-sm font-medium text-foreground">
          {provider.name} behavior
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Provider-reported settings and telemetry limits.
        </p>
      </div>

      {configOptions.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {configOptions.map((option) => (
            <div
              key={option.id}
              className="rounded-md border border-border/70 bg-background/40 px-3 py-2"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 text-xs font-medium text-foreground">
                  {option.label}
                </p>
                <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {persistenceLabel(option.persistence)}
                </span>
              </div>
              <p className="mt-1 break-words text-xs text-muted-foreground">
                {valueLabel(option)}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {telemetry ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-md border border-border/70 bg-background/40 px-3 py-2">
            <p className="text-xs font-medium text-foreground">
              Context window
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {telemetryLabel(telemetry.contextWindow)}
            </p>
          </div>
          <div className="rounded-md border border-border/70 bg-background/40 px-3 py-2">
            <p className="text-xs font-medium text-foreground">Usage</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {telemetryLabel(telemetry.quota)}
            </p>
          </div>
        </div>
      ) : null}

      {help.length > 0 ? (
        <div className="space-y-2">
          {help.map((item) => (
            <div key={item.label}>
              <p className="text-xs font-medium text-foreground">
                {item.label}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                {item.value}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {links.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {links.map((link) => (
            <Button
              key={link.url}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => window.open(link.url, '_blank')}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {link.label}
            </Button>
          ))}
        </div>
      ) : null}
    </section>
  )
}
