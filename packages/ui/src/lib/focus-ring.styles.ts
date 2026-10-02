/*
 * The focus ring (MAR-3616): a solid line in the ring color (--ring), shown
 * only when the keyboard moved the focus (focus-visible), never on a click.
 * One recipe in four placements; pick by where the element sits, never by
 * taste, and never type the classes out again.
 *
 * It keeps today's look (R0): 1 px, as the kit's `ring-1` drew it on Button,
 * Input, Textarea and the dialog's close button. The width is one token,
 * `--focus-width` in tokens.css, so a redesign raises it in one place.
 *
 * Each recipe names the ring's style (outline-solid) as well as its width. In
 * Tailwind 4, outline-none sets --tw-outline-style to none and a width alone
 * draws in var(--tw-outline-style), so "outline-none focus-visible:outline-1"
 * draws nothing: every hand-typed copy of that recipe is an invisible ring
 * (MAR-3588). The parts' stories check the ring is really drawn.
 */

/** The ring itself, drawn, and only for the keyboard: each placement adds its offset. */
const drawn = [
  'outline-none',
  'focus-visible:outline-solid',
  'focus-visible:outline-(length:--focus-width)',
  'focus-visible:outline-ring',
].join(' ')

/**
 * Around the element, against its edge: buttons, toggles, links, anything
 * that stands free. Button and IconButton have it already.
 */
export const focusRing = [drawn, 'focus-visible:outline-offset-0'].join(' ')

/**
 * Inside the element's edge: for what fills a frame that clips it, like a row
 * in a scrolled list, where a ring outside would be cut off.
 */
export const focusRingInset = [
  drawn,
  'focus-visible:-outline-offset-(--focus-width)',
].join(' ')

/**
 * Over a field's 1 px border: Input, Textarea and a select's trigger, so the
 * border and the ring read as one line and fields side by side ring alike.
 */
export const focusRingField = [drawn, 'focus-visible:-outline-offset-1'].join(
  ' ',
)

/**
 * Around a box whose focusable part is hidden inside it, like a label drawn as
 * a button around a file input: it rings when what's inside has the focus.
 */
export const focusRingWithin = [
  'has-focus-visible:outline-solid',
  'has-focus-visible:outline-(length:--focus-width)',
  'has-focus-visible:outline-ring',
  'has-focus-visible:outline-offset-0',
].join(' ')
