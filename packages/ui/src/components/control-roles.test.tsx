import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { focusRing, focusRingField } from '#lib/focus-ring.styles'
import { Button } from './button/button'
import { Checkbox } from './checkbox/checkbox'
import { Field, FieldLabel } from './field/field'
import { Input } from './input/input'
import { Switch } from './switch/switch'
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
    expect(trigger.filter((name) => name.includes('ring-focus/'))).toEqual([])
  })

  it('the Select outline is the control line', () => {
    const trigger = classes(renderSelect())
    expect(trigger).toContain('border-control-line')
    expect(trigger).not.toContain('border-control-fill')
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
      expect(field).not.toContain('border-control-fill')
      for (const ring of focusRingField.split(' ')) {
        expect(field).toContain(ring)
      }
      expect(field.filter((name) => name.includes('ring-focus/'))).toEqual([])
    },
  )

  it('the Select marks invalid as Input does: the danger border, by aria-invalid or its Field (DS-15)', () => {
    const trigger = classes(renderSelect())
    expect(trigger).toContain('aria-invalid:border-danger-solid')
    expect(trigger).toContain('data-invalid:border-danger-solid')
    expect(trigger.filter((name) => name.includes('danger-ink'))).toEqual([])
    render(<Input aria-label="Name" />)
    const input = classes(screen.getByRole('textbox', { name: 'Name' }))
    for (const name of trigger.filter((n) => n.includes('invalid:')))
      expect(input).toContain(name)
  })

  it('a Select in an invalid Field shows it, as an Input there does (DS-15)', () => {
    render(
      <Field invalid>
        <FieldLabel nativeLabel={false} render={<div />}>
          Kind
        </FieldLabel>
        <Select items={[{ value: 'one', label: 'One' }]} defaultValue="one">
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="one">One</SelectItem>
          </SelectContent>
        </Select>
      </Field>,
    )
    const trigger = screen.getByRole('combobox', { name: 'Kind' })
    expect(trigger).toHaveAttribute('data-invalid')
    expect(classes(trigger)).toContain('data-invalid:border-danger-solid')
  })

  it.each([
    [
      'the secondary Button',
      () => render(<Button variant="secondary">Name</Button>),
      'button',
    ],
    ['the Switch', () => render(<Switch aria-label="Name" />), 'switch'],
    ['the Checkbox', () => render(<Checkbox aria-label="Name" />), 'checkbox'],
  ] as const)(
    '%s outline is the control line and its ring is the standing ring (DS-16)',
    (_name, renderControl, role) => {
      renderControl()
      const control = classes(screen.getByRole(role, { name: 'Name' }))
      expect(control).toContain('border-control-line')
      expect(control.filter((name) => name.includes('control-fill'))).toEqual(
        [],
      )
      for (const ring of focusRing.split(' ')) expect(control).toContain(ring)
      expect(control.filter((name) => name.includes('ring-focus/'))).toEqual([])
    },
  )
})
