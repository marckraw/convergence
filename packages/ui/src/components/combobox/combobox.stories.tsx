import type { Meta, StoryObj } from '@storybook/react-vite'
import { FolderGit2, Plus } from 'lucide-react'
import { useState } from 'react'
import { expect, fn, screen, waitFor, within } from 'storybook/test'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../dialog/dialog'
import {
  Combobox,
  type ComboboxItem,
  type ComboboxSingleProps,
} from './combobox'

const PROJECTS: ComboboxItem[] = [
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
    description:
      'Archived: open it in Finder to bring it back, then add it again from the sidebar.',
    disabled: true,
  },
]

type PickerProps = Omit<ComboboxSingleProps, 'value'>

/** A Combobox as a form holds one: the chosen id, and the trigger names it. */
function ProjectPicker(props: PickerProps) {
  const [selectedId, setSelectedId] = useState(props.selectedId)
  const selected = props.items.find((item) => item.id === selectedId)
  return (
    <div className="w-64">
      <Combobox
        {...props}
        selectedId={selectedId}
        value={selected?.label ?? 'Choose a project'}
        className="w-full"
        onChange={(id) => {
          setSelectedId(id)
          props.onChange(id)
        }}
      />
    </div>
  )
}

const meta = {
  title: 'Components/Combobox',
  component: ProjectPicker,
  args: {
    selectedId: 'convergence',
    items: PROJECTS,
    onChange: fn(),
    ariaLabel: 'Project',
    searchPlaceholder: 'Search projects…',
    emptyMessage: (query: string) => `No projects match “${query}”`,
  },
} satisfies Meta<typeof ProjectPicker>

export default meta

type Story = StoryObj<typeof meta>

/** The popup once it has opened. */
const openedList = async () => {
  const dialog = await screen.findByRole('dialog', { name: 'Project' })
  await waitFor(() => expect(dialog).toBeVisible())
  return dialog
}

/**
 * The keyboard: the trigger opens the list and the focus goes to the search;
 * typing filters and highlights the first match, the arrows move the
 * highlight (the field names it: aria-activedescendant), Enter picks, and the
 * focus comes back to the trigger, which now names the choice. Escape closes
 * without picking.
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const trigger = canvas.getByRole('combobox', { name: 'Project' })
    await expect(trigger).toHaveTextContent('convergence')
    await expect(trigger).toHaveAttribute('data-size', 'md')
    await userEvent.click(trigger)
    const dialog = await openedList()
    const search = within(dialog).getByRole('combobox', {
      name: 'Search projects…',
    })
    await waitFor(() => expect(search).toHaveFocus())
    await expect(within(dialog).getByRole('listbox')).toHaveAccessibleName(
      'Project',
    )

    await userEvent.keyboard('private')
    await waitFor(() =>
      expect(within(dialog).getAllByRole('option')).toHaveLength(2),
    )
    const options = within(dialog).getAllByRole('option')
    await expect(options.map((option) => option.textContent)).toEqual([
      'convergence~/Projects/Private',
      'emergence~/Projects/Private',
    ])
    // The first match is highlighted, and the field announces it.
    await waitFor(() =>
      expect(search).toHaveAttribute('aria-activedescendant', options[0].id),
    )
    await userEvent.keyboard('{ArrowDown}')
    await waitFor(() =>
      expect(search).toHaveAttribute('aria-activedescendant', options[1].id),
    )
    await expect(options[1]).toHaveAttribute('data-highlighted')
    await userEvent.keyboard('{Enter}')
    await expect(args.onChange).toHaveBeenCalledWith('emergence')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(trigger).toHaveFocus())
    await expect(trigger).toHaveTextContent('emergence')

    await userEvent.keyboard('{Enter}')
    const again = await openedList()
    await waitFor(() =>
      expect(
        within(again).getByRole('combobox', { name: 'Search projects…' }),
      ).toHaveFocus(),
    )
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await expect(trigger).toHaveFocus()
    await expect(args.onChange).toHaveBeenCalledTimes(1)
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** The pointer: a click on a row picks it; the chosen row is ticked and selected. */
export const Pointer: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('combobox', { name: 'Project' }))
    const dialog = await openedList()
    await expect(
      within(dialog).getByRole('option', { name: /^convergence/ }),
    ).toHaveAttribute('aria-selected', 'true')
    await userEvent.click(
      within(dialog).getByRole('option', { name: /codewalk/ }),
    )
    await expect(args.onChange).toHaveBeenCalledWith('codewalk')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  },
}

