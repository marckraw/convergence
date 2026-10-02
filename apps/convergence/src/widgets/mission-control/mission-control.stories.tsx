import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, waitFor } from 'storybook/test'
import { SessionStateChips } from '@/features/mission-control'
import { MissionControlView } from './mission-control.presentational'

const filters = (
  <SessionStateChips
    selected={[]}
    counts={{
      working: 3,
      'needs-you': 2,
      idle: 5,
      finished: 4,
      failed: 1,
      'host-unreachable': 0,
    }}
    onToggle={fn()}
  />
)

/** Stand-in cards: the room's frame is the story, the cards have their own. */
const room = (
  <ul aria-label="Session cards" className="grid grid-cols-3 gap-3">
    {['opus-mac', 'Fable', 'Sol'].map((name) => (
      <li key={name} className="rounded-lg border p-3 text-sm">
        {name}
      </li>
    ))}
  </ul>
)

const meta = {
  title: 'Widgets/MissionControl/MissionControl',
  component: MissionControlView,
  args: {
    totalCount: 15,
    visibleCount: 15,
    attentionCount: 2,
    runningCount: 3,
    query: '',
    onQueryChange: fn(),
    order: 'attention-first',
    onOrderChange: fn(),
    mode: 'flat',
    onModeChange: fn(),
    filters,
    filterIsEmpty: true,
    onClearFilter: fn(),
    children: room,
  },
  decorators: [
    (Story) => (
      <div className="h-140 w-250">
        <Story />
      </div>
    ),
  ],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof MissionControlView>

export default meta

type Story = StoryObj<typeof meta>

/**
 * The room: how many sessions and what they need, Flat or Canvas, card
 * search, the order, the filter row, and the cards.
 */
export const Default: Story = {
  play: async ({ args, canvas, canvasElement, userEvent }) => {
    await expect(
      canvas.getByRole('heading', { name: 'Mission Control' }),
    ).toBeVisible()
    // The top strip drags the window (NAV-4); its controls keep their clicks.
    const region = (element: Element) =>
      getComputedStyle(element).getPropertyValue('-webkit-app-region')
    const header = canvasElement.querySelector<HTMLElement>(
      '[data-mission-control-header]',
    )!
    await expect(region(header)).toBe('drag')
    // One 48 px row and its line, where the sidebar draws its own (NAV F1):
    // the search and the filters are the toolbar under it, not inside.
    await expect(header.getBoundingClientRect().height).toBe(49)
    await expect(
      header.contains(
        canvas.getByRole('searchbox', { name: 'Search session cards' }),
      ),
    ).toBe(false)
    await expect(region(canvas.getByRole('radio', { name: 'Canvas' }))).toBe(
      'no-drag',
    )
    await expect(
      canvas.getByText('15 sessions · 2 need you · 3 running'),
    ).toBeVisible()
    // One of two layouts: a segmented radio group (MC-7), Flat chosen.
    await expect(
      canvas.getByRole('radiogroup', { name: 'Mission Control layout' }),
    ).toBeVisible()
    const flat = canvas.getByRole('radio', { name: 'Flat' })
    await expect(flat).toBeChecked()
    await userEvent.click(canvas.getByRole('radio', { name: 'Canvas' }))
    await expect(args.onModeChange).toHaveBeenCalledWith('canvas')
    await userEvent.type(
      canvas.getByRole('searchbox', { name: 'Search session cards' }),
      'o',
    )
    await expect(args.onQueryChange).toHaveBeenCalledWith('o')
    await expect(
      canvas.getByRole('list', { name: 'Session cards' }),
    ).toBeVisible()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** The order is a select of the room's presets. */
export const Order: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole('combobox', { name: 'Order session cards' }),
    )
    const options = await screen.findAllByRole('option')
    await expect(options.length).toBeGreaterThan(1)
    await userEvent.click(options.at(-1)!)
    await expect(args.onOrderChange).toHaveBeenCalledOnce()
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
  },
}

/** No sessions yet: the room says how a card gets here. */
export const Empty: Story = {
  args: { totalCount: 0, visibleCount: 0, attentionCount: 0, runningCount: 0 },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('No sessions')).toBeVisible()
    await expect(canvas.getByText('No sessions yet')).toBeVisible()
    await expect(
      canvas.queryByRole('list', { name: 'Session cards' }),
    ).toBeNull()
  },
}

/** A search that hides every card: it names the search and offers the room back. */
export const NoMatch: Story = {
  args: { visibleCount: 0, query: 'zebra', filterIsEmpty: false },
  play: async ({ args, canvas, userEvent }) => {
    await expect(canvas.getByText('No cards match “zebra”')).toBeVisible()
    await userEvent.click(
      canvas.getByRole('button', { name: 'Show the whole room' }),
    )
    await expect(args.onClearFilter).toHaveBeenCalledOnce()
  },
}

/** Canvas mode hands the whole content area to the canvas. */
export const Canvas: Story = {
  args: {
    mode: 'canvas',
    fillsContent: true,
    children: (
      <div
        role="img"
        aria-label="Crew canvas"
        className="h-full bg-surface-muted"
      />
    ),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('radio', { name: 'Canvas' })).toBeChecked()
    await expect(canvas.getByRole('img', { name: 'Crew canvas' })).toBeVisible()
  },
}
