import type { FC } from 'react'
import { Ban } from 'lucide-react'
import { RadioGroup, RadioSwatch } from '@convergence/ui'
import { CrewMark } from './crew-mark.presentational'
import {
  CREW_ACCENT_COLORS,
  CREW_EMOJI_CHOICES,
} from './session-crew-picker.pure'
import { CREW_SWATCH_ROW_CLASS } from './session-filter.styles'

interface CrewDecorationPickerProps {
  emoji: string | null
  accentColor: string | null
  onEmojiChange: (emoji: string | null) => void
  onAccentColorChange: (accentColor: string | null) => void
}

/** The "none" choice's value: no emoji or colour is stored as null. */
const NONE = 'none'

/**
 * Emoji and accent color for a crew, in one row each.
 *
 * Decoration is first-class rather than a later setting: the accent drives the
 * container border and every chip that stands for the crew, so it is chosen
 * where the crew is born. Each row is one choice of many, so it is a radio
 * group (R9) of swatches, the chosen one the raised chip (R7, ruling 11), with
 * "none" a choice of its own: a crew is allowed to be plain.
 */
export const CrewDecorationPicker: FC<CrewDecorationPickerProps> = ({
  emoji,
  accentColor,
  onEmojiChange,
  onAccentColorChange,
}) => (
  <div className="flex flex-col gap-2">
    <RadioGroup
      aria-label="Crew emoji"
      value={emoji ?? NONE}
      onValueChange={(value: string) =>
        onEmojiChange(value === NONE ? null : value)
      }
      className={CREW_SWATCH_ROW_CLASS}
    >
      <RadioSwatch value={NONE} label="No emoji">
        <Ban className="size-3" />
      </RadioSwatch>
      {CREW_EMOJI_CHOICES.map((choice) => (
        <RadioSwatch key={choice} value={choice} label={`Emoji ${choice}`}>
          {/* The glyph's size is the glyph's, as an icon's is (R3). */}
          <span className="text-xs">{choice}</span>
        </RadioSwatch>
      ))}
    </RadioGroup>

    <RadioGroup
      aria-label="Crew accent color"
      // Stored as a hex in whatever case the picker sent; the palette's is
      // lower case, as crewHue reads it.
      value={accentColor?.toLowerCase() ?? NONE}
      onValueChange={(value: string) =>
        onAccentColorChange(value === NONE ? null : value)
      }
      className={CREW_SWATCH_ROW_CLASS}
    >
      <RadioSwatch value={NONE} label="No accent color">
        <Ban className="size-3" />
      </RadioSwatch>
      {CREW_ACCENT_COLORS.map((choice) => (
        <RadioSwatch
          key={choice.value}
          value={choice.value}
          label={choice.label}
        >
          {/* The swatch paints with the hue's token; the hex is what's stored. */}
          <CrewMark
            crew={{
              name: choice.label,
              emoji: null,
              accentColor: choice.value,
            }}
            variant="swatch"
          />
        </RadioSwatch>
      ))}
    </RadioGroup>
  </div>
)