/** Empty: a search that matches nothing says so, and no empty list is left behind. */
export const Empty: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('combobox', { name: 'Project' }))
    const dialog = await openedList()
    const search = within(dialog).getByRole('combobox', {
      name: 'Search projects…',
    })
    await waitFor(() => expect(search).toHaveFocus())
    await userEvent.keyboard('zeppelin')
    await expect(
      await within(dialog).findByText('No projects match “zeppelin”'),
    ).toBeVisible()
    // No empty listbox: the field controls the words, and nothing is active.
    await expect(within(dialog).queryByRole('listbox')).toBeNull()
    await expect(search).not.toHaveAttribute('aria-activedescendant')
  },
}

/**
 * Disabled: an item listed but not choosable says why in full, wrapping, and
 * a click does nothing. A combobox with nothing to choose and no action
 * cannot open.
 */
export const Disabled: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('combobox', { name: 'Project' }))
    const dialog = await openedList()
    const archived = within(dialog).getByRole('option', { name: /divergence/ })
    await expect(archived).toHaveAttribute('aria-disabled', 'true')
    const reason = within(archived).getByText(/^Archived:/)
    await expect(getComputedStyle(reason).whiteSpace).toBe('normal')
    // Two lines at least: taller than one and a half.
    await expect(reason.getBoundingClientRect().height).toBeGreaterThan(
      1.5 * Number.parseFloat(getComputedStyle(reason).lineHeight),
    )
    const choosable = within(
      within(dialog).getByRole('option', { name: /emergence/ }),
    ).getByText('~/Projects/Private')
    await expect(getComputedStyle(choosable).whiteSpace).toBe('nowrap')
    await userEvent.click(archived)
    await expect(args.onChange).not.toHaveBeenCalled()
    await userEvent.keyboard('{Escape}')
  },
}

/** Nothing to choose and nothing to do: the trigger is disabled. */
export const NothingToChoose: Story = {
  name: 'Disabled, nothing to choose',
  args: { items: [], selectedId: null },
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
      label: `project-with-a-rather-long-name-that-runs-on-${index + 1}`,
      description: '~/Projects/Clients/Somewhere/Deep/In/The/Tree',
    })),
    selectedId: 'project-0',
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('combobox', { name: 'Project' }))
    const dialog = await openedList()
    const listbox = within(dialog).getByRole('listbox')
    await expect(dialog.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      window.innerHeight,
    )
    await expect(listbox.scrollHeight).toBeGreaterThan(listbox.clientHeight)
    const [first] = within(dialog).getAllByRole('option')
    const name = within(first).getByText(/^project-with/)
    await expect(name.scrollWidth).toBeGreaterThan(name.clientWidth)
  },
}

/** An action under the list stays there whatever the search, and closes the list. */
export const WithAction: Story = {
  args: {
    icon: <FolderGit2 aria-hidden className="size-3.5 shrink-0" />,
    action: {
      label: 'Open a project',
      icon: <Plus aria-hidden className="size-3.5 shrink-0" />,
      onSelect: fn(),
    },
  },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('combobox', { name: 'Project' }))
    const dialog = await openedList()
    await userEvent.keyboard('zeppelin')
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Open a project' }),
    )
    await expect(args.action?.onSelect).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  },
}

