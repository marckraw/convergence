import type { FC } from 'react'
import { Ban } from 'lucide-react'
import { cn, IconButton } from '@convergence/ui'
import {
  CREW_ACCENT_COLORS,
  CREW_EMOJI_CHOICES,
} from './session-crew-picker.pure'

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
      <div
        role="group"
        aria-label="Crew emoji"
        className="flex flex-wrap items-center gap-1"
      >
        {CREW_EMOJI_CHOICES.map((choice) => (
          <IconButton
            label={`Emoji ${choice}`}
            key={choice}
            type="button"
            variant="ghost"
            aria-pressed={emoji === choice}
            onClick={() => onEmojiChange(emoji === choice ? null : choice)}
            size="xs"
            className={cn(
              'rounded-md border text-xs leading-none',
              emoji === choice
                ? 'border-white/40 bg-white/10'
                : 'border-transparent hover:border-white/20',
            )}
          >
            {choice}
          </IconButton>
        ))}
      </div>

      <div
        role="group"
        aria-label="Crew accent color"
        className="flex flex-wrap items-center gap-1"
      >
        {CREW_ACCENT_COLORS.map((choice) => (
          <IconButton
            label={choice.label}
            key={choice.value}
            type="button"
            variant="ghost"
            aria-pressed={accentColor === choice.value}
            onClick={() =>
              onAccentColorChange(
                accentColor === choice.value ? null : choice.value,
              )
            }
            style={{ backgroundColor: choice.value }}
            size="xs"
            className={cn(
              'rounded-full border-2 transition-transform hover:bg-transparent',
              accentColor === choice.value
                ? 'scale-110 border-white/70'
                : 'border-transparent hover:border-white/30',
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
            className="rounded-full border border-white/15"
          >
            <Ban className="size-3" />
          </IconButton>
        ) : null}
      </div>
    </div>
  )
}
