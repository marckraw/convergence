import type { Meta, StoryObj } from '@storybook/react-vite'
import { useRef, type ComponentProps } from 'react'
import { expect, fn, waitFor, within } from 'storybook/test'
import { ConversationActionsView } from './conversation-actions.presentational'
import type { RoutineRowView } from './conversation-actions-menu.pure'

/*
 * The Actions button beside the composer, its fan and each group's compact
 * list. The view is render-only: which level is open, focus and the keys
 * live in the container, so each level is its own story here.
 */

const routineRows: RoutineRowView[] = [
  {
    id: 'drill',
    label: 'Run the drill',
    offered: true,
    reason: null,
    progress: null,
  },
  {
    id: 'compact',
    label: 'Compact',
    offered: true,
    reason: null,
    progress: null,
  },
  { id: 'fork', label: 'Fork', offered: true, reason: null, progress: null },
  {
    id: 'hand-off',
    label: 'Hand off to another account',
    offered: false,
    reason: 'Only one Claude Code account is signed in.',
    progress: null,
  },
]

/**
 * The view with refs of its own, as the container gives it. Refs passed as
 * args would end up holding DOM nodes, which Storybook then walks as args.
 */
function WithRefs(props: ComponentProps<typeof ConversationActionsView>) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const anchorRef = useRef<HTMLDivElement>(null)
  return (
    <ConversationActionsView
      {...props}
      triggerRef={triggerRef}
      menuRef={menuRef}
      searchRef={searchRef}
      anchorRef={anchorRef}
    />
  )
}

// a11y-known: a Routines menu holds its routines' live lines (a beat, a refusal) beside their items, which ARIA's menu does not allow; moving them out of the menu splits each routine from its line (kept on purpose, MAR-3617)
const menuHoldsNonItems = { id: 'aria-required-children', enabled: false }

