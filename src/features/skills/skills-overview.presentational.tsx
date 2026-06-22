import type { FC } from 'react'
import { ChevronRight } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/lib/cn.pure'
import type { SkillBrowserFilters } from './skills-browser.pure'
import { SKILL_ORIGIN_META } from './skills-browser.styles'
import type { SkillsOverview } from './skills-overview.pure'

interface SkillsOverviewViewProps {
  overview: SkillsOverview
  /** Drill from a dashboard segment into the filtered grid. */
  onJumpToGrid: (patch: Partial<SkillBrowserFilters>) => void
}

function renderStatTile(
  label: string,
  value: number,
  tone: 'default' | 'warning' | 'muted' = 'default',
) {
  return (
    <div className="rounded-xl border border-border/70 bg-muted/10 px-4 py-3">
      <p
        className={cn(
          'text-2xl font-semibold tabular-nums',
          tone === 'warning' && 'text-warning-foreground',
          tone === 'muted' && 'text-muted-foreground',
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

export const SkillsOverviewView: FC<SkillsOverviewViewProps> = ({
  overview,
  onJumpToGrid,
}) => {
  const attentionItems: Array<{
    key: string
    label: string
    count: number
    patch: Partial<SkillBrowserFilters>
  }> = [
    {
      key: 'duplicates',
      label: 'Duplicate names',
      count: overview.attention.duplicates,
      patch: { warnings: 'duplicate-name' as const },
    },
    {
      key: 'needsAuth',
      label: 'Dependencies need auth',
      count: overview.attention.needsAuth,
      patch: { dependencyState: 'needs-auth' as const },
    },
    {
      key: 'needsInstall',
      label: 'Dependencies need install',
      count: overview.attention.needsInstall,
      patch: { dependencyState: 'needs-install' as const },
    },
    {
      key: 'missingDescription',
      label: 'Missing description',
      count: overview.attention.missingDescription,
      patch: { warnings: 'missing-description' as const },
    },
    {
      key: 'unsupportedInvocation',
      label: 'Unsupported invocation',
      count: overview.attention.unsupportedInvocation,
      patch: { warnings: 'unsupported-path-invocation' as const },
    },
    {
      key: 'invalidFrontmatter',
      label: 'Invalid frontmatter',
      count: overview.attention.invalidFrontmatter,
      patch: { warnings: 'invalid-frontmatter' as const },
    },
    {
      key: 'disabled',
      label: 'Disabled skills',
      count: overview.attention.disabled,
      patch: { enabled: 'disabled' as const },
    },
  ].filter((item) => item.count > 0)

  return (
    <div className="space-y-7">
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {renderStatTile('Total skills', overview.total)}
        {renderStatTile('Enabled', overview.enabled)}
        {renderStatTile('Disabled', overview.disabled, 'muted')}
        {renderStatTile(
          'With warnings',
          overview.withWarnings,
          overview.withWarnings > 0 ? 'warning' : 'default',
        )}
        {renderStatTile(
          'Need setup',
          overview.depsNeedingAction,
          overview.depsNeedingAction > 0 ? 'warning' : 'default',
        )}
      </section>

      <section>
        <h4 className="mb-2.5 text-sm font-semibold">By origin</h4>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {overview.byOrigin.map((bucket) => {
            const meta = SKILL_ORIGIN_META[bucket.origin]
            return (
              <Button
                key={bucket.origin}
                type="button"
                variant="ghost"
                onClick={() => onJumpToGrid({ origin: bucket.origin })}
                className="flex h-auto items-stretch justify-start gap-3 whitespace-normal rounded-xl border border-border/70 bg-muted/10 p-3 text-left transition-[transform,background-color,border-color] hover:border-border hover:bg-muted/30 active:scale-[0.96]"
              >
                <span
                  className={cn('w-1 shrink-0 rounded-full', meta.accentClass)}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{meta.label}</span>
                    <span className="text-xl font-semibold tabular-nums">
                      {bucket.count}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {meta.hint}
                  </span>
                  <span className="mt-1 block text-[11px] text-muted-foreground">
                    {bucket.enabled} enabled
                    {bucket.withWarnings > 0
                      ? ` · ${bucket.withWarnings} flagged`
                      : ''}
                  </span>
                </span>
              </Button>
            )
          })}
        </div>
      </section>

      <section>
        <h4 className="mb-2.5 text-sm font-semibold">By provider</h4>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {overview.byProvider.map((bucket) => (
            <Button
              key={bucket.providerId}
              type="button"
              variant="ghost"
              onClick={() => onJumpToGrid({ providerId: bucket.providerId })}
              className="flex h-auto items-center justify-between gap-2 whitespace-normal rounded-lg border border-border/70 bg-muted/10 px-3 py-2.5 text-left transition-[transform,background-color,border-color] hover:border-border hover:bg-muted/30 active:scale-[0.96]"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">
                  {bucket.providerName}
                </span>
                {bucket.errored ? (
                  <span
                    className="block truncate text-[11px] text-destructive"
                    title={bucket.error ?? 'Discovery error'}
                  >
                    {bucket.error ?? 'Discovery error'}
                  </span>
                ) : null}
              </span>
              <span className="text-lg font-semibold tabular-nums">
                {bucket.count}
              </span>
            </Button>
          ))}
        </div>
      </section>

      <section>
        <h4 className="mb-2.5 text-sm font-semibold">Needs attention</h4>
        {attentionItems.length === 0 ? (
          <p className="rounded-lg border border-border/70 bg-muted/10 px-3 py-2.5 text-sm text-muted-foreground">
            Everything looks healthy — no warnings or setup gaps.
          </p>
        ) : (
          <div className="space-y-1.5">
            {attentionItems.map((item) => (
              <Button
                key={item.key}
                type="button"
                variant="ghost"
                onClick={() => onJumpToGrid(item.patch)}
                className="flex h-auto w-full items-center justify-between gap-3 whitespace-normal rounded-lg border border-border/70 bg-muted/10 px-3 py-2.5 text-left transition-[transform,background-color,border-color] hover:border-border hover:bg-muted/30 active:scale-[0.96]"
              >
                <span className="flex items-center gap-2 text-sm">
                  <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-warning/30 bg-warning/10 px-1.5 text-xs font-semibold tabular-nums text-warning-foreground">
                    {item.count}
                  </span>
                  {item.label}
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Button>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
