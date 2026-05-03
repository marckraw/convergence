export const workspaceLayoutStyles = {
  rootBottom: 'flex h-full min-h-0 flex-col',
  rootSide: 'flex h-full min-h-0 flex-row',
  mainSlot: 'flex min-h-0 min-w-0 flex-1 flex-col',
  conversationDock:
    'flex shrink-0 flex-col border-t border-border/60 bg-card px-4 py-3 text-sm text-muted-foreground',
  conversationDockTitle: 'text-xs font-medium text-foreground',
  conversationDockBody: 'mt-1 text-xs',
} as const
