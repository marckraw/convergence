import { fireEvent, screen } from '@testing-library/react'

/**
 * A pointer presses an option of an open Select, as a person's click does:
 * Base UI's Select takes a press that starts on the option, so the click
 * carries its pointerdown (MAR-3616). A click alone, with nothing before it,
 * reads as the end of the press that opened the list and picks nothing.
 */
export function pressOption(option: Element): void {
  fireEvent.pointerDown(option)
  fireEvent.click(option)
}

/** Opens the Select named `comboboxName` and picks its option `optionName`. */
export function selectOption(
  comboboxName: string | RegExp,
  optionName: string | RegExp,
): void {
  fireEvent.click(screen.getByRole('combobox', { name: comboboxName }))
  pressOption(screen.getByRole('option', { name: optionName }))
}
