import type { ReactNode } from 'react'
import {
  Blocks,
  Clock3,
  FolderGit2,
  Gauge,
  MessagesSquare,
  Sparkles,
  Trash2,
} from 'lucide-react'
import type {
  AnalyticsOverview,
  WorkStyleInteractionShape,
  WorkStyleSessionSizeBucket,
} from '@/entities/analytics'
import { Button } from '@/shared/ui/button'
import {
  formatHour,
  formatInteger,
  getRangeLabel,
  WEEKDAY_LABELS,
} from './analytics-insights.pure'

interface WorkStyleTabProps {
  overview: AnalyticsOverview | null
  isLoading: boolean
  isGeneratingProfile: boolean
  canGenerateProfile: boolean
  onGenerateProfile: () => void
  onDeleteGeneratedProfile: () => void
}

interface FactCard {
  label: string
  value: string
  detail: string
  icon: ReactNode
}

export function WorkStyleTab({
  overview,
  isLoading,
  isGeneratingProfile,
  canGenerateProfile,
  onGenerateProfile,
  onDeleteGeneratedProfile,
}: WorkStyleTabProps) {
  if (!overview) {
    return renderEmptyState({
      title: isLoading ? 'Loading work style' : 'No work style yet',
      description: isLoading
        ? 'Convergence is reading local aggregate activity.'
        : 'Use Convergence for a few sessions and this tab will summarize local patterns.',
    })
  }

  const profile = overview.deterministicProfile
  const hasActivity = overview.totals.sessionsCreated > 0

  if (!hasActivity) {
    return renderEmptyState({
      title: 'No local pattern yet',
      description:
        'This profile needs local sessions, messages, or turns in the selected range before it can describe a work style.',
    })
  }

  const facts = buildFactCards(overview)

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-border bg-card/60 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Deterministic local profile
            </p>
            <h4 className="mt-2 text-lg font-semibold">
              Based on the last {getRangeLabel(overview.range.preset)}
            </h4>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {profile.summary}
            </p>
          </div>
          <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-800 dark:text-amber-200">
            No model call. No transcripts sent.
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {facts.map((fact) => renderFactCard(fact))}
      </section>

      {renderGeneratedProfilePanel({
        overview,
        isGeneratingProfile,
        canGenerateProfile,
        onGenerateProfile,
        onDeleteGeneratedProfile,
      })}
    </div>
  )
}

