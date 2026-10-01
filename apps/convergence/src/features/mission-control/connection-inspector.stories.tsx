import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen } from 'storybook/test'
import {
  EMPTY_SPAWN_SPEC,
  beforeDeliveryOptions,
  newConnectionDraft,
  type ConnectionDraft,
} from './connection-draft.pure'
import {
  ConnectionInspector,
  GLOBAL_PROJECT_OPTION_ID,
} from './connection-inspector.presentational'

/** A saved wire from Fable to Opus, on, waiting for any finish. */
const saved: ConnectionDraft = {
  ...newConnectionDraft({ sourceSessionId: 'fable', targetSessionId: 'opus' }),
  enabled: true,
  instructions:
    'Implement the brief. Return your result and verification evidence.',
}

const handlers = {
  onWorkAddressChange: fn(),
  onBranchChange: fn(),
  onRecipientChange: fn(),
  onSpawnChange: fn(),
  onEnabledChange: fn(),
  onConditionKindChange: fn(),
  onConditionTokenChange: fn(),
  onBeforeDeliveryChange: fn(),
  onCustomOpenerChange: fn(),
  onInstructionsChange: fn(),
  onSave: fn(),
  onCancel: fn(),
  onDelete: fn(),
  onClose: fn(),
}

const meta = {
  title: 'Features/MissionControl/ConnectionInspector',
  component: ConnectionInspector,
  args: {
    sourceName: 'Fable',
    recipientName: 'Opus',
    draft: saved,
    isNew: false,
    dirty: false,
    saveError: null,
    recipientMissing: false,
    recipientOptions: [
      { id: 'opus', label: 'Opus' },
      { id: 'sol', label: 'Sol' },
    ],
    beforeDelivery: beforeDeliveryOptions({
      supportsReset: true,
      providerName: 'Claude Code',
      recipientName: 'Opus',
    }),
    customOpenerNote: null,
    recipientNote: null,
    problem: null,
    busy: false,
    projectOptions: [
      { id: GLOBAL_PROJECT_OPTION_ID, label: 'No project' },
      { id: 'project-convergence', label: 'convergence' },
    ],
    providerOptions: [
      { id: 'claude-code', label: 'Claude Code' },
      { id: 'codex', label: 'Codex' },
    ],
    modelOptions: [],
    effortOptions: [],
    hostOptions: [
      { id: 'local', label: 'This Mac' },
      { id: 'little-monster', label: 'little-monster' },
    ],
    workAddressSlot: { mode: 'hidden' },
    spawnAccounts: [],
    ...handlers,
  },
  decorators: [
    (Story) => (
      <div className="flex h-225 w-80 flex-col">
        <Story />
      </div>
    ),
  ],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof ConnectionInspector>

export default meta

type Story = StoryObj<typeof meta>

/**
 * A saved connection, opened: who carries the reply to whom, the switch, when
 * it fires, what happens before delivery and the standing brief. Nothing on
 * the panel sends a message.
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const panel = canvas.getByRole('region', { name: 'Connection' })
    await expect(panel).toHaveTextContent('Saved · on')
    const enabled = canvas.getByRole('switch', { name: 'On' })
    await expect(enabled).toBeChecked()
    await userEvent.click(enabled)
    await expect(args.onEnabledChange).toHaveBeenCalledWith(false)
    await expect(
      canvas.getByRole('button', { name: 'Any finish' }),
    ).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(
      canvas.getByRole('button', { name: 'Only when a final line matches' }),
    )
    await expect(args.onConditionKindChange).toHaveBeenCalledWith('token')
    await userEvent.click(
      canvas.getByRole('button', { name: 'Clear Opus conversation' }),
    )
    await expect(args.onBeforeDeliveryChange).toHaveBeenCalledWith('clear')
    await userEvent.type(
      canvas.getByRole('textbox', { name: 'Standing instructions' }),
      '!',
    )
    await expect(args.onInstructionsChange).toHaveBeenCalled()
    // Nothing changed, so there is nothing to save.
    await expect(
      canvas.getByRole('button', { name: 'Save changes' }),
    ).toBeDisabled()
    await userEvent.click(
      canvas.getByRole('button', { name: 'Delete connection' }),
    )
    await expect(args.onDelete).toHaveBeenCalledOnce()
    await userEvent.click(
      canvas.getByRole('button', { name: 'Close the connection panel' }),
    )
    await expect(args.onClose).toHaveBeenCalledOnce()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** The recipient picker lists the crew and the spawn path. */
export const Recipient: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getAllByRole('combobox')[0]!)
    await userEvent.click(
      await screen.findByRole('option', { name: /Start a new session…/ }),
    )
    await expect(args.onRecipientChange).toHaveBeenCalledWith('__spawn__')
  },
}