/** Grouped: rows sit under their headings, and the search keeps the headings of what matches. */
export const Grouped: Story = {
  args: {
    items: [
      { id: 'opus', label: 'Claude Opus', group: 'Anthropic' },
      { id: 'sonnet', label: 'Claude Sonnet', group: 'Anthropic' },
      {
        id: 'gemini',
        label: 'Gemini 3.5 Flash',
        group: 'Google',
        badge: { label: 'Alpha', title: 'Early provider support' },
      },
      { id: 'gpt', label: 'GPT-5.4', group: 'OpenAI' },
    ],
    selectedId: 'opus',
    ariaLabel: 'Model',
    searchPlaceholder: 'Search models…',
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('combobox', { name: 'Model' }))
    const dialog = await screen.findByRole('dialog', { name: 'Model' })
    await waitFor(() =>
      expect(
        within(dialog).getByRole('combobox', { name: 'Search models…' }),
      ).toHaveFocus(),
    )
    const groups = within(dialog).getAllByRole('group')
    await expect(groups).toHaveLength(3)
    await expect(groups[0]).toHaveAccessibleName('Anthropic')
    await userEvent.keyboard('alpha')
    await waitFor(() =>
      expect(within(dialog).getAllByRole('group')).toHaveLength(1),
    )
    const [only] = within(dialog).getAllByRole('group')
    await expect(only).toHaveAccessibleName('Google')
    await expect(within(only).getByRole('option')).toHaveTextContent(
      /Gemini 3\.5 Flash/,
    )
  },
}

/** Loading: a spinner and its words stand in for the list, after a beat. */
export const Busy: Story = {
  args: { loadingMessage: 'Loading branches…' },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('combobox', { name: 'Project' }))
    const dialog = await openedList()
    const words = await within(dialog).findByText('Loading branches…')
    await waitFor(() => expect(words).toBeVisible())
    await expect(within(dialog).queryByRole('listbox')).toBeNull()
  },
}

/** Failed: an alert says what went wrong, with Try again. */
export const Failed: Story = {
  args: { error: "Couldn't read the branches", onRetry: fn() },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('combobox', { name: 'Project' }))
    const dialog = await openedList()
    await expect(within(dialog).getByRole('alert')).toHaveTextContent(
      "Couldn't read the branches",
    )
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Try again' }),
    )
    await expect(args.onRetry).toHaveBeenCalledTimes(1)
  },
}

const pickedProjects = fn()

/** A filter that takes several: nothing ticked means all. */
function ProjectFilter() {
  const [ids, setIds] = useState<string[]>(['emergence'])
  const summary =
    ids.length === 0
      ? 'All projects'
      : ids.length === 1
        ? (PROJECTS.find((item) => item.id === ids[0])?.label ?? '1 project')
        : `${ids.length} projects`
  return (
    <Combobox
      multiple
      selectedIds={ids}
      value={summary}
      ariaLabel="Filter by project"
      items={PROJECTS.map((item) => ({ ...item, trailing: 3 }))}
      variant="ghost"
      size="sm"
      searchPlaceholder="Search projects…"
      onChange={(next) => {
        setIds(next)
        pickedProjects(next)
      }}
    />
  )
}

/**
 * Multiple: Enter or a click ticks or unticks a row (aria-selected) and the
 * list stays open, so several can be picked in one pass.
 */
export const Multiple: Story = {
  render: () => <ProjectFilter />,
  play: async ({ canvas, userEvent }) => {
    const trigger = canvas.getByRole('combobox', { name: 'Filter by project' })
    await userEvent.click(trigger)
    const dialog = await screen.findByRole('dialog', {
      name: 'Filter by project',
    })
    await waitFor(() => expect(dialog).toBeVisible())
    await expect(within(dialog).getByRole('listbox')).toHaveAttribute(
      'aria-multiselectable',
      'true',
    )
    await userEvent.click(
      within(dialog).getByRole('option', { name: /codewalk/ }),
    )
    await expect(pickedProjects).toHaveBeenLastCalledWith([
      'emergence',
      'codewalk',
    ])
    await expect(dialog).toBeVisible()
    await waitFor(() =>
      expect(
        within(dialog).getByRole('combobox', { name: 'Search projects…' }),
      ).toHaveFocus(),
    )
    await userEvent.keyboard('emer{Enter}')
    await expect(pickedProjects).toHaveBeenLastCalledWith(['codewalk'])
    await expect(trigger).toHaveTextContent('codewalk')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await expect(trigger).toHaveFocus()
  },
}

