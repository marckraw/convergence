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
 * an app token that already carries both themes (`light-dark()`, picked by
 * `data-theme`, MAR-3615), so one mapping themes both modes and the two can
 * never drift apart.
 *
 * Set on the canvas wrapper rather than in a stylesheet: custom properties
 * inherit, so the cage holds -- nothing outside this widget is restyled.
 */
export const CANVAS_THEME_VARS = {
  // The zoom/fit panel, the loudest offender.
  '--xy-controls-button-background-color': 'var(--raised)',
  '--xy-controls-button-background-color-hover': 'var(--highlight)',
  '--xy-controls-button-color': 'var(--ink-muted)',
  '--xy-controls-button-color-hover': 'var(--ink)',
  '--xy-controls-button-border-color': 'var(--line)',
  '--xy-controls-box-shadow': 'none',

  // The dot grid: our own line tone, so it sits under the wires rather than
  // competing with them.
  '--xy-background-pattern-dots-color': 'var(--line)',

  // Kept visible for the licence, but as quiet chrome rather than a white tab.
  '--xy-attribution-background-color': 'transparent',

  // Defaults behind anything we do not style per element. Our edges set their
  // own stroke, but an unstyled one must still not arrive as library blue.
  '--xy-edge-stroke': 'var(--line)',
  '--xy-edge-stroke-selected': 'var(--ink)',
  '--xy-edge-label-background-color': 'var(--raised)',
  '--xy-edge-label-color': 'var(--ink)',

  // We render every node ourselves, so these only matter if a node type is ever
  // added without its own skin. Pointing them at the room means that mistake
  // shows up as unstyled-but-ours, never as a white box.
  '--xy-node-background-color': 'var(--surface)',
  '--xy-node-color': 'var(--ink)',
  '--xy-node-border': '1px solid var(--line)',
  '--xy-node-boxshadow-selected': 'none',
  '--xy-node-boxshadow-hover': 'none',
  '--xy-node-group-background-color': 'transparent',

  '--xy-selection-background-color':
    'color-mix(in srgb, var(--highlight) 25%, transparent)',
  '--xy-selection-border': '1px solid var(--line)',
} as CSSProperties

/** A full-height column: the room, the crew canvas and its empty state. */
export const ROOM_COLUMN_CLASS = 'flex h-full min-h-0 flex-col'

/**
 * The column a canvas inspector opens in, beside the diagram: 340 px on the
 * spacing scale, one constant for the four panels (MC-11), which wrote it out
 * as an arbitrary width each.
 */
export const INSPECTOR_COLUMN_CLASS = 'w-85 shrink-0'

/**
 * Wires attach to every node's ports, but a canvas you cannot draw on must
 * never show them (MC-35: one constant for the session, chair and spawn
 * nodes, which wrote it out eight times).
 */
export const CANVAS_HIDDEN_HANDLE =
  '!size-0 !min-h-0 !min-w-0 !border-0 !bg-transparent'

/**
 * The magnetic edge handle (R10), visible only while the canvas is authorable,
 * in the connect tone (info, the colour a draft wire is drawn in). Generous
 * rather than pixel-exact: the canvas sets `connectionRadius` so a release NEAR
 * a handle lands on it.
 */
export const CANVAS_DRAW_HANDLE =
  '!size-2.5 !rounded-full !border !border-canvas !bg-info-solid !opacity-80 hover:!opacity-100'
