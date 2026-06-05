import type { FC } from 'react'
import {
  AlertCircle,
  ListTree,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
} from 'lucide-react'
import type { CodeReviewGuideContent } from '@/entities/code-review-guide'
import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/lib/cn.pure'

interface CodeReviewGuideRailProps {
  guide: CodeReviewGuideContent
  activeSectionId: string | null
  loading: boolean
  generating: boolean
  canGenerate: boolean
  hasPersistedGuide: boolean
  error: string | null
  collapsed: boolean
  onToggleCollapsed: () => void
  onSelectSection: (sectionId: string) => void
  onGenerateGuide: () => void
}

export const CodeReviewGuideRail: FC<CodeReviewGuideRailProps> = ({
  guide,
  activeSectionId,
  loading,
  generating,
  canGenerate,
  hasPersistedGuide,
  error,
  collapsed,
  onToggleCollapsed,
  onSelectSection,
  onGenerateGuide,
}) => {
  const status = getGuideRailStatus({
    guide,
    loading,
    generating,
    hasPersistedGuide,
    error,
  })

  if (collapsed) {
    return (
      <aside className="flex min-h-0 flex-col items-center border-r border-border">
        <div className="flex h-10 w-full shrink-0 items-center justify-center border-b border-border">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="Expand guide sections"
            aria-label="Expand guide sections"
            onClick={onToggleCollapsed}
          >
            <PanelLeftOpen className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col items-center gap-2 px-1 py-2">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card"
            title={status.detail}
          >
            {status.icon === 'error' ? (
              <AlertCircle className="h-3.5 w-3.5 text-destructive" />
            ) : null}
            {status.icon === 'loading' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            ) : null}
            {status.icon === 'none' ? (
              <ListTree className="h-3.5 w-3.5 text-muted-foreground" />
            ) : null}
          </div>
          <span className="rounded-md border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {guide.sections.length}
          </span>
        </div>
      </aside>
    )
  }

  return (
    <aside className="flex min-h-0 flex-col border-r border-border">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-3">
        <span className="text-xs font-semibold uppercase text-muted-foreground">
          Guide
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {guide.sections.length}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="Collapse guide sections"
            aria-label="Collapse guide sections"
            onClick={onToggleCollapsed}
          >
            <PanelLeftClose className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="border-b border-border px-3 py-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-1.5">
              {status.icon === 'error' ? (
                <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
              ) : null}
              {status.icon === 'loading' ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
              ) : null}
              <p
                className={cn(
                  'truncate text-[10px] font-medium uppercase',
                  status.tone,
                )}
              >
                {status.label}
              </p>
            </div>
            <p
              className="mt-1 line-clamp-2 text-xs leading-4 text-muted-foreground"
              title={status.detail}
            >
              {status.detail}
            </p>
          </div>
          <Button
            type="button"
            variant={error ? 'destructive' : 'secondary'}
            size="sm"
            className="h-7 shrink-0 gap-1.5 px-2 text-xs"
            disabled={!canGenerate || generating}
            onClick={onGenerateGuide}
          >
            <Sparkles className="h-3.5 w-3.5" />
            {error
              ? 'Retry'
              : guide.generatedBy === 'agent'
                ? 'Regenerate'
                : 'Generate'}
          </Button>
        </div>
      </div>
      <div className="app-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
        {guide.sections.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">
            No guide sections yet.
          </p>
        ) : null}
        {guide.sections.map((section, index) => {
          const active = activeSectionId === section.id
          return (
            <Button
              key={section.id}
              type="button"
              variant="ghost"
              aria-current={active ? 'step' : undefined}
              className={cn(
                'mb-1 flex h-auto min-h-[62px] w-full min-w-0 items-start justify-start gap-2 whitespace-normal rounded-md border px-2.5 py-2 text-left transition-colors',
                active
                  ? 'border-primary/50 bg-primary/10'
                  : 'border-transparent hover:border-border hover:bg-accent',
              )}
              onClick={() => onSelectSection(section.id)}
            >
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border text-[10px] text-muted-foreground">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm leading-5 font-medium">
                  {section.title}
                </span>
                <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs leading-4 text-muted-foreground">
                  <span
                    className={cn(
                      'h-1.5 w-1.5 shrink-0 rounded-full',
                      section.riskLevel === 'high' && 'bg-destructive',
                      section.riskLevel === 'medium' && 'bg-amber-500',
                      section.riskLevel === 'low' && 'bg-emerald-500',
                    )}
                  />
                  <span className="truncate">
                    {section.files.length} files · {section.riskLevel} risk
                  </span>
                </span>
              </span>
            </Button>
          )
        })}
      </div>
    </aside>
  )
}

function getGuideRailStatus(input: {
  guide: CodeReviewGuideContent
  loading: boolean
  generating: boolean
  hasPersistedGuide: boolean
  error: string | null
}): {
  label: string
  detail: string
  icon: 'error' | 'loading' | 'none'
  tone: string
} {
  if (input.error) {
    return {
      label: 'Guide failed',
      detail: input.error,
      icon: 'error',
      tone: 'text-destructive',
    }
  }

  if (input.generating) {
    return {
      label: 'Generating AI guide',
      detail: 'Building walkthrough chapters',
      icon: 'loading',
      tone: 'text-muted-foreground',
    }
  }

  if (input.loading) {
    return {
      label: input.hasPersistedGuide
        ? 'Refreshing cached guide'
        : 'Loading cached guide',
      detail: 'Checking saved guide and file diffs',
      icon: 'loading',
      tone: 'text-muted-foreground',
    }
  }

  if (input.guide.generatedBy === 'agent') {
    return {
      label: 'Cached AI guide',
      detail: 'Saved for this review state',
      icon: 'none',
      tone: 'text-emerald-600',
    }
  }

  if (input.hasPersistedGuide) {
    return {
      label: 'Cached draft guide',
      detail: 'Saved deterministic walkthrough',
      icon: 'none',
      tone: 'text-muted-foreground',
    }
  }

  if (input.guide.sections.length === 0) {
    return {
      label: 'No guide available',
      detail: 'Refresh review data or generate after files load',
      icon: 'none',
      tone: 'text-muted-foreground',
    }
  }

  return {
    label: 'Draft guide',
    detail: 'Generated locally from changed files',
    icon: 'none',
    tone: 'text-amber-600',
  }
}
