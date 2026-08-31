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
        action={{ label: 'Open a project', onSelect: onCreate }}
      />,
    )

    fireEvent.click(screen.getByRole('combobox', { name: /select project/i }))

    fireEvent.click(
      await screen.findByRole('button', { name: /open a project/i }),
    )

    expect(onCreate).toHaveBeenCalledTimes(1)
  })

  it('shows a disabled item its reason in full, without a hover', async () => {
    // A row listed but not choosable owes an explanation where it sits: there
    // is no tooltip in this popover, so a truncated reason is a mystery rather
    // than an answer. Descriptions on choosable rows are supplementary and
    // keep their single line.
    render(
      <SearchableSelect
        selectedId="local"
        value="Local"
        items={[
          { id: 'local', label: 'Local', description: 'This machine' },
          {
            id: 'kuba',
            label: 'kuba-vps',
            description:
              'Pi has no counterpart on the agents daemon, so it can only ' +
              'run here.',
            disabled: true,
          },
        ]}
        onChange={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('combobox', { name: /local/i }))

    const reason = await screen.findByText(
      'Pi has no counterpart on the agents daemon, so it can only run here.',
    )
    expect(reason).not.toHaveClass('truncate')
    expect(screen.getByText('This machine')).toHaveClass('truncate')
  })

  it('renders a selected item badge and allows searching by badge text', async () => {
    render(
      <SearchableSelect
        selectedId="google"
        value="Google"
        items={[
          {
            id: 'google',
            label: 'Google',
            description: 'Antigravity CLI',
            badge: {
              label: 'ALPHA',
              title: 'Early provider support',
            },
          },
          { id: 'openai', label: 'OpenAI' },
        ]}
        onChange={vi.fn()}
        searchPlaceholder="Search providers..."
      />,
    )

    expect(screen.getByRole('combobox', { name: /google/i })).toHaveTextContent(
      'ALPHA',
    )

    fireEvent.click(screen.getByRole('combobox', { name: /google/i }))
    const input = await screen.findByPlaceholderText('Search providers...')
    fireEvent.change(input, { target: { value: 'alpha' } })

    expect(screen.getAllByText('Google').length).toBeGreaterThanOrEqual(2)
    expect(screen.queryByText('OpenAI')).not.toBeInTheDocument()
  })
})
