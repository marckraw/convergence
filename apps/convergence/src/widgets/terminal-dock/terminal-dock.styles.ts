/** The dock: dark on the terminal's own background in both themes (R12). */
export const dockStyles = {
  rootBottom: 'flex shrink-0 flex-col border-t border-line-soft bg-terminal-bg',
  rootLeft: 'flex shrink-0 flex-row border-r border-line-soft bg-terminal-bg',
  rootRight: 'flex shrink-0 flex-row border-l border-line-soft bg-terminal-bg',
  inner: 'flex min-h-0 min-w-0 flex-1',
  mainRoot: 'flex min-h-0 flex-1 bg-canvas px-4 py-4',
  mainFrame:
    'flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl border border-line-soft bg-terminal-bg',
} as const
