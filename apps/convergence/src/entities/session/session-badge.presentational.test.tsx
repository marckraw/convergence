import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { SessionBadge } from './session-badge.presentational'

it('MAR-3288 R5 draws a busy glyph, not the finished check, while compacting — mutation ignore the prop turns red', () => {
  const { container, rerender } = render(
    <SessionBadge attention="finished" status="completed" compacting />,
  )
  expect(
    screen.getByRole('img', { name: 'Compacting context…' }),
  ).toBeInTheDocument()
  expect(container.querySelector('[data-tone="success"]')).toBeNull()

  rerender(<SessionBadge attention="finished" status="completed" />)
  expect(screen.queryByLabelText('Compacting context…')).toBeNull()
  expect(container.querySelector('[data-tone="success"]')).not.toBeNull()
})

it.each([
  ['needs-approval', 'warning'],
  // R1: waiting on you is warning, for an answer as for an approval.
  ['needs-input', 'warning'],
  ['finished', 'success'],
  ['failed', 'danger'],
] as const)('a settled %s session wears the %s tone', (attention, tone) => {
  const { container } = render(
    <SessionBadge attention={attention} status="completed" />,
  )
  expect(container.querySelector(`[data-tone="${tone}"]`)).not.toBeNull()
  expect(container.querySelector('[data-slot="spinner"]')).toBeNull()
})

it('a session at work spins in the working tone, info, and no settled one (MC-1)', () => {
  const { container } = render(
    <SessionBadge attention="none" status="running" />,
  )
  expect(container.querySelector('[data-slot="spinner"]')).not.toBeNull()
  // Mutation: paint the spinner muted again (no data-tone) -> red.
  expect(
    [...container.querySelectorAll('[data-tone]')].map((node) =>
      node.getAttribute('data-tone'),
    ),
  ).toEqual(['info'])
})

it('a host out of reach is its own glyph in the warning tone, never the spinner (NAV-1)', () => {
  const { container } = render(
    <SessionBadge attention="host-unreachable" status="running" />,
  )
  // Mutation: drop host-unreachable from GLYPHS -> the info spinner, red.
  expect(container.querySelector('[data-tone="warning"]')).not.toBeNull()
  expect(container.querySelector('[data-slot="spinner"]')).toBeNull()
})
