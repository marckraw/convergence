/**
 * The one surface every popup is drawn on (MAR-3616, R8): menus, selects,
 * popovers and the combobox lists. Opaque, a hairline in the line colour, the
 * raised fill and its shadow: today's `rounded-md border bg-popover
 * text-popover-foreground shadow-md`, in DS2's names (R0). Glass belongs to
 * tooltips alone. Each popup adds its own padding: `p-1` around a list's
 * items, `p-4` around a popover's words.
 *
 * A module of its own, so a panel drawn by hand that should look like a popup
 * (a picker that keeps the focus in its field) can take the surface without
 * the motion and the rows.
 */
export const popupSurface =
  'rounded-md border border-line bg-raised text-ink shadow-raised'
