import type { FC } from 'react'
import { Sparkles } from 'lucide-react'
import type { CodeReviewGuideContent } from '@/entities/code-review-guide'
import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/lib/cn.pure'

interface CodeReviewGuideRailProps {
  guide: CodeReviewGuideContent
  activeSectionId: string | null
  loading: boolean
  generating: boolean
  generationStatusLabel: string | null
  canGenerate: boolean
  onSelectSection: (sectionId: string) => void
  onGenerateGuide: () => void
}

export const CodeReviewGuideRail: FC<CodeReviewGuideRailProps> = ({
  guide,
  activeSectionId,
  loading,
  generating,
  generationStatusLabel,
  canGenerate,
  onSelectSection,
  onGenerateGuide,
}) => (
  <aside className="flex min-h-0 flex-col border-r border-border">
    <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-3">
      <span className="text-xs font-semibold uppercase text-muted-foreground">
        Guide
      </span>
      <span className="text-xs text-muted-foreground">
        {guide.sections.length}
      </span>
    </div>
    <div className="border-b border-border px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] uppercase text-muted-foreground">
            {guide.generatedBy === 'agent' ? 'AI guide' : 'Draft guide'}
          </p>
          {generating || loading ? (
            <p
              className="mt-1 truncate text-xs text-muted-foreground"
              title={
                generating
                  ? (generationStatusLabel ?? 'Generating...')
                  : 'Loading diffs...'
              }
            >
              {generating
                ? (generationStatusLabel ?? 'Generating...')
                : 'Loading diffs...'}
            </p>
          ) : null}
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs"
          disabled={!canGenerate || generating}
          onClick={onGenerateGuide}
        >
          <Sparkles className="h-3.5 w-3.5" />
          {guide.generatedBy === 'agent' ? 'Regenerate' : 'Generate'}
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
            className={cn(
              'mb-1 flex h-auto min-h-[58px] w-full min-w-0 items-start justify-start gap-2 whitespace-normal rounded-md border px-2.5 py-2 text-left transition-colors',
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
              <span className="block text-xs leading-4 text-muted-foreground">
                {section.files.length} files · {section.riskLevel} risk
              </span>
            </span>
          </Button>
        )
      })}
    </div>
  </aside>
)
