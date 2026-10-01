/*
 * The field frame (MAR-3616 DS3c): the one look Input, Textarea and
 * SearchField's box share, so a form's fields sit side by side as one family.
 * It is today's Input (R0): a transparent fill inside a control-line border
 * (MAR-3460's 3:1 edge), the control shadow, 14 px text, muted placeholder.
 * Invalid turns the border to the danger colour (today an Input didn't
 * change); disabled dims it. The ring is the caller's, by where it sits:
 * focusRingField on a bare field, focusRingWithin on a box around one.
 */

/** R3: one scale for every control, as a prop, never a class. */
export type ControlSize = 'xs' | 'sm' | 'md' | 'lg'

/** 24, 28, 32 and 36 px: DS2's control heights. */
export const controlHeight: Record<ControlSize, string> = {
  xs: 'h-control-xs',
  sm: 'h-control-sm',
  md: 'h-control-md',
  lg: 'h-control-lg',
}

/** The frame itself: border, fill, shadow, type, invalid and disabled. */
export const controlFrame = [
  'w-full min-w-0 rounded-md border border-control-line bg-transparent text-sm shadow-control transition-colors',
  'placeholder:text-ink-muted',
  'aria-invalid:border-danger-solid data-invalid:border-danger-solid',
  'data-disabled:opacity-50',
  'app-no-drag',
].join(' ')
