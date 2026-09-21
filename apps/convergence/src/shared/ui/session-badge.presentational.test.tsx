import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { SessionBadge } from './session-badge.presentational'

it('MAR-3288 R5 draws a busy glyph, not the finished check, while compacting — mutation ignore the prop turns red', () => {
  const { container, rerender } = render(
    <SessionBadge attention="finished" status="completed" compacting />,
  )
  expect(screen.getByLabelText('Compacting context…')).toBeInTheDocument()
  expect(container.querySelector('.text-emerald-500')).toBeNull()

  rerender(<SessionBadge attention="finished" status="completed" />)
  expect(screen.queryByLabelText('Compacting context…')).toBeNull()
  expect(container.querySelector('.text-emerald-500')).not.toBeNull()
})
