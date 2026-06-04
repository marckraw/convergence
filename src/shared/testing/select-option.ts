import { fireEvent, screen } from '@testing-library/react'

export function selectOption(
  comboboxName: string | RegExp,
  optionName: string | RegExp,
): void {
  fireEvent.click(screen.getByRole('combobox', { name: comboboxName }))
  fireEvent.click(screen.getByRole('option', { name: optionName }))
}
