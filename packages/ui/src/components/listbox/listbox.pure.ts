/** The id of a Listbox's row, which the field's aria-activedescendant names. */
export const listboxOptionId = (listId: string, index: number): string =>
  `${listId}-option-${index}`

/** A key press, as the field heard it. */
type ListboxKey = { key: string; ctrlKey?: boolean }

/** How the steps behave at the ends. */
type ListboxStepOptions = {
  /** Past the last row comes the first, and before the first the last. On unless said. */
  loop?: boolean
}

/**
 * The step a press means: Control-N and Control-J step down, Control-P and
 * Control-K up, as in a terminal and as cmdk had them.
 */
const stepKey = ({ key, ctrlKey = false }: ListboxKey): string => {
  if (!ctrlKey) return key
  if (key === 'n' || key === 'j') return 'ArrowDown'
  if (key === 'p' || key === 'k') return 'ArrowUp'
  return key
}

/**
 * Where a key moves a Listbox's active row, from the field that drives it:
 * ArrowDown and ArrowUp (or Control-N and -J, Control-P and -K) step one
 * row, Home and End jump to the ends. With `loop` (the default) the steps
 * wrap round the ends; without, they stop there. With no active row yet,
 * ArrowDown starts at the top and ArrowUp at the bottom. `undefined` for any
 * other key, or with no rows, so the field leaves the key alone (Home and End
 * move the caret while there is no list).
 */
export function listboxStep(
  active: number | null,
  count: number,
  press: ListboxKey,
  { loop = true }: ListboxStepOptions = {},
): number | undefined {
  if (count <= 0) return undefined
  const last = count - 1
  switch (stepKey(press)) {
    case 'ArrowDown':
      if (active === null) return 0
      return active < last ? active + 1 : loop ? 0 : last
    case 'ArrowUp':
      if (active === null) return last
      return active > 0 ? active - 1 : loop ? last : 0
    case 'Home':
      return 0
    case 'End':
      return last
    default:
      return undefined
  }
}