/**
 * Short: a list short enough to scan has no search. The focus goes into the
 * list, the arrows move the highlight and Enter picks.
 */
export const Short: Story = {
  args: { searchable: false, items: PROJECTS.slice(0, 4) },
  play: async ({ args, canvas, userEvent }) => {
    const trigger = canvas.getByRole('combobox', { name: 'Project' })
    await userEvent.click(trigger)
    const dialog = await openedList()
    await expect(within(dialog).queryByRole('combobox')).toBeNull()
    await userEvent.keyboard('{ArrowDown}{ArrowDown}')
    await waitFor(() =>
      expect(
        within(dialog)
          .getAllByRole('option')
          .some((option) => option.hasAttribute('data-highlighted')),
      ).toBe(true),
    )
    await userEvent.keyboard('{Enter}')
    await expect(args.onChange).toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await expect(trigger).toHaveFocus()
  },
}

/** R3: the trigger is 24, 28, 32 or 36 px, by `size`. */
export const Sizes: Story = {
  render: (args) => (
    <div className="flex flex-col items-start gap-2">
      {(['xs', 'sm', 'md', 'lg'] as const).map((size) => (
        <Combobox
          key={size}
          {...args}
          size={size}
          ariaLabel={`Project, ${size}`}
          value="convergence"
        />
      ))}
    </div>
  ),
  play: async ({ canvas }) => {
    const heights = (['xs', 'sm', 'md', 'lg'] as const).map(
      (size) =>
        canvas
          .getByRole('combobox', { name: `Project, ${size}` })
          .getBoundingClientRect().height,
    )
    await expect(heights).toEqual([24, 28, 32, 36])
  },
}

const dialogChanged = fn()

/**
 * In a dialog: the list keeps the focus and takes the clicks, and Escape
 * closes the list, not the dialog under it.
 */
export const InDialog: Story = {
  render: (args) => (
    <Dialog open onOpenChange={dialogChanged}>
      <DialogContent className="w-96">
        <DialogHeader className="px-6 pt-5">
          <DialogTitle>New workspace</DialogTitle>
          <DialogDescription>Pick the project it belongs to.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <ProjectPicker {...args} />
        </DialogBody>
      </DialogContent>
    </Dialog>
  ),
  play: async ({ args, userEvent }) => {
    const dialog = await screen.findByRole('dialog', { name: 'New workspace' })
    const trigger = within(dialog).getByRole('combobox', { name: 'Project' })
    await userEvent.click(trigger)
    const list = await openedList()
    const search = within(list).getByRole('combobox', {
      name: 'Search projects…',
    })
    await waitFor(() => expect(search).toHaveFocus())
    await userEvent.keyboard('code{Enter}')
    await expect(args.onChange).toHaveBeenCalledWith('codewalk')
    await waitFor(() => expect(trigger).toHaveFocus())

    await userEvent.click(trigger)
    await userEvent.click(
      within(await openedList()).getByRole('option', { name: /emergence/ }),
    )
    await expect(args.onChange).toHaveBeenLastCalledWith('emergence')
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Project' })).toBeNull(),
    )

    await userEvent.click(trigger)
    const again = await openedList()
    await waitFor(() =>
      expect(
        within(again).getByRole('combobox', { name: 'Search projects…' }),
      ).toHaveFocus(),
    )
    await userEvent.keyboard('{Escape}')
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Project' })).toBeNull(),
    )
    await expect(dialogChanged).not.toHaveBeenCalled()
    await expect(trigger).toHaveFocus()
  },
}

export const ReducedMotion: Story = {
  ...Pointer,
  globals: { motion: 'reduced' },
}
