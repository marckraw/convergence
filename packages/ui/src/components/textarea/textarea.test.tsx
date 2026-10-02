import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Textarea } from './textarea'

describe('Textarea', () => {
  // Its scrollbar is the app's one, which global.css draws for every element:
  // the part names no app class (NAV-34; the inert app-scrollbar is gone).
  it('names no app class for its scrollbar', () => {
    render(<Textarea aria-label="Notes" />)

    expect(screen.getByRole('textbox')).not.toHaveClass('app-scrollbar')
  })
})
