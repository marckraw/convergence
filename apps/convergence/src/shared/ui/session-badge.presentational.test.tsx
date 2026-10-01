import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { SessionBadge } from './session-badge.presentational'

it('MAR-3288 R5 draws a busy glyph, not the finished check, while compacting — mutation ignore the prop turns red', () => {
  const { container, rerender } = render(
    <SessionBadge attention="finished" status="completed" compacting />,
  )
  expect(screen.getByRole('status')).toHaveTextContent('Compacting context…')
  expect(container.querySelector('[data-tone="success"]')).toBeNull()

  rerender(<SessionBadge attention="finished" status="completed" />)
  expect(screen.queryByRole('status')).toBeNull()
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

it('a session at work spins, with no tone of a settled state', () => {
  const { container } = render(
    <SessionBadge attention="none" status="running" />,
  )
  expect(container.querySelector('[data-slot="spinner"]')).not.toBeNull()
  expect(container.querySelector('[data-tone]')).toBeNull()
})
