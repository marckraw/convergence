import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState, type ComponentProps } from 'react'
import { expect, fn, screen, waitFor } from 'storybook/test'
import { SearchableSelect } from './searchable-select.container'
import type { SearchableSelectItem } from './searchable-select.presentational'

const PROJECTS: SearchableSelectItem[] = [
  {
    id: 'convergence',
    label: 'convergence',
    description: '~/Projects/Private',
  },
  {
    id: 'convergence-studio',
    label: 'studio',
    description: 'lane of convergence',
    depth: 1,
  },
  { id: 'emergence', label: 'emergence', description: '~/Projects/Private' },
  { id: 'codewalk', label: 'codewalk', description: '~/Projects/OpenSource' },
  {
    id: 'archived',
    label: 'divergence',
    description: 'Archived: open it in Finder to bring it back',
    disabled: true,
  },
]

/** SearchableSelect is controlled; this keeps the choice as a form would. */
function ControlledSearchableSelect(
  props: ComponentProps<typeof SearchableSelect>,
) {
  const [selectedId, setSelectedId] = useState(props.selectedId)
  const selected = props.items.find((item) => item.id === selectedId)
  return (
    <SearchableSelect
      {...props}
      selectedId={selectedId}
      value={selected?.label ?? props.value}
      onChange={(id) => {
        setSelectedId(id)
        props.onChange(id)
      }}
    />
  )
}

const meta = {
  title: 'Primitives/SearchableSelect',
  component: SearchableSelect,
  args: {
    selectedId: 'convergence',
    value: 'convergence',
    items: PROJECTS,
    onChange: fn(),
    ariaLabel: 'Project',
    searchPlaceholder: 'Search projects...',
    emptyMessage: 'No projects found.',
  },
  render: (args) => <ControlledSearchableSelect {...args} />,
} satisfies Meta<typeof SearchableSelect>

export default meta

type Story = StoryObj<typeof meta>

/** Opens, filters as you type, and chooses with a click. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const trigger = canvas.getByRole('combobox', { name: 'Project' })
    await expect(trigger).toHaveTextContent('convergence')
    await userEvent.click(trigger)
    const search = await screen.findByRole('combobox', {
      name: 'Search projects...',
    })
    await waitFor(() => expect(search).toHaveFocus())
    await userEvent.keyboard('emer')
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(1))
    await userEvent.click(screen.getByRole('option', { name: /emergence/ }))
    await expect(args.onChange).toHaveBeenCalledWith('emergence')
    await waitFor(() =>
      expect(
        screen.queryByRole('combobox', { name: 'Search projects...' }),
      ).toBeNull(),
    )
    await expect(trigger).toHaveTextContent('emergence')
  },
}

/** Empty: a search that matches nothing says so. */
export const Empty: Story = {
  parameters: {
    a11y: {
      config: {
        rules: [
          // a11y-known: with no match, cmdk's list (role="listbox") holds only
          // the "nothing found" message, so it is a listbox without options.
          // Moving the message out of the list moves it on screen, so it is
          // not an invisible fix; see DS1. Narrowed to that one list: the rule
          // still checks every other element in this story.
          {
            id: 'aria-required-children',
            selector: '[role]:not([cmdk-list])',
          },
        ],
      },
    },
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('combobox', { name: 'Project' }))
    await screen.findByRole('combobox', { name: 'Search projects...' })
    await userEvent.keyboard('nothing like this')
    await expect(await screen.findByText('No projects found.')).toBeVisible()
    await expect(screen.queryAllByRole('option')).toHaveLength(0)
  },
}

/** Disabled: with nothing to choose and no action, it cannot open. */
export const Disabled: Story = {
  args: { items: [], selectedId: null, value: 'No projects yet' },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('combobox', { name: 'Project' }),
    ).toBeDisabled()
  },
}

/** Long: many items scroll inside the list, which stays on screen. */
export const Long: Story = {
  args: {
    items: Array.from({ length: 40 }, (_, index) => ({
      id: `project-${index}`,
      label: `project-with-a-rather-long-name-${index + 1}`,
      description: '~/Projects/Clients/Somewhere/Deep/In/The/Tree',
    })),
    selectedId: 'project-0',
    value: 'project-with-a-rather-long-name-1',
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('combobox', { name: 'Project' }))
    const listbox = await screen.findByRole('listbox')
    const box = listbox.getBoundingClientRect()
    await expect(box.bottom).toBeLessThanOrEqual(window.innerHeight)
    await expect(listbox.scrollHeight).toBeGreaterThan(listbox.clientHeight)
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
