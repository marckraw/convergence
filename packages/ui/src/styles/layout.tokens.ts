/*
 * The layout widths in pixels (MAR-3615 DS2), for TypeScript that does
 * arithmetic on what CSS draws: whether Parallel work docks beside the
 * conversation or opens over it, where the actions panel moves. They mirror
 * the --layout-* tokens in tokens.css, and layout.tokens.test.ts fails if the
 * two drift apart.
 */
export const layoutPx = {
  /** --layout-conversation: the transcript and composer column (max-w-conversation). */
  conversation: 672,
  /** --layout-conversation-gutter: each side of that column beside a docked panel. */
  conversationGutter: 24,
  /** --layout-side-panel: the PR and Space panels (w-side-panel). */
  sidePanel: 320,
  /** --layout-work-panel: the docked Parallel work panel (w-work-panel). */
  workPanel: 420,
  /** --layout-dialog: a dialog's default width (max-w-dialog). */
  dialog: 720,
  /** --layout-dialog-height: a dialog's greatest height (max-h-dialog). */
  dialogHeight: 720,
} as const
