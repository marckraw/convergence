import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Textarea } from './textarea'

describe('Textarea', () => {
  it('applies the shared app scrollbar styles by default', () => {
    render(<Textarea aria-label="Notes" />)

    expect(screen.getByRole('textbox')).toHaveClass('app-scrollbar')
  })
})
