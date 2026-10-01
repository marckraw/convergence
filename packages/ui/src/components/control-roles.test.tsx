import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { focusRingField } from '#lib/focus-ring.styles'
import { Input } from './input/input'
import { Textarea } from './textarea/textarea'
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
 * ring or the decorative `--input` hairline. Input and Textarea share the
 * field frame (MAR-3616 DS3c); their stories check the drawn colours.
 */
function renderSelect() {
  render(
    <Select defaultValue="one">
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
  it('the Select focus ring is the full ring, with no opacity modifier', () => {
    const trigger = classes(renderSelect())
    expect(trigger).toContain('focus-visible:ring-ring')
    expect(trigger.filter((name) => name.includes('ring-ring/'))).toEqual([])
  })

  it('the Select outline is the control border', () => {
    const trigger = classes(renderSelect())
    expect(trigger).toContain('border-control-border')
    expect(trigger).not.toContain('border-input')
  })

  it.each([
    ['Input', () => render(<Input aria-label="Name" />)],
    ['Textarea', () => render(<Textarea aria-label="Name" />)],
  ])(
    'the %s outline is the control line and its ring is the field ring',
    (_name, renderField) => {
      renderField()
      const field = classes(screen.getByRole('textbox', { name: 'Name' }))
      expect(field).toContain('border-control-line')
      expect(field).not.toContain('border-input')
      for (const ring of focusRingField.split(' ')) {
        expect(field).toContain(ring)
      }
      expect(field.filter((name) => name.includes('ring-ring/'))).toEqual([])
    },
  )
})
