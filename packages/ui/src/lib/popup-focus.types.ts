/*
 * The words a popup's focus is choreographed in (MAR-3616), so app code that
 * hands focus around a Menu, a Popover or a Dialog reads them without
 * importing Base UI: why the popup opened or closed, and where the focus goes
 * when it has gone.
 */

/**
 * Why a popup opened or closed, as its `onOpenChange` says it:
 * `trigger-press`, `item-press`, `outside-press`, `escape-key`, `focus-out`,
 * `close-press`… and the event that did it (a right-click outside is a
 * `pointerdown` whose `button` is 2).
 */
export type PopupOpenChangeDetails = {
  reason: string
  event: Event
}

/**
 * How the popup was closed, as `finalFocus` is told: `mouse`, `touch`, `pen`,
 * `keyboard`, or empty when nothing says.
 */
export type PopupCloseType = string

/**
 * Where the focus goes when a popup has closed, its exit included: an element
 * to focus, `true` for the default (what opened it), `false` or nothing to
 * leave it where it is.
 */
export type PopupFinalFocus = (
  closeType: PopupCloseType,
) => HTMLElement | boolean | null | undefined
