import type { CSSProperties } from 'react'

/**
 * React Flow's own theme, rewritten in the room's palette.
 *
 * The library ships light defaults and a `.dark` block of its own greys, and
 * neither is our chrome -- stock controls read as a white browser widget
 * dropped onto the canvas. Setting `colorMode` alone only swaps one set of
 * borrowed greys for another, so the variables are pointed at the app's tokens
 * instead.
 *
 * There is deliberately no light map and dark map. Every value here resolves to
 * an app token that already swaps under `.dark`, so one mapping themes both
 * modes and the two can never drift apart.
 *
 * Set on the canvas wrapper rather than in a stylesheet: custom properties
 * inherit, so the cage holds -- nothing outside this widget is restyled.
 */
export const CANVAS_THEME_VARS = {
  // The zoom/fit panel, the loudest offender.
  '--xy-controls-button-background-color': 'var(--popover)',
  '--xy-controls-button-background-color-hover': 'var(--accent)',
  '--xy-controls-button-color': 'var(--muted-foreground)',
  '--xy-controls-button-color-hover': 'var(--foreground)',
  '--xy-controls-button-border-color': 'var(--border)',
  '--xy-controls-box-shadow': 'none',

  // The dot grid: our own border tone, so it sits under the wires rather than
  // competing with them.
  '--xy-background-pattern-dots-color': 'var(--border)',

  // Kept visible for the licence, but as quiet chrome rather than a white tab.
  '--xy-attribution-background-color': 'transparent',

  // Defaults behind anything we do not style per element. Our edges set their
  // own stroke, but an unstyled one must still not arrive as library blue.
  '--xy-edge-stroke': 'var(--border)',
  '--xy-edge-stroke-selected': 'var(--foreground)',
  '--xy-edge-label-background-color': 'var(--popover)',
  '--xy-edge-label-color': 'var(--foreground)',

  // We render every node ourselves, so these only matter if a node type is ever
  // added without its own skin. Pointing them at the room means that mistake
  // shows up as unstyled-but-ours, never as a white box.
  '--xy-node-background-color': 'var(--card)',
  '--xy-node-color': 'var(--foreground)',
  '--xy-node-border': '1px solid var(--border)',
  '--xy-node-boxshadow-selected': 'none',
  '--xy-node-boxshadow-hover': 'none',
  '--xy-node-group-background-color': 'transparent',

  '--xy-selection-background-color':
    'color-mix(in srgb, var(--accent) 25%, transparent)',
  '--xy-selection-border': '1px solid var(--border)',
} as CSSProperties
