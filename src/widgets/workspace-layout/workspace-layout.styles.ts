export const workspaceLayoutStyles = {
  root: 'flex h-full min-h-0 flex-col',
  mainSlot: 'flex min-h-0 flex-1',
  conversationDock:
    'flex shrink-0 flex-col border-t border-border/60 bg-card px-4 py-3 text-sm text-muted-foreground',
  conversationDockTitle: 'text-xs font-medium text-foreground',
  conversationDockBody: 'mt-1 text-xs',
} as const
