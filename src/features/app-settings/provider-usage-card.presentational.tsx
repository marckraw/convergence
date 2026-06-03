import { ExternalLink } from 'lucide-react'
import type {
  ProviderQuotaSnapshot,
  ProviderQuotaWindow,
} from '@/entities/provider-quota'
import { Button } from '@/shared/ui/button'
import { ProviderUsageWindowRow } from './provider-usage-window-row.presentational'

interface ProviderUsageCardProps {
  snapshot: ProviderQuotaSnapshot
}

function formatCheckedAt(value: string | null): string {
  if (!value) return 'Never checked'
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function sortedWindows(windows: ProviderQuotaWindow[]) {
  const rank: Record<ProviderQuotaWindow['kind'], number> = {
    'five-hour': 0,
    weekly: 1,
    other: 2,
  }
  return [...windows].sort((a, b) => rank[a.kind] - rank[b.kind])
}

function getProviderName(providerId: ProviderQuotaSnapshot['providerId']) {
  switch (providerId) {
    case 'codex':
      return 'Codex'
    case 'claude-code':
      return 'Claude Code'
    case 'cursor':
      return 'Cursor'
    case 'antigravity':
      return 'Antigravity CLI'
  }
}

function getUsageUrl(snapshot: ProviderQuotaSnapshot): string {
  if (snapshot.status === 'unavailable' && snapshot.usageUrl) {
    return snapshot.usageUrl
  }

  switch (snapshot.providerId) {
    case 'codex':
      return 'https://chatgpt.com/codex/cloud/settings/analytics#usage'
    case 'claude-code':
      return 'https://claude.ai/new#settings/usage'
    case 'cursor':
      return 'https://cursor.com/dashboard'
    case 'antigravity':
      return 'https://www.antigravity.google/docs/plans'
  }
}

function getUsageLinks(snapshot: ProviderQuotaSnapshot) {
  if (snapshot.providerId === 'antigravity') {
    return [
      {
        label: 'Plans',
        url: getUsageUrl(snapshot),
      },
      {
        label: 'Credits',
        url: 'https://one.google.com/ai/credits',
      },
    ]
  }

  return [{ label: 'Open', url: getUsageUrl(snapshot) }]
}

function getSourceLabel(snapshot: ProviderQuotaSnapshot) {
  if (snapshot.source === 'manual') {
    return 'manual usage page'
  }
  return snapshot.source === 'provider-api'
    ? 'cloud usage endpoint'
    : 'provider runtime event'
}

export function ProviderUsageCard({ snapshot }: ProviderUsageCardProps) {
  const usageLinks = getUsageLinks(snapshot)

  return (
    <section className="space-y-3 rounded-lg border border-border/70 bg-card/25 px-4 py-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">
            {getProviderName(snapshot.providerId)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Source: {getSourceLabel(snapshot)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {usageLinks.map((link) => (
            <Button
              key={link.url}
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => window.open(link.url, '_blank')}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {link.label}
            </Button>
          ))}
        </div>
      </div>

      {snapshot.status === 'available' ? (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
            {snapshot.planType ? <span>Plan: {snapshot.planType}</span> : null}
            <span>
              Last checked: {formatCheckedAt(snapshot.lastCheckedAt)}
              {snapshot.stale ? ' (stale)' : ''}
            </span>
            {snapshot.limitReachedType ? (
              <span>Limit state: {snapshot.limitReachedType}</span>
            ) : null}
          </div>

          {sortedWindows(snapshot.windows).length > 0 ? (
            <div className="space-y-2">
              {sortedWindows(snapshot.windows).map((window) => (
                <ProviderUsageWindowRow
                  key={`${window.kind}-${window.label}-${window.resetsAt ?? 'none'}`}
                  window={window}
                />
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
              No active rate-limit windows were reported.
            </p>
          )}

          {snapshot.credits ? (
            <div className="rounded-lg border border-border/70 bg-card/40 px-4 py-3">
              <p className="text-sm font-medium text-foreground">
                Credits remaining
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {snapshot.credits.unlimited
                  ? 'Unlimited'
                  : (snapshot.credits.balance ?? '0')}
              </p>
            </div>
          ) : null}
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-border px-4 py-4">
          <p className="text-sm font-medium text-foreground">
            {getProviderName(snapshot.providerId)} usage unavailable
          </p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {snapshot.reason}
          </p>
        </div>
      )}
    </section>
  )
}
