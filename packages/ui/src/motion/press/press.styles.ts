/**
 * Press (MAR-3616): anything you press shrinks to 97% while it's held and
 * eases back. Plain CSS on :active, so the click never waits and nothing runs
 * in JavaScript. It uses Tailwind's `transition` (colors, opacity, shadow and
 * transform), so it replaces `transition-colors` rather than joining it.
 * Button and IconButton press already; add this to anything else that is
 * clicked. Reduced motion: nothing shrinks, the colors still change.
 *
 * A feel change, not a look change at rest; dropping it from Button is a
 * one-line veto.
 */
export const press = 'transition motion-safe:active:scale-[0.97]'
