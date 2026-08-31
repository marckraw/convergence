export const drawerStyles = {
  shell: 'flex h-[min(80vh,640px)] flex-col gap-3',
  header:
    'flex items-center justify-between gap-2 border-b border-border/70 pb-3',
  empty:
    'flex flex-1 items-center justify-center text-sm text-muted-foreground',
  list: 'app-scrollbar -mx-4 flex-1 overflow-y-auto px-4',
  row: 'rounded-md border border-border/60 bg-card/40 px-3 py-2 text-xs leading-snug',
  rowHeader:
    'flex items-center gap-2 font-mono text-[11px] text-muted-foreground',
  channel: 'inline-flex h-5 items-center rounded px-1 text-[10px] font-medium',
  payload:
    'mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap break-words text-[11px] text-foreground/80',
}
