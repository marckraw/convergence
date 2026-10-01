import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState, type ComponentProps } from 'react'
import type { ProjectContextItem } from '@/entities/project-context'
import { expect, fn, screen, waitFor } from 'storybook/test'
import { ProjectContextPicker } from './project-context-picker.presentational'

const items: ProjectContextItem[] = [
  {
    id: 'ctx-arch',
    projectId: 'project-convergence',
    label: 'Architecture rules',
    body: 'FSD-lite: app, widgets, features, entities, shared. One-way imports, cross-slice through index.ts only.',
    reinjectMode: 'boot',
    createdAt: '2026-09-01T09:00:00.000Z',
    updatedAt: '2026-09-01T09:00:00.000Z',
  },
  {
    id: 'ctx-gates',
    projectId: 'project-convergence',
    label: 'Gates before a PR',
    body: 'npm run typecheck, test:pure, test:unit, test:stories and chaperone check, one per command, in the foreground.',
    reinjectMode: 'every-turn',
    createdAt: '2026-09-02T09:00:00.000Z',
    updatedAt: '2026-09-02T09:00:00.000Z',
  },
]

/** The picker as the composer holds it: its open state lives outside it. */
function HeldPicker(props: ComponentProps<typeof ProjectContextPicker>) {
  const [open, setOpen] = useState(props.open)
  return (
    <ProjectContextPicker
      {...props}
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        props.onOpenChange(next)
      }}
    />
  )
}

const meta = {
  title: 'Features/Composer/ProjectContextPicker',
  component: ProjectContextPicker,
  args: {
    open: false,
    onOpenChange: fn(),
    items,
    selectedIds: ['ctx-gates'],
    onToggleItem: fn(),
  },
  render: (args) => <HeldPicker {...args} />,
} satisfies Meta<typeof ProjectContextPicker>

export default meta

type Story = StoryObj<typeof meta>

/** The project's notes, one already attached; picking another toggles it. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const trigger = canvas.getByRole('button', {
      name: 'Select project context',
    })
    await expect(trigger).toHaveTextContent('1')
    await userEvent.click(trigger)
    await expect(args.onOpenChange).toHaveBeenCalledWith(true)
    const dialog = await screen.findByRole('dialog')
    await waitFor(() => expect(dialog).toBeVisible())
    await expect(screen.getByText('Every turn')).toBeVisible()
    await userEvent.click(
      screen.getByRole('button', { name: /Architecture rules/ }),
    )
    await expect(args.onToggleItem).toHaveBeenCalledWith('ctx-arch')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), {
      timeout: 3000,
    })
  },
}

/** A project with no notes: nothing to pick, so the trigger is off. */
export const Empty: Story = {
  args: { items: [], selectedIds: [] },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('button', { name: 'Select project context' }),
    ).toBeDisabled()
  },
}

/** Locked once the session has started. */
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('button', { name: 'Select project context' }),
    ).toBeDisabled()
  },
}

/** Open, with a long list. */
export const Long: Story = {
  parameters: {
    a11y: {
      config: {
        rules: [
          // a11y-known: the open popover is a dialog with no accessible name — fixed by the sweep (DS4)
          { id: 'aria-dialog-name', enabled: false },
        ],
      },
    },
  },
  args: {
    open: true,
    items: Array.from({ length: 12 }, (_, index) => ({
      ...items[index % 2],
      id: `ctx-${index}`,
      label: `Note ${index + 1}: ${items[index % 2].label}`,
    })),
    selectedIds: ['ctx-1', 'ctx-4'],
  },
  play: async () => {
    const dialog = await screen.findByRole('dialog')
    await waitFor(() => expect(dialog).toBeVisible())
    await expect(
      screen.getAllByRole('button', { name: /^Note \d+/ }),
    ).toHaveLength(12)
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

export const ReducedMotion: Story = {
  ...Default,
  globals: { motion: 'reduced' },
}
