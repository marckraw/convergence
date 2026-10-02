import type { FC } from 'react'
import { ChevronRight } from 'lucide-react'
import { Badge, Card, CardAction, cn, toneInk } from '@convergence/ui'
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
    <Card className="rounded-xl px-4 py-3">
      <p
        className={cn(
          'text-2xl font-semibold tabular-nums',
          tone === 'warning' && toneInk.warning,
          tone === 'muted' && toneInk.neutral,
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 text-xs text-ink-muted">{label}</p>
    </Card>
  )
}

/** A dashboard heading: under the dialog's h2, so an h3. */
const sectionHeading = 'mb-2.5 text-sm font-semibold'

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
        <h3 className={sectionHeading}>By origin</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {overview.byOrigin.map((bucket) => {
            const meta = SKILL_ORIGIN_META[bucket.origin]
            return (
              <Card
                key={bucket.origin}
                interactive
                className="flex items-stretch gap-3 rounded-xl"
              >
                <span
                  aria-hidden
                  className={cn('w-1 shrink-0 rounded-full', meta.dotClass)}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <CardAction
                      onClick={() => onJumpToGrid({ origin: bucket.origin })}
                      className="text-sm font-medium after:rounded-xl"
                    >
                      {meta.label}
                    </CardAction>
                    <span className="text-xl font-semibold tabular-nums">
                      {bucket.count}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-muted">
                    {meta.hint}
                  </span>
                  <span className="mt-1 block text-2xs text-ink-muted">
                    {bucket.enabled} enabled
                    {bucket.withWarnings > 0
                      ? ` · ${bucket.withWarnings} flagged`
                      : ''}
                  </span>
                </span>
              </Card>
            )
          })}
        </div>
      </section>

      <section>
        <h3 className={sectionHeading}>By provider</h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {overview.byProvider.map((bucket) => (
            <Card
              key={bucket.providerId}
              interactive
              className="flex items-center justify-between gap-3 py-2.5"
            >
              <span className="min-w-0">
                <CardAction
                  onClick={() =>
                    onJumpToGrid({ providerId: bucket.providerId })
                  }
                  className="block truncate text-sm font-medium"
                >
                  {bucket.providerName}
                </CardAction>
                {bucket.errored ? (
                  <span className="block truncate text-2xs text-danger-ink">
                    {bucket.error ?? 'Discovery error'}
                  </span>
                ) : null}
              </span>
              <span className="text-lg font-semibold tabular-nums">
                {bucket.count}
              </span>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <h3 className={sectionHeading}>Needs attention</h3>
        {attentionItems.length === 0 ? (
          <Card className="py-2.5 text-sm text-ink-muted">
            Everything looks healthy — no warnings or setup gaps.
          </Card>
        ) : (
          <div className="space-y-1.5">
            {attentionItems.map((item) => (
              <Card
                key={item.key}
                interactive
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <span className="flex items-center gap-2 text-sm">
                  <Badge tone="warning" shape="count">
                    {item.count}
                  </Badge>
                  <CardAction onClick={() => onJumpToGrid(item.patch)}>
                    {item.label}
                  </CardAction>
                </span>
                <ChevronRight aria-hidden className="size-4 text-ink-muted" />
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
