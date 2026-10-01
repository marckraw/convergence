import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { focusRingField } from '#lib/focus-ring.styles'
import { Input } from './input/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select/select'

/**
 * MAR-3460: the shared field controls paint the tested roles — an opaque
 * focus ring and the control border that clears 3:1 — not the translucent
 * ring or the decorative `--input` hairline.
 */
function renderSelect() {
  render(
    <Select items={[{ value: 'one', label: 'One' }]} defaultValue="one">
      <SelectTrigger aria-label="Pick">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="one">One</SelectItem>
      </SelectContent>
    </Select>,
  )
  return screen.getByRole('combobox', { name: 'Pick' })
}

const classes = (element: HTMLElement): string[] =>
  element.className.split(/\s+/)

describe('shared field controls use the theme roles', () => {
  it('the Select focus ring is the field ring over its border (MAR-3616), drawn in the full ring colour', () => {
    const trigger = classes(renderSelect())
    for (const name of focusRingField.split(' '))
      expect(trigger).toContain(name)
    expect(trigger.filter((name) => name.includes('ring-ring/'))).toEqual([])
  })

  it('the Select outline is the control line', () => {
    const trigger = classes(renderSelect())
    expect(trigger).toContain('border-control-line')
    expect(trigger).not.toContain('border-input')
  })

  it('the Input outline is the control border and its ring is the full ring', () => {
    render(<Input aria-label="Name" />)
    const input = classes(screen.getByRole('textbox', { name: 'Name' }))
    expect(input).toContain('border-control-border')
    expect(input).not.toContain('border-input')
    expect(input).toContain('focus-visible:ring-ring')
    expect(input.filter((name) => name.includes('ring-ring/'))).toEqual([])
  })
})
