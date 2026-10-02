/*
 * The field frame (MAR-3616 DS3c): the one look Input, Textarea and
 * SearchField's box share, so a form's fields sit side by side as one family.
 * It is today's Input (R0): a transparent fill inside a control-line border
 * (MAR-3460's 3:1 edge), the control shadow, 14 px text, muted placeholder.
 * Invalid turns the border to the danger colour (today an Input didn't
 * change); disabled dims it. The ring is the caller's, by where it sits:
 * focusRingField on a bare field, focusRingWithin on a box around one.
 */
import { focusRingField } from './focus-ring.styles'

/** R3: one scale for every control, as a prop, never a class. */
export type ControlSize = 'xs' | 'sm' | 'md' | 'lg'

/** 24, 28, 32 and 36 px: DS2's control heights. */
export const controlHeight: Record<ControlSize, string> = {
  xs: 'h-control-xs',
  sm: 'h-control-sm',
  md: 'h-control-md',
  lg: 'h-control-lg',
}

/**
 * The frame's look without a width: border, fill, shadow, type, invalid
 * (`aria-invalid`, or a Field's `data-invalid`) and disabled. A trigger that
 * is as wide as its value wears this; a field that fills its row wears
 * `controlFrame`.
 */
export const controlFrameLook = [
  'rounded-md border border-control-line bg-transparent text-sm shadow-control transition-colors',
  'placeholder:text-ink-muted',
  'aria-invalid:border-danger-solid data-invalid:border-danger-solid',
  'data-disabled:opacity-50',
  'app-no-drag',
].join(' ')

/** The frame itself, filling its row: Input, Textarea and SearchField. */
export const controlFrame = ['w-full min-w-0', controlFrameLook].join(' ')

/**
 * A field that opens a list of choices (DS-15, DLG-15): SelectTrigger, and a
 * Combobox in a form (`variant="field"`). The frame, its ring over the
 * border, the value at the start and the chevron at the end; no fill on
 * hover, as an Input has none.
 */
export const fieldTrigger = [
  controlFrameLook,
  'flex items-center justify-between gap-2 whitespace-nowrap select-none',
  focusRingField,
  'data-disabled:pointer-events-none',
  "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
].join(' ')

/** The trigger's height, padding and type by size (R3): today's SelectTrigger (R0). */
export const fieldTriggerSize: Record<ControlSize, string> = {
  xs: 'h-6 px-2 text-xs',
  sm: 'h-7 px-2.5 text-xs',
  md: 'h-8 px-3 text-sm',
  lg: 'h-9 px-3 text-sm',
}
