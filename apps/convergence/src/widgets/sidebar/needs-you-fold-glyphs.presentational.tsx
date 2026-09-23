import {
  cardStateTone,
  foldedSectionSummary,
  type NeedsYouCardModel,
} from '@/features/needs-you'
import { cn } from '@/shared/lib/cn.pure'
import { LOOM_NO_DRAG_STYLE } from '@/shared/ui/no-drag.styles'
import { ProviderIcon } from '@/shared/ui/provider-icon.presentational'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'

/**
 * What a folded section still says (MAR-3366 R4): one provider glyph per
 * card tinted by the card's own state tone (R6), `+N` past the limit, and
 * the conversation names on hover.
 */
export function FoldedGlyphs({
  section,
  cards,
}: {
  section: string
  cards: NeedsYouCardModel[]
}) {
  const summary = foldedSectionSummary(section, cards)
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            role="img"
            aria-label={summary.names.join(', ')}
            tabIndex={0}
            data-fold-glyphs=""
            className="flex shrink-0 items-center gap-0.5 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {summary.glyphs.map((glyph) => (
              <span
                key={glyph.sessionId}
                data-fold-glyph=""
                data-state={glyph.state}
                className="flex"
              >
                <ProviderIcon
                  providerId={glyph.providerId}
                  title=""
                  className={cn('size-3', cardStateTone[glyph.state])}
                />
              </span>
            ))}
            {summary.overflow > 0 && (
              <span className="tabular-nums">+{summary.overflow}</span>
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent side="right" style={LOOM_NO_DRAG_STYLE}>
          <ul className="space-y-0.5">
            {summary.names.map((name, index) => (
              <li key={`${index}:${name}`}>{name}</li>
            ))}
          </ul>
        </TooltipContent>
      </Tooltip>
      {summary.line && (
        <span className="min-w-0 truncate font-normal">{summary.line}</span>
      )}
    </>
  )
}
