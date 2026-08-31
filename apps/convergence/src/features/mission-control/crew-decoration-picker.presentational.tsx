import type { FC } from 'react'
import { Ban } from 'lucide-react'
import { cn } from '@/shared/lib/cn.pure'
import { Button } from '@/shared/ui/button'
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
          <Button
            key={choice}
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Emoji ${choice}`}
            aria-pressed={emoji === choice}
            onClick={() => onEmojiChange(emoji === choice ? null : choice)}
            className={cn(
              'size-6 rounded-md border p-0 text-xs leading-none',
              emoji === choice
                ? 'border-white/40 bg-white/10'
                : 'border-transparent hover:border-white/20',
            )}
          >
            {choice}
          </Button>
        ))}
      </div>

      <div
        role="group"
        aria-label="Crew accent color"
        className="flex flex-wrap items-center gap-1"
      >
        {CREW_ACCENT_COLORS.map((choice) => (
          <Button
            key={choice.value}
            type="button"
            variant="ghost"
            size="icon"
            aria-label={choice.label}
            aria-pressed={accentColor === choice.value}
            onClick={() =>
              onAccentColorChange(
                accentColor === choice.value ? null : choice.value,
              )
            }
            className={cn(
              'size-5 rounded-full border-2 p-0 transition-transform hover:bg-transparent',
              accentColor === choice.value
                ? 'scale-110 border-white/70'
                : 'border-transparent hover:border-white/30',
            )}
            style={{ backgroundColor: choice.value }}
          />
        ))}

        {accentColor ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="No accent color"
            onClick={() => onAccentColorChange(null)}
            className="size-5 rounded-full border border-white/15 p-0 text-muted-foreground hover:text-foreground"
          >
            <Ban className="size-3" />
          </Button>
        ) : null}
      </div>
    </div>
  )
}
