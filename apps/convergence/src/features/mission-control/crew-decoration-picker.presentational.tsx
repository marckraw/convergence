import type { FC } from 'react'
import { Ban } from 'lucide-react'
import { cn, IconButton } from '@convergence/ui'
import {
  CREW_ACCENT_COLORS,
  CREW_EMOJI_CHOICES,
  crewColor,
} from './session-crew-picker.pure'
import { CREW_ROW_CLASS } from './session-filter.styles'

interface CrewDecorationPickerProps {
  emoji: string | null
  accentColor: string | null
  onEmojiChange: (emoji: string | null) => void
  onAccentColorChange: (accentColor: string | null) => void
}

/**
 * Emoji and accent color for a crew, in one row each.
 *
 * Decoration is first-class rather than a later setting: the accent drives the
 * container border and every chip that stands for the crew, so it is chosen
 * where the crew is born. Picking the active choice again clears it — a crew
 * is allowed to be plain.
 */
export const CrewDecorationPicker: FC<CrewDecorationPickerProps> = ({
  emoji,
  accentColor,
  onEmojiChange,
  onAccentColorChange,
}) => {
  return (
    <div className="flex flex-col gap-2">
      <div role="group" aria-label="Crew emoji" className={CREW_ROW_CLASS}>
        {CREW_EMOJI_CHOICES.map((choice) => (
          <IconButton
            label={`Emoji ${choice}`}
            key={choice}
            type="button"
            variant="ghost"
            pressed={emoji === choice}
            onClick={() => onEmojiChange(emoji === choice ? null : choice)}
            size="xs"
            className={cn(
              'rounded-md border',
              // R7: the chosen one is the raised chip, which pressed draws.
              emoji === choice
                ? 'border-hairline-strong'
                : 'border-transparent hover:border-hairline-strong',
            )}
          >
            {/* The glyph's size is the glyph's, as an icon's is (R3). */}
            <span aria-hidden="true" className="text-xs leading-none">
              {choice}
            </span>
          </IconButton>
        ))}
      </div>

      <div
        role="group"
        aria-label="Crew accent color"
        className={CREW_ROW_CLASS}
      >
        {CREW_ACCENT_COLORS.map((choice) => (
          <IconButton
            label={choice.label}
            key={choice.value}
            type="button"
            variant="ghost"
            pressed={accentColor === choice.value}
            onClick={() =>
              onAccentColorChange(
                accentColor === choice.value ? null : choice.value,
              )
            }
            // The swatch paints with the hue's token; the hex is what's stored.
            style={{ backgroundColor: crewColor(choice.value) ?? undefined }}
            size="xs"
            className={cn(
              'rounded-full border-2 transition-transform hover:bg-transparent',
              // The chosen swatch grows and wears an ink ring, which reads on
              // a light window as well as a dark one.
              accentColor === choice.value
                ? 'scale-110 border-ink/70'
                : 'border-transparent hover:border-hairline-strong',
            )}
          />
        ))}

        {accentColor ? (
          <IconButton
            label="No accent color"
            type="button"
            variant="quiet"
            onClick={() => onAccentColorChange(null)}
            size="xs"
            className="rounded-full border border-hairline-strong"
          >
            <Ban className="size-3" />
          </IconButton>
        ) : null}
      </div>
    </div>
  )
}
