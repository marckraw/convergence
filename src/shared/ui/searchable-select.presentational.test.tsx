import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SearchableSelect } from './searchable-select.container'

describe('SearchableSelect', () => {
  it('filters by label and description, then selects an item', async () => {
    const onChange = vi.fn()

    render(
      <SearchableSelect
        selectedId="alpha"
        value="Alpha"
        items={[
          { id: 'alpha', label: 'Alpha', description: '/tmp/alpha' },
          { id: 'beta', label: 'Beta', description: '/tmp/projects/beta' },
          { id: 'gamma', label: 'Gamma', description: '/tmp/gamma' },
        ]}
        onChange={onChange}
        searchPlaceholder="Search projects..."
      />,
    )

    fireEvent.click(screen.getByRole('combobox', { name: /alpha/i }))

    const input = await screen.findByPlaceholderText('Search projects...')
    fireEvent.change(input, { target: { value: 'projects/beta' } })

    expect(screen.getByText('Beta')).toBeInTheDocument()
    expect(screen.queryByText('Gamma')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('Beta'))

    expect(onChange).toHaveBeenCalledWith('beta')
  })

  it('keeps the footer action available even when no items match', async () => {
    const onCreate = vi.fn()

    render(
      <SearchableSelect
        selectedId={null}
        value="Select project"
        items={[]}
        onChange={vi.fn()}
        action={{ label: 'Create Project', onSelect: onCreate }}
      />,
    )

    fireEvent.click(screen.getByRole('combobox', { name: /select project/i }))

    fireEvent.click(
      await screen.findByRole('button', { name: /create project/i }),
    )

    expect(onCreate).toHaveBeenCalledTimes(1)
  })
})
