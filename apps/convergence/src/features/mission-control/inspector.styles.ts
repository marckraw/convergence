/**
 * The shell every canvas inspector shares (MC-11): a column that scrolls on
 * its own beside the diagram, a hairline at its start. Its width is the
 * column the canvas opens it in (`INSPECTOR_COLUMN_CLASS`).
 */
export const INSPECTOR_SHELL_CLASS =
  'flex h-full min-h-0 flex-col gap-3 overflow-y-auto border-l border-hairline px-4 py-3'

/** A footnote at an inspector's foot: what the panel does and does not do. */
export const INSPECTOR_NOTE_CLASS = 'text-3xs text-ink-muted'

/**
 * A checkbox or a switch with its words, inside an inspector: smaller and
 * quieter than a settings row's ChoiceField, so a seat's or a crew's options
 * stay below the facts they qualify.
 */
export const INSPECTOR_CHOICE_CLASS =
  'flex items-center gap-2 text-xs text-ink-muted'
