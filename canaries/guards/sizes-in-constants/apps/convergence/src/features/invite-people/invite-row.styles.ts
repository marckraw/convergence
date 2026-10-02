// Sizes kept in constants, where a regex on a part's tag can't read them: a
// Button stretched into a row, a pick row's words resized by a function, a
// Notice shrunk by name. Each is a prop (R3, ruling 10).
export const inviteRowStyles = {
  row: 'h-auto w-full justify-start px-3 text-left',
  quiet: 'text-ink-muted hover:text-ink',
}

export function invitePickClass(selected: boolean): string {
  return selected ? 'bg-fill-selected text-sm' : 'text-sm'
}

export const inviteNoticeClass = 'text-2xs'
