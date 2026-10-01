import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Combobox } from './combobox'

const ITEMS = [
  { id: 'alpha', label: 'Alpha' },
  { id: 'beta', label: 'Beta' },
]

describe('Combobox', () => {
  it('filters by label and description, then selects an item', async () => {
    const onChange = vi.fn()

    render(
      <Combobox
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
      <Combobox
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

  it('lists a disabled item with its reason, and a click does not pick it', async () => {
    const onChange = vi.fn()
    render(
      <Combobox
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
        onChange={onChange}
      />,
    )

    fireEvent.click(screen.getByRole('combobox', { name: /local/i }))

    const option = await screen.findByRole('option', { name: /kuba-vps/ })
    expect(option).toHaveAttribute('aria-disabled', 'true')
    expect(
      screen.getByText(
        'Pi has no counterpart on the agents daemon, so it can only run here.',
      ),
    ).toBeInTheDocument()
    fireEvent.click(option)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('renders a selected item badge and allows searching by badge text', async () => {
    render(
      <Combobox
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

  it('says so, with no empty listbox, when nothing matches', async () => {
    render(
      <Combobox
        selectedId="alpha"
        value="Alpha"
        items={ITEMS}
        onChange={vi.fn()}
        searchPlaceholder="Search..."
        emptyMessage={(query) => `No options match “${query}”`}
      />,
    )
    fireEvent.click(screen.getByRole('combobox', { name: /alpha/i }))
    const input = await screen.findByPlaceholderText('Search...')
    fireEvent.change(input, { target: { value: 'zeppelin' } })
    expect(screen.getByText('No options match “zeppelin”')).toBeInTheDocument()
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('ticks several in multiple mode and stays open', async () => {
    const onChange = vi.fn()
    render(
      <Combobox
        multiple
        selectedIds={['alpha']}
        value="Alpha"
        ariaLabel="Filter"
        items={ITEMS}
        onChange={onChange}
        searchPlaceholder="Search..."
      />,
    )
    fireEvent.click(screen.getByRole('combobox', { name: 'Filter' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Beta' }))
    expect(onChange).toHaveBeenLastCalledWith(['alpha', 'beta'])
    expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument()
  })
})

/** Controlled `open` (MAR-3393): opt-in, and a no-op for every caller without it. */
describe('Combobox open state', () => {
  it('owns its open state when no `open` is passed', async () => {
    const onOpenChange = vi.fn()
    render(
      <Combobox
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
      <Combobox
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
      <Combobox
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
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })

  it('never opens while disabled, even when asked to', () => {
    render(
      <Combobox
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