function renderGeneratedProfilePanel({
  overview,
  isGeneratingProfile,
  canGenerateProfile,
  onGenerateProfile,
  onDeleteGeneratedProfile,
}: {
  overview: AnalyticsOverview
  isGeneratingProfile: boolean
  canGenerateProfile: boolean
  onGenerateProfile: () => void
  onDeleteGeneratedProfile: () => void
}) {
  const generated = overview.generatedProfile

  return (
    <section className="rounded-lg border border-border bg-card/60 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <span className="rounded-md border border-border bg-background p-2 text-muted-foreground">
            <Sparkles className="size-4" />
          </span>
          <div>
            <h4 className="text-sm font-semibold">
              {generated?.payload.title ?? 'Generated work profile'}
            </h4>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {generated?.payload.summary ??
                'Generate an optional profile from local aggregate usage data. Full transcripts and raw conversation excerpts are not sent in this version.'}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {generated ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onDeleteGeneratedProfile}
              disabled={isGeneratingProfile}
            >
              <Trash2 className="size-4" />
              Delete
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            onClick={onGenerateProfile}
            disabled={isGeneratingProfile || !canGenerateProfile}
          >
            <Sparkles className="size-4" />
            {generated ? 'Regenerate' : 'Generate'}
          </Button>
        </div>
      </div>

      {generated ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {generated.payload.themes.map((theme) => (
            <div
              key={theme.label}
              className="rounded-lg border border-border bg-background/60 p-3"
            >
              <p className="text-sm font-medium">{theme.label}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {theme.description}
              </p>
            </div>
          ))}
          {generated.payload.caveats.length > 0 ? (
            <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-800 dark:text-amber-200 md:col-span-2">
              {generated.payload.caveats.join(' ')}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

function buildFactCards(overview: AnalyticsOverview): FactCard[] {
  const profile = overview.deterministicProfile
  const peak = profile.peakActivity

  return [
    {
      label: 'Peak time',
      value: peak
        ? `${WEEKDAY_LABELS[peak.weekday]} at ${formatHour(peak.hour)}`
        : 'Not enough data',
      detail: peak
        ? `${formatInteger(peak.count)} local events in this range`
        : 'Activity by hour is empty for this range',
      icon: <Clock3 className="size-4" />,
    },
    {
      label: 'Most-used provider',
      value: profile.mostUsedProvider?.providerName ?? 'No provider yet',
      detail: profile.mostUsedProvider
        ? `${formatInteger(profile.mostUsedProvider.turnsCompleted)} turns, ${formatInteger(profile.mostUsedProvider.sessionsCreated)} sessions`
        : 'Provider usage appears after local sessions',
      icon: <Blocks className="size-4" />,
    },
    {
      label: 'Most-active project',
      value: profile.mostActiveProject?.projectName ?? 'No project yet',
      detail: profile.mostActiveProject
        ? `${formatInteger(profile.mostActiveProject.turnsCompleted)} turns, ${formatInteger(profile.mostActiveProject.sessionsCreated)} sessions`
        : 'Project usage appears after project-linked sessions',
      icon: <FolderGit2 className="size-4" />,
    },
    {
      label: 'Session size',
      value: getSessionSizeLabel(profile.sessionSizeBucket),
      detail: getSessionSizeDescription(profile.sessionSizeBucket),
      icon: <Gauge className="size-4" />,
    },
    {
      label: 'Interaction shape',
      value: getInteractionShapeLabel(profile.interactionShape),
      detail: getInteractionShapeDescription(profile.interactionShape),
      icon: <MessagesSquare className="size-4" />,
    },
  ]
}

function renderFactCard(fact: FactCard) {
  return (
    <article
      key={fact.label}
      className="min-w-0 rounded-lg border border-border bg-card/70 p-4"
    >
      <div className="flex items-start gap-3">
        <span className="rounded-md border border-border bg-background p-1.5 text-muted-foreground">
          {fact.icon}
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {fact.label}
          </p>
          <p className="mt-2 truncate text-base font-semibold">{fact.value}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {fact.detail}
          </p>
        </div>
      </div>
    </article>
  )
}

function renderEmptyState({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <section className="rounded-lg border border-dashed border-border bg-background/60 px-4 py-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
    </section>
  )
}

function getSessionSizeLabel(bucket: WorkStyleSessionSizeBucket): string {
  switch (bucket) {
    case 'none':
      return 'No pattern'
    case 'quick-check':
      return 'Quick checks'
    case 'normal-task':
      return 'Normal tasks'
    case 'long-running':
      return 'Long-running'
  }
}

function getSessionSizeDescription(bucket: WorkStyleSessionSizeBucket): string {
  switch (bucket) {
    case 'none':
      return 'There are not enough sessions in this range.'
    case 'quick-check':
      return 'Most sessions stay short and focused.'
    case 'normal-task':
      return 'Sessions usually have enough back-and-forth for one task.'
    case 'long-running':
      return 'Sessions often span larger, multi-step work.'
  }
}

function getInteractionShapeLabel(shape: WorkStyleInteractionShape): string {
  switch (shape) {
    case 'none':
      return 'No shape yet'
    case 'mostly-ask-review':
      return 'Ask and review'
    case 'mostly-implementation':
      return 'Implementation'
    case 'mostly-debugging':
      return 'Debugging'
    case 'mixed-exploration-implementation':
      return 'Explore and build'
  }
}

function getInteractionShapeDescription(
  shape: WorkStyleInteractionShape,
): string {
  switch (shape) {
    case 'none':
      return 'There are not enough local signals in this range.'
    case 'mostly-ask-review':
      return 'Sessions lean toward questions, reading, and review.'
    case 'mostly-implementation':
      return 'Sessions lean toward edits and file-changing work.'
    case 'mostly-debugging':
      return 'Sessions include a higher share of failed or recovery runs.'
    case 'mixed-exploration-implementation':
      return 'Sessions combine context gathering with implementation.'
  }
}