/** A new draft that waits for a baton line: unsaved, and it can be saved. */
export const Empty: Story = {
  args: {
    isNew: true,
    draft: newConnectionDraft({
      sourceSessionId: 'fable',
      targetSessionId: 'opus',
      suggestedBatonName: 'horse',
    }),
  },
  play: async ({ args, canvas, userEvent }) => {
    await expect(canvas.getByText('Not saved yet')).toBeVisible()
    const token = canvas.getByRole('textbox', {
      name: 'The final line this connection waits for',
    })
    await expect(token).toHaveValue('BATON: horse')
    await userEvent.type(token, 's')
    await expect(args.onConditionTokenChange).toHaveBeenCalledWith(
      'BATON: horses',
    )
    await expect(
      canvas.queryByRole('button', { name: 'Delete connection' }),
    ).toBeNull()
    await userEvent.click(canvas.getByRole('button', { name: 'Save changes' }))
    await expect(args.onSave).toHaveBeenCalledOnce()
  },
}

/** A save failed: the draft is kept, the stored wire untouched, and it says so. */
export const Failed: Story = {
  args: {
    dirty: true,
    saveError: 'The relay table is locked by another write.',
  },
  play: async ({ args, canvas, userEvent }) => {
    await expect(canvas.getByRole('alert')).toHaveTextContent(
      'Your draft is kept here. The saved connection has not changed.',
    )
    await userEvent.click(canvas.getByRole('button', { name: 'Try again' }))
    await expect(args.onSave).toHaveBeenCalledOnce()
    await userEvent.click(
      canvas.getByRole('button', { name: 'Discard changes' }),
    )
    await expect(args.onCancel).toHaveBeenCalledOnce()
  },
}

export const FailedDark: Story = {
  ...Failed,
  globals: { theme: 'dark' },
}

/**
 * The spawn path: the session this connection opens, where it runs, its role
 * card, whether it reports back, its provider and project, and its name.
 */
export const Long: Story = {
  args: {
    recipientName: null,
    draft: {
      ...saved,
      recipient: { kind: 'spawn', spec: EMPTY_SPAWN_SPEC },
    },
  },
  play: async ({ args, canvas, userEvent }) => {
    await expect(
      canvas.getByText('The session this connection opens'),
    ).toBeVisible()
    await userEvent.type(
      canvas.getByRole('textbox', { name: 'Role card' }),
      'R',
    )
    await expect(args.onSpawnChange).toHaveBeenCalledWith({ roleCard: 'R' })
    const reportBack = canvas.getByRole('switch', {
      name: 'Report back to Fable when it finishes',
    })
    await expect(reportBack).toBeChecked()
    await userEvent.type(
      canvas.getByRole('textbox', { name: 'Name for the new session' }),
      'x',
    )
    await expect(args.onSpawnChange).toHaveBeenCalledWith({ name: 'x' })
    // A spawned session has never been used: nothing to clear before delivery.
    await expect(
      canvas.queryByRole('group', {
        name: 'What happens before the reply is delivered',
      }),
    ).toBeNull()
  },
}

/** The recipient is gone: the connection stays editable and says so. */
export const RecipientMissing: Story = {
  args: { recipientMissing: true, recipientName: null },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Recipient unavailable')).toBeVisible()
  },
}

/**
 * A provider that cannot reset: Clear is offered, disabled with its reason,
 * and every control waits while a save is in flight.
 */
export const Disabled: Story = {
  args: {
    busy: true,
    beforeDelivery: beforeDeliveryOptions({
      supportsReset: false,
      providerName: 'Codex',
      recipientName: 'Opus',
    }),
  },
  play: async ({ canvas }) => {
    // Clear is unavailable with a reason (R2, MAR-3616): focusable, and it
    // says why.
    const clear = canvas.getByRole('button', {
      name: 'Clear Opus conversation',
    })
    await expect(clear).toHaveAttribute('aria-disabled', 'true')
    await expect(clear).toHaveAccessibleDescription(
      expect.stringContaining('Codex'),
    )
    await expect(canvas.getByRole('switch', { name: 'On' })).toBeDisabled()
    await expect(
      canvas.getByRole('textbox', { name: 'Standing instructions' }),
    ).toBeDisabled()
    await expect(canvas.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  },
}
