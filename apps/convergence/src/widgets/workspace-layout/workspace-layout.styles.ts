export const workspaceLayoutStyles = {
  rootBottom: 'flex h-full min-h-0 flex-col',
  rootSide: 'flex h-full min-h-0 flex-row',
  mainSlot: 'flex min-h-0 min-w-0 flex-1 flex-col',
  conversationDock:
    'flex shrink-0 flex-col border-t border-line-soft bg-surface px-4 py-3 text-sm text-ink-muted',
  conversationDockTitle: 'text-xs font-medium text-ink',
  conversationDockBody: 'mt-1 text-xs',
} as const
