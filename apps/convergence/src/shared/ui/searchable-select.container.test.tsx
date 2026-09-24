import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SearchableSelect } from './searchable-select.container'

const ITEMS = [
  { id: 'alpha', label: 'Alpha' },
  { id: 'beta', label: 'Beta' },
]

/** Controlled `open` (MAR-3393): opt-in, and a no-op for every caller without it. */
describe('SearchableSelect open state', () => {
  it('owns its open state when no `open` is passed', async () => {
    const onOpenChange = vi.fn()
    render(
      <SearchableSelect
        selectedId="alpha"
        value="Alpha"
        items={ITEMS}
        onChange={vi.fn()}
        searchPlaceholder="Search..."
        onOpenChange={onOpenChange}
      />,
    )
    expect(screen.queryByPlaceholderText('Search...')).toBeNull()
    fireEvent.click(screen.getByRole('combobox', { name: /alpha/i }))
    expect(await screen.findByPlaceholderText('Search...')).toBeInTheDocument()
    expect(onOpenChange).toHaveBeenCalledWith(true)
  })

  it('opens from outside its trigger when controlled, and reports closing', async () => {
    const onOpenChange = vi.fn()
    const { rerender } = render(
      <SearchableSelect
        selectedId="alpha"
        value="Alpha"
        items={ITEMS}
        onChange={vi.fn()}
        searchPlaceholder="Search..."
        open={false}
        onOpenChange={onOpenChange}
      />,
    )
    expect(screen.queryByPlaceholderText('Search...')).toBeNull()

    rerender(
      <SearchableSelect
        selectedId="alpha"
        value="Alpha"
        items={ITEMS}
        onChange={vi.fn()}
        searchPlaceholder="Search..."
        open
        onOpenChange={onOpenChange}
      />,
    )
    const search = await screen.findByPlaceholderText('Search...')
    fireEvent.keyDown(search, { key: 'Escape' })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('never opens while disabled, even when asked to', () => {
    render(
      <SearchableSelect
        selectedId="alpha"
        value="Alpha"
        items={ITEMS}
        onChange={vi.fn()}
        searchPlaceholder="Search..."
        disabled
        open
        onOpenChange={vi.fn()}
      />,
    )
    expect(screen.queryByPlaceholderText('Search...')).toBeNull()
  })
})