const meta = {
  title: 'Features/ConversationActions/ConversationActions',
  component: ConversationActionsView,
  args: {
    level: 'closed',
    fanGroups: [
      { id: 'skills', label: 'Skills' },
      { id: 'routines', label: 'Routines' },
      { id: 'project', label: 'Project' },
    ],
    placement: null,
    skills: {
      state: { kind: 'listed' },
      rows: [
        {
          id: 'skill-diagnose',
          label: 'diagnose',
          offered: true,
          reason: null,
        },
        { id: 'skill-tdd', label: 'tdd', offered: true, reason: null },
        {
          id: 'skill-deploy',
          label: 'legacy-deploy',
          offered: false,
          reason: 'Disabled in this project.',
        },
      ],
      notice: null,
      query: '',
    },
    activeSkill: 0,
    routines: {
      loaded: true,
      error: null,
      rows: routineRows,
      cancelRefusal: null,
      compactError: null,
      running: false,
    },
    projectRows: [
      {
        id: 'open-loom',
        label: 'Open in the Loom',
        offered: true,
        reason: null,
      },
      {
        id: 'open-crew',
        label: 'Show this seat in Mission Control',
        offered: true,
        reason: null,
      },
    ],
    // Never filled: WithRefs renders the view with refs of its own.
    triggerRef: { current: null },
    menuRef: { current: null },
    searchRef: { current: null },
    anchorRef: { current: null },
    onToggle: fn(),
    onClose: fn(),
    onBack: fn(),
    onOpenGroup: fn(),
    onMenuKeyDown: fn(),
    onQueryChange: fn(),
    onSkill: fn(),
    onSkillHover: fn(),
    onRoutine: fn(),
    onCancelDrill: fn(),
    onProject: fn(),
  },
  render: (args) => <WithRefs {...args} />,
  parameters: { layout: 'fullscreen' },
  // Room above the button, where the fan and the lists open.
  decorators: [
    (Story) => (
      <div className="flex h-136 flex-col justify-end bg-canvas p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ConversationActionsView>

export default meta

type Story = StoryObj<typeof meta>

/** Closed: one button, announcing the menu it opens. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const trigger = canvas.getByRole('button', { name: 'Actions' })
    await expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(trigger)
    await expect(args.onToggle).toHaveBeenCalledOnce()
  },
}

/** The fan: the three groups and Close. */
export const Fan: Story = {
  args: { level: 'fan' },
  play: async ({ args, canvas, userEvent }) => {
    const menu = canvas.getByRole('menu', { name: 'Actions' })
    await expect(within(menu).getAllByRole('menuitem')).toHaveLength(4)
    await userEvent.click(
      within(menu).getByRole('menuitem', { name: 'Routines' }),
    )
    await expect(args.onOpenGroup).toHaveBeenCalledWith('routines')
    await userEvent.click(
      within(menu).getByRole('menuitem', { name: 'Close menu' }),
    )
    await expect(args.onClose).toHaveBeenCalledOnce()
  },
}

/**
 * Skills: a search and the list it drives (MAR-3616 DS3e). The search names
 * the active row; pick one with a click; a skill not offered says why and
 * does nothing.
 */
export const Skills: Story = {
  args: { level: 'skills' },
  play: async ({ args, canvas, userEvent }) => {
    const menu = canvas.getByRole('dialog', { name: 'Skills' })
    const search = within(menu).getByRole('combobox', { name: 'Find a skill' })
    const list = within(menu).getByRole('listbox', { name: 'Skills' })
    await expect(search).toHaveAttribute('aria-controls', list.id)
    await expect(search).toHaveAttribute(
      'aria-activedescendant',
      within(list).getByRole('option', { name: 'diagnose' }).id,
    )
    await userEvent.type(search, 'd')
    await expect(args.onQueryChange).toHaveBeenCalledWith('d')
    const tdd = within(menu).getByRole('option', { name: 'tdd' })
    await userEvent.hover(tdd)
    await expect(args.onSkillHover).toHaveBeenCalledWith(1)
    await userEvent.click(tdd)
    await expect(args.onSkill).toHaveBeenCalledWith('skill-tdd')
    const deploy = within(menu).getByRole('option', { name: 'legacy-deploy' })
    await expect(deploy).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(deploy)
    await expect(args.onSkill).toHaveBeenCalledOnce()
    await waitFor(() =>
      expect(within(menu).getByText('Disabled in this project.')).toBeVisible(),
    )
    await userEvent.click(
      within(menu).getByRole('button', { name: 'Back from Skills' }),
    )
    await expect(args.onBack).toHaveBeenCalledOnce()
  },
}

/** Skills while the catalog is read. */
export const SkillsBusy: Story = {
  name: 'Skills, busy',
  args: {
    level: 'skills',
    skills: { state: { kind: 'loading' }, rows: [], notice: null, query: '' },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('status')).toHaveTextContent(
      'Loading skills…',
    )
  },
}

/** Skills could not be read: said as a failure, never as "no skills". */
export const SkillsFailed: Story = {
  name: 'Skills, failed',
  args: {
    level: 'skills',
    skills: {
      state: { kind: 'failed', message: 'claude exited with code 1' },
      rows: [],
      notice: 'Skills on grok-mac.',
      query: '',
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('alert')).toHaveTextContent(
      "Couldn't load this agent's skills: claude exited with code 1",
    )
    await waitFor(() =>
      expect(canvas.getByText('Skills on grok-mac.')).toBeVisible(),
    )
  },
}

/** No skills for this agent: the way on to Routines. */
export const SkillsEmpty: Story = {
  name: 'Skills, empty',
  args: {
    level: 'skills',
    skills: { state: { kind: 'empty' }, rows: [], notice: null, query: '' },
  },
  play: async ({ args, canvas, userEvent }) => {
    await waitFor(() =>
      expect(
        canvas.getByText('No skills available for this agent'),
      ).toBeVisible(),
    )
    await userEvent.click(canvas.getByRole('button', { name: 'Routines →' }))
    await expect(args.onOpenGroup).toHaveBeenCalledWith('routines')
  },
}

/** Routines: run one; one not offered says why. */
export const Routines: Story = {
  args: { level: 'routines' },
  play: async ({ args, canvas, userEvent }) => {
    const menu = canvas.getByRole('menu', { name: 'Routines' })
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Fork' }))
    await expect(args.onRoutine).toHaveBeenCalledWith('fork')
    await expect(
      within(menu).getByRole('menuitem', {
        name: 'Hand off to another account',
      }),
    ).toHaveAttribute('aria-disabled', 'true')
    await waitFor(() =>
      expect(
        within(menu).getByText('Only one Claude Code account is signed in.'),
      ).toBeVisible(),
    )
  },
}

/** The drill running: its beat, and Cancel. */
export const RoutinesBusy: Story = {
  parameters: { a11y: { config: { rules: [menuHoldsNonItems] } } },
  name: 'Routines, busy',
  args: {
    level: 'routines',
    routines: {
      loaded: true,
      error: null,
      rows: [
        {
          ...routineRows[0],
          offered: false,
          progress: {
            label: 'Drill · reading the conversation…',
            cancel: { enabled: true, reason: null },
          },
        },
        ...routineRows.slice(1),
      ],
      cancelRefusal: null,
      compactError: null,
      running: true,
    },
  },
  play: async ({ args, canvas, userEvent }) => {
    await waitFor(() =>
      expect(
        canvas.getByText('Drill · reading the conversation…'),
      ).toBeVisible(),
    )
    await userEvent.click(canvas.getByRole('menuitem', { name: 'Cancel' }))
    await expect(args.onCancelDrill).toHaveBeenCalledOnce()
    await userEvent.click(canvas.getByRole('menuitem', { name: 'Close menu' }))
    await expect(args.onClose).toHaveBeenCalledOnce()
  },
}

/** Routines that failed: each failure said beside its routine. */
export const RoutinesFailed: Story = {
  parameters: { a11y: { config: { rules: [menuHoldsNonItems] } } },
  name: 'Routines, failed',
  args: {
    level: 'routines',
    routines: {
      loaded: true,
      error: null,
      rows: [
        {
          ...routineRows[0],
          offered: false,
          progress: {
            label: 'Drill · writing the summary…',
            cancel: {
              enabled: false,
              reason: 'The summary is already being written.',
            },
          },
        },
        ...routineRows.slice(1),
      ],
      cancelRefusal: 'The drill could not be cancelled: it already finished.',
      compactError: 'Compact failed: the provider refused /compact.',
      running: true,
    },
  },
  play: async ({ args, canvas, userEvent }) => {
    const alerts = canvas.getAllByRole('alert')
    await expect(alerts).toHaveLength(2)
    const cancel = canvas.getByRole('menuitem', { name: 'Cancel unavailable' })
    await expect(cancel).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(cancel)
    await expect(args.onCancelDrill).not.toHaveBeenCalled()
  },
}

/** Routines before the conversation has been read. */
export const RoutinesEmpty: Story = {
  parameters: { a11y: { config: { rules: [menuHoldsNonItems] } } },
  name: 'Routines, empty',
  args: {
    level: 'routines',
    routines: {
      loaded: false,
      error: null,
      rows: [],
      cancelRefusal: null,
      compactError: null,
      running: false,
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('status')).toHaveTextContent(
      'Reading this conversation…',
    )
  },
}

/** Project: where this seat lives. */
export const Project: Story = {
  args: { level: 'project' },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole('menuitem', { name: 'Open in the Loom' }),
    )
    await expect(args.onProject).toHaveBeenCalledWith('open-loom')
  },
}

/** A long list in a placed panel scrolls inside it. */
export const Long: Story = {
  args: {
    level: 'skills',
    placement: { right: 0, bottom: 46, width: 286, maxHeight: 320 },
    skills: {
      state: { kind: 'listed' },
      rows: Array.from({ length: 24 }, (_, index) => ({
        id: `skill-${index}`,
        label: `skill-number-${index + 1}-with-a-descriptive-name`,
        offered: true,
        reason: null,
      })),
      notice: null,
      query: '',
    },
  },
}

export const Dark: Story = {
  ...Fan,
  globals: { theme: 'dark' },
}

export const SkillsDark: Story = {
  ...Skills,
  name: 'Skills, dark',
  globals: { theme: 'dark' },
}

export const ReducedMotion: Story = {
  ...Routines,
  globals: { motion: 'reduced' },
}
