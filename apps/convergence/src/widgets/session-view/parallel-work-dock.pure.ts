import { layoutPx } from '@convergence/ui'

export type ParallelDockMode = 'dock' | 'overlay'

/**
 * The docked Parallel work panel's width (`w-work-panel`, the
 * --layout-work-panel token); the docked panel renders from it.
 */
export const PARALLEL_WORK_PANEL_WIDTH = layoutPx.workPanel

/**
 * The PR and Space panels' width (SidePanel's `w-side-panel`, the
 * --layout-side-panel token), paid out of the same row when they are open.
 */
export const SIDE_PANEL_WIDTH = layoutPx.sidePanel

/**
 * The narrowest conversation that still reads as a conversation beside a
 * docked panel (MAR-3426 CH2). The transcript and composer sit in a
 * `max-w-conversation` column (672 px); the gutter each side keeps that
 * column whole, so docking never squeezes what is being read or typed.
 */
export const MIN_CONVERSATION_WIDTH =
  layoutPx.conversation + 2 * layoutPx.conversationGutter

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
