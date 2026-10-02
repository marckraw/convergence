/*
 * The motion tokens for TypeScript (MAR-3615 DS2): timers, Motion transitions
 * and anything else that wants numbers instead of CSS. They mirror
 * src/styles/tokens.css, and tokens.test.ts fails if the two drift apart.
 * Distances and scales are not repeated here: they go to zero under reduced
 * motion, which only CSS knows, so a part hands var(--motion-shift) and
 * friends to whatever animates it.
 */

/** Durations in milliseconds. */
export const durationsMs = {
  /** --motion-exit: a popup leaving. */
  exit: 100,
  /** --motion-fast: a popup arriving, a hover, a colour change, the sidebar fold. */
  fast: 150,
  /** --motion-panel: Loom's shell and other panels. */
  panel: 200,
  /** --motion-slow: rare, guided moments (Learn Loom). */
  slow: 350,
  /** --motion-pulse: the notifications pulse. */
  pulse: 600,
  /** --motion-loop: one turn of a spinner. */
  loop: 1000,
  /** --motion-blink: one beat of a pulsing dot. */
  blink: 2000,
  /** --motion-wire: how long a canvas wire stays lit after a hop lands. */
  wire: 1800,
  /** --motion-breath: one breath of a working card's glow. */
  breath: 2800,
  /** --motion-tooltip-delay: how long the pointer rests before a tooltip shows. */
  tooltipDelay: 200,
  /** --motion-tooltip-warm: after a tooltip closes, how long the next one still shows at once. */
  tooltipWarm: 300,
} as const

/** Cubic béziers, CSS keywords written out, as Motion and the Web Animations API take them. */
export const easings = {
  /** --motion-ease: Tailwind's ease-out, things settling. */
  out: [0, 0, 0.2, 1],
  /** --motion-ease-in: Tailwind's ease-in. */
  in: [0.4, 0, 1, 1],
  /** --motion-ease-move: Tailwind's default transition, things moving and staying. */
  move: [0.4, 0, 0.2, 1],
  /** --motion-ease-enter: the CSS keyword ease-out, the popups' entrance. */
  enter: [0, 0, 0.58, 1],
  /** --motion-ease-exit: the CSS keyword ease-in, the popups' exit. */
  exit: [0.42, 0, 1, 1],
  /** --motion-ease-guide: the CSS keyword ease-in-out, Learn Loom. */
  guide: [0.42, 0, 0.58, 1],
  /** --motion-ease-blink: a pulsing dot. */
  blink: [0.4, 0, 0.6, 1],
} as const satisfies Record<string, readonly [number, number, number, number]>
