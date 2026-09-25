export type ParallelDockMode = 'dock' | 'overlay'

/** The docked Parallel work panel's width; the docked panel renders from it. */
export const PARALLEL_WORK_PANEL_WIDTH = 420

/**
 * The PR and Space panels' width (`w-80`), paid out of the same row when they
 * are open. Pinned against their class names by the pure test.
 */
export const SIDE_PANEL_WIDTH = 320

/**
 * The narrowest conversation that still reads as a conversation beside a
 * docked panel (MAR-3426 CH2). The transcript and composer sit in a
 * `max-w-2xl` column (672 px); 720 keeps that column whole with a 24 px
 * gutter each side, so docking never squeezes what is being read or typed.
 */
export const MIN_CONVERSATION_WIDTH = 720

/**
 * Dock or overlay, decided by the conversation's own space (MAR-3426 R1).
 *
 * `rowWidth` is the session view's root row: the sidebar and Loom sit outside
 * it, so they are already paid for. `otherDockedWidths` are the panels that
 * share the row with Parallel work (PR, Space) -- 0 when closed. What is left
 * after all of them is the conversation; below the bound, Parallel work opens
 * over it instead.
 */
export function parallelDockMode({
  rowWidth,
  panelWidth,
  otherDockedWidths,
  minConversationWidth,
}: {
  rowWidth: number
  panelWidth: number
  otherDockedWidths: readonly number[]
  minConversationWidth: number
}): ParallelDockMode {
  const others = otherDockedWidths.reduce((sum, width) => sum + width, 0)
  return rowWidth - panelWidth - others >= minConversationWidth
    ? 'dock'
    : 'overlay'
}
