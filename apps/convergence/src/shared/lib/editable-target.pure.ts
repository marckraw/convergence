/** The target shape used by keyboard shortcuts, independent of the DOM runtime. */
interface ShortcutTarget {
  tagName?: string
  isContentEditable?: boolean
  getAttribute?: (name: string) => string | null
}

export function isEditableTarget(target: unknown): boolean {
  if (typeof target !== 'object' || target === null) return false
  const element = target as ShortcutTarget
  const tag = element.tagName?.toUpperCase()
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return element.isContentEditable === true
}

/** A listbox or its option keeps `/` for typeahead instead of opening Loom search. */
export function isListboxTarget(target: unknown): boolean {
  if (typeof target !== 'object' || target === null) return false
  const role = (target as ShortcutTarget).getAttribute?.('role')
  return role === 'option' || role === 'listbox'
}
