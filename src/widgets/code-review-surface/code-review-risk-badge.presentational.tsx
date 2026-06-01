import type { FC } from 'react'
import type { CodeReviewGuideSection } from '@/entities/code-review-guide'
import { getCodeReviewGuideRiskRationale } from '@/entities/code-review-guide'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/shared/ui/tooltip'
import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/lib/cn.pure'

interface CodeReviewRiskBadgeProps {
  section: CodeReviewGuideSection
}

export const CodeReviewRiskBadge: FC<CodeReviewRiskBadgeProps> = ({
  section,
}) => {
  const rationale = getCodeReviewGuideRiskRationale(section)
  const risk = section.riskLevel

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              'h-auto shrink-0 cursor-help rounded border px-2 py-1 text-[10px] font-medium uppercase hover:bg-transparent',
              risk === 'high' && 'border-destructive/40 text-destructive',
              risk === 'medium' && 'border-amber-500/40 text-amber-600',
              risk === 'low' && 'border-emerald-500/40 text-emerald-600',
            )}
            aria-label={`${risk} risk: ${rationale}`}
          >
            {risk} risk
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="end" className="max-w-72 text-xs">
          {rationale}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
