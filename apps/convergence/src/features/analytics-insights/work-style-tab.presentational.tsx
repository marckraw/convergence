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
import { Button, Card, cn, EmptyState, SectionLabel } from '@convergence/ui'
import {
  formatHour,
  formatInteger,
  getRangeLabel,
  WEEKDAY_LABELS,
} from './analytics-insights.pure'
import { iconChip, skeletonBar } from './analytics-insights.styles'

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
    if (isLoading) return renderLoadingState()

    return renderEmptyState({
      title: 'No work style yet',
      description:
        'Use Convergence for a few sessions and this tab will summarize local patterns.',
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
      <Card render={<section />} padding="md">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <SectionLabel>Deterministic local profile</SectionLabel>
            <h4 className="mt-2 text-lg font-semibold">
              Based on the last {getRangeLabel(overview.range.preset)}
            </h4>
            <p className="mt-3 text-sm leading-relaxed text-ink-muted">
              {profile.summary}
            </p>
          </div>
          {/* What this profile promises about privacy: information, not a warning (R1). */}
          <p className="shrink-0 rounded-lg border border-info-line bg-info-soft px-3 py-2 text-xs leading-relaxed text-info-ink">
            No model call. No transcripts sent.
          </p>
        </div>
      </Card>

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

/** A skeleton of the tab while it loads: a status, so it is announced. */
function renderLoadingState() {
  return (
    <div
      role="status"
      className="space-y-4"
      aria-label="Loading work style"
      aria-busy="true"
    >
      <Card render={<section />} padding="md">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="w-full max-w-3xl space-y-3">
            <div className={cn(skeletonBar, 'h-3 w-44')} />
            <div className={cn(skeletonBar, 'h-6 w-64')} />
            <div className={cn(skeletonBar, 'h-4 w-full max-w-xl')} />
            <div className={cn(skeletonBar, 'h-4 w-full max-w-md')} />
          </div>
          <div className={cn(skeletonBar, 'h-10 w-44 rounded-lg')} />
        </div>
      </Card>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 5 }, (_, index) => (
          <Card key={index} padding="md" className="min-w-0">
            <div className="flex items-start gap-3">
              <div className={cn(skeletonBar, 'size-8 rounded-md')} />
              <div className="min-w-0 flex-1 space-y-3">
                <div className={cn(skeletonBar, 'h-3 w-28')} />
                <div className={cn(skeletonBar, 'h-5 w-36')} />
                <div className={cn(skeletonBar, 'h-3 w-full max-w-44')} />
              </div>
            </div>
          </Card>
        ))}
      </section>
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
    <Card render={<section />} padding="md">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <span aria-hidden className={iconChip}>
            <Sparkles className="size-4" />
          </span>
          <div>
            <h4 className="text-sm font-semibold">
              {generated?.payload.title ?? 'Generated work profile'}
            </h4>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">
              {generated?.payload.summary ??
                'Generate an optional profile from local aggregate usage data. Full transcripts and raw conversation excerpts are not sent in this version.'}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {generated ? (
            <Button
              type="button"
              variant="secondary"
              onClick={onDeleteGeneratedProfile}
              disabled={isGeneratingProfile}
            >
              <Trash2 className="size-4" />
              Delete
            </Button>
          ) : null}
          <Button
            type="button"
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
            <Card key={theme.label} surface="raised">
              <p className="text-sm font-medium">{theme.label}</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                {theme.description}
              </p>
            </Card>
          ))}
          {generated.payload.caveats.length > 0 ? (
            <p className="rounded-lg border border-warning-line bg-warning-soft p-3 text-xs leading-relaxed text-warning-ink md:col-span-2">
              {generated.payload.caveats.join(' ')}
            </p>
          ) : null}
        </div>
      ) : null}
    </Card>
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
    <Card
      key={fact.label}
      render={<article />}
      padding="md"
      className="min-w-0"
    >
      <div className="flex items-start gap-3">
        <span aria-hidden className={iconChip}>
          {fact.icon}
        </span>
        <div className="min-w-0">
          <SectionLabel>{fact.label}</SectionLabel>
          <p className="mt-2 truncate text-base font-semibold">{fact.value}</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">
            {fact.detail}
          </p>
        </div>
      </div>
    </Card>
  )
}

function renderEmptyState({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return <EmptyState title={title} detail={description} />
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
