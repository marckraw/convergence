import { CheckCircle2, Layers, Pencil, Timer } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { LoomSheet } from './wave-panel-sheet.pure'

/**
 * The four sheets' icons, one map (MAR-3201 R2, MC-24).
 *
 * The stack, the folded strip and the guide's illustration all draw these,
 * so folding the column never changes a glyph and the lesson shows the very
 * icons of the panel it teaches.
 */
export const LOOM_SHEET_ICONS: Readonly<Record<LoomSheet, LucideIcon>> = {
  before: CheckCircle2,
  now: Timer,
  next: Layers,
  plan: Pencil,
}

/**
 * What colour each sheet's icon wears, in one place, in R1's tones: Before
 * holds what landed (success), Now what is under way (info, the colour a
 * working session wears everywhere); Next and Plan stay in the text's colour.
 * Written once so the stack, the strip and the guide cannot drift apart.
 */
export const LOOM_SHEET_ICON_CLASS: Readonly<Record<LoomSheet, string>> = {
  before: 'text-success-ink',
  now: 'text-info-ink',
  next: '',
  plan: '',
}
