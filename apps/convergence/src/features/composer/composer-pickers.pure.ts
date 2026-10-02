/**
 * Which inline picker the message field drives (CONV-6, CONV-30): the `::`
 * root, the `@` mention, `::skill::` and `::prompt::`. One at a time is open;
 * the view draws them and hands their keys to the one this says.
 */
export type ComposerPickerKind = 'root' | 'mention' | 'skill' | 'prompt'

/** One picker, as the field sees it. */
export interface ComposerPicker {
  /** Drawn over the field. */
  open: boolean
  /** How many rows it lists. */
  count: number
  /** Its active row. */
  active: number
  /** Its list is on its way or couldn't load, so there is no list to drive. */
  waiting?: boolean
}

export type ComposerPickers = Record<ComposerPickerKind, ComposerPicker>

/** The order the pickers sit in over the field. */
const LIST_ORDER: readonly ComposerPickerKind[] = [
  'root',
  'mention',
  'skill',
  'prompt',
]

/** The order the field offers its keys in. */
const KEY_ORDER: readonly ComposerPickerKind[] = [
  'root',
  'skill',
  'prompt',
  'mention',
]

/**
 * The root and mention pickers are only there while they show rows; the skill
 * and prompt pickers say why they are empty, and Escape closes them then too.
 */
const KEYED_ONLY_WITH_ROWS: ReadonlySet<ComposerPickerKind> = new Set([
  'root',
  'mention',
])

/**
 * The list the field names to assistive tech (aria-controls) and its active
 * row (aria-activedescendant): the first open picker with a list to drive
 * whose active row is one of its rows. Null when there is none, so the field
 * names nothing.
 */
export function composerDrivenList(
  pickers: ComposerPickers,
): { kind: ComposerPickerKind; active: number } | null {
  for (const kind of LIST_ORDER) {
    const picker = pickers[kind]
    if (
      picker.open &&
      !picker.waiting &&
      picker.active >= 0 &&
      picker.active < picker.count
    ) {
      return { kind, active: picker.active }
    }
  }
  return null
}

/**
 * The picker the field's keys go to, with its rows and its active row: the
 * arrows move the active row, Enter picks it, Escape closes it. Null when
 * none takes them, so the keys are the field's own.
 */
export function composerKeyedPicker(
  pickers: ComposerPickers,
): { kind: ComposerPickerKind; count: number; active: number } | null {
  for (const kind of KEY_ORDER) {
    const picker = pickers[kind]
    if (!picker.open) continue
    if (KEYED_ONLY_WITH_ROWS.has(kind) && picker.count === 0) continue
    return { kind, count: picker.count, active: picker.active }
  }
  return null
}
