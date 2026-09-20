import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ContextAlertSettings } from '@/entities/app-settings'
import { parseContextAlertSettings } from '@/shared/lib/context-alert-settings.pure'
import {
  ContextAlertFields,
  clampPercent,
  clampTokens,
} from './context-alert-fields.presentational'

const alert: ContextAlertSettings = {
  enabled: true,
  percent: 75,
  tokens: 400000,
}

function renderFields(overrides: Partial<ContextAlertSettings> = {}) {
  const onChange = vi.fn()
  render(
    <ContextAlertFields
      alert={{ ...alert, ...overrides }}
      onChange={onChange}
    />,
  )
  return { onChange }
}

describe('ContextAlertFields', () => {
  it('renders the three controls from props', () => {
    renderFields()

    expect(
      screen.getByRole('switch', {
        name: 'Warn me when a conversation fills up',
      }),
    ).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByLabelText('Alert at % of the window')).toHaveValue(75)
    expect(screen.getByLabelText('…or at this many tokens')).toHaveValue(400000)
    expect(
      screen.getByText(
        'Empty = no token cap. Whichever limit is reached first raises the alert.',
      ),
    ).toBeInTheDocument()
  })

  it('calls back with null when the token field is emptied', () => {
    const { onChange } = renderFields()

    fireEvent.change(screen.getByLabelText('…or at this many tokens'), {
      target: { value: '' },
    })

    expect(onChange).toHaveBeenCalledWith({ ...alert, tokens: null })
  })

  it('calls back with 80 when 80 is typed into the percent field', () => {
    const { onChange } = renderFields()

    fireEvent.change(screen.getByLabelText('Alert at % of the window'), {
      target: { value: '80' },
    })

    expect(onChange).toHaveBeenCalledWith({ ...alert, percent: 80 })
  })

  it('calls back with the typed token cap', () => {
    const { onChange } = renderFields()

    fireEvent.change(screen.getByLabelText('…or at this many tokens'), {
      target: { value: '250000' },
    })

    expect(onChange).toHaveBeenCalledWith({ ...alert, tokens: 250000 })
  })

  it('toggles the switch', () => {
    const { onChange } = renderFields()

    fireEvent.click(
      screen.getByRole('switch', {
        name: 'Warn me when a conversation fills up',
      }),
    )

    expect(onChange).toHaveBeenCalledWith({ ...alert, enabled: false })
  })

  it('disables both number fields when the switch is off', () => {
    renderFields({ enabled: false })

    expect(screen.getByLabelText('Alert at % of the window')).toBeDisabled()
    expect(screen.getByLabelText('…or at this many tokens')).toBeDisabled()
  })

  it('shows an empty token field for no cap', () => {
    renderFields({ tokens: null })

    expect(screen.getByLabelText('…or at this many tokens')).toHaveValue(null)
  })
})

describe('what the fields are allowed to emit', () => {
  it('clamps a percent into the range the parser keeps', () => {
    expect(clampPercent('0')).toBe(1)
    expect(clampPercent('120')).toBe(99)
    expect(clampPercent('80')).toBe(80)
  })

  it('leaves the percent alone when the field says nothing numeric', () => {
    expect(clampPercent('')).toBeNull()
  })

  it('reads an empty token field as no cap and clamps to the floor', () => {
    expect(clampTokens('')).toBeNull()
    expect(clampTokens('  ')).toBeNull()
    expect(clampTokens('500')).toBe(1000)
    expect(clampTokens('250000')).toBe(250000)
  })

  it('emits only thresholds the settings parser keeps unchanged', () => {
    // The reader refuses a value the record would rewrite: every number this
    // dialog can produce has to survive `parseContextAlertSettings` as given,
    // or the user would see one threshold and the app would store another.
    const percents = ['', '0', '1', '50', '99', '120', '9999']
    const caps = ['', '0', '1', '999', '1000', '400000', '5000000']

    for (const rawPercent of percents) {
      for (const rawCap of caps) {
        const percent = clampPercent(rawPercent) ?? alert.percent
        const emitted: ContextAlertSettings = {
          enabled: true,
          percent,
          tokens: clampTokens(rawCap),
        }
        expect(
          parseContextAlertSettings(emitted),
          `${rawPercent} / ${rawCap}`,
        ).toEqual(emitted)
      }
    }
  })
})
