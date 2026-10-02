/**
 * The chevron that turns a quarter as something opens (MAR-3616), the one
 * CollapsibleTrigger draws: a disclosure that can't be a Collapsible (one
 * control that also changes its words) wears it on a ChevronRight and adds
 * `rotate-90` while open. It stands still under reduced motion and simply
 * points the new way.
 */
export const disclosureChevron =
  'shrink-0 transition-transform duration-fast motion-reduce:transition-none'
