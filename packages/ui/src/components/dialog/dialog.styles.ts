/**
 * A flush dialog's two panes (FormDialog's `flush`, or a DialogContent whose
 * body fills it): a rail of sections or filters beside the page, and the rail
 * above the page when the window is too narrow for both. Settings, the local
 * model tunnels and the model picker are drawn this way.
 */
export const dialogSplit = 'flex min-h-0 flex-1 flex-col sm:flex-row'

/**
 * The rail in a `dialogSplit`: it keeps its width, and a hairline parts it
 * from the page, at its end beside the page and under it when the two stack.
 * Its width, fill and padding are the caller's.
 */
export const dialogRail =
  'shrink-0 border-b border-line-soft sm:border-r sm:border-b-0'
