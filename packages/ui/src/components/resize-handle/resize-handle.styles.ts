/**
 * The resize line's look (MAR-3616, MC-32): a 1 px line in a 13 px hit area,
 * a hairline under the pointer, a stronger one while it is held, and the
 * focus colour for the keyboard, in both themes. ResizeHandle draws it; a
 * handle that keeps a gesture of its own (Loom's column, which commits a width
 * only when the drag ends) wears it too, so the look has one home (MC-18).
 */
export const resizeHandleStyles = {
  base: 'app-no-drag relative z-10 shrink-0 touch-none bg-clip-content outline-none transition-colors select-none hover:bg-hairline active:bg-hairline-strong focus-visible:bg-focus',
  /** A line running down between panes side by side: it sizes a width. */
  vertical:
    '-mx-1.5 w-px cursor-col-resize self-stretch border-x-6 border-x-transparent',
  /** A line across, between panes stacked: it sizes a height. */
  horizontal:
    '-my-1.5 h-px w-full cursor-row-resize border-y-6 border-y-transparent',
} as const
