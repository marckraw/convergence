export const dockStyles = {
  rootBottom: 'flex shrink-0 flex-col border-t border-border/60 bg-[#0b0b0f]',
  rootLeft: 'flex shrink-0 flex-row border-r border-border/60 bg-[#0b0b0f]',
  rootRight: 'flex shrink-0 flex-row border-l border-border/60 bg-[#0b0b0f]',
  inner: 'flex min-h-0 min-w-0 flex-1',
  mainRoot: 'flex min-h-0 flex-1 bg-background px-4 py-4',
  mainFrame:
    'flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl border border-border/60 bg-[#0b0b0f]',
} as const
