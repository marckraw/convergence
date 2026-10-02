import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { TrackerBindingForm } from './tracker-binding-form.presentational'

const meta = {
  title: 'Features/MissionControl/TrackerBindingForm',
  component: TrackerBindingForm,
  args: {
    autoDispatch: false,
    dispatchCandidates: ['MAR-3201'],
    onAutoDispatchChange: fn(),
    draft: {
      projectId: '3f1d6a0e-convergence',
      labelPrefix: 'horse:',
      wavePrefix: 'wave:',
    },
    bound: true,
    credential: 'present',
    keyDraft: '',
    lastProbe: {
      probe: { ok: true, issues: 14, projectName: 'convergence' },
      at: '2026-09-17T12:00:00.000Z',
    },
    boundProjectName: 'convergence',
    busy: false,
    error: null,
    onDraftChange: fn(),
    onSaveBinding: fn(),
    onUnbind: fn(),
    onKeyDraftChange: fn(),
    onSaveKey: fn(),
    onForgetKey: fn(),
    onTest: fn(),
  },
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TrackerBindingForm>

export default meta

type Story = StoryObj<typeof meta>

/**
 * A crew bound to its project with a key stored: what the last Test found,
 * auto-dispatch with what would start, and the key's facts, never the key.
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const tracker = canvas.getByRole('region', { name: 'Tracker' })
    await expect(tracker).toHaveTextContent('Bound to “convergence”')
    await expect(tracker).toHaveTextContent('Stored in Keychain')
    await expect(tracker).toHaveTextContent('14 labeled issues in convergence')
    await expect(tracker).toHaveTextContent(
      '1 issue(s) would start now: MAR-3201',
    )
    const dispatch = canvas.getByRole('switch', { name: /Auto-dispatch/ })
    await expect(dispatch).not.toBeChecked()
    await userEvent.click(dispatch)
    await expect(args.onAutoDispatchChange).toHaveBeenCalledWith(true)
    await userEvent.type(
      canvas.getByRole('textbox', { name: 'Wave prefix' }),
      'x',
    )
    await expect(args.onDraftChange).toHaveBeenCalledWith({
      wavePrefix: 'wave:x',
    })
    await userEvent.click(canvas.getByRole('button', { name: 'Save binding' }))
    await expect(args.onSaveBinding).toHaveBeenCalledOnce()
    await userEvent.click(canvas.getByRole('button', { name: 'Test' }))
    await expect(args.onTest).toHaveBeenCalledOnce()
    await userEvent.click(canvas.getByRole('button', { name: 'Forget key' }))
    await expect(args.onForgetKey).toHaveBeenCalledOnce()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/**
 * Not bound yet and no key: Bind waits for a project, Store key for a key,
 * and nothing can be tested.
 */
export const Empty: Story = {
  args: {
    draft: { projectId: '', labelPrefix: 'horse:', wavePrefix: 'wave:' },
    bound: false,
    credential: 'absent',
    lastProbe: null,
    boundProjectName: null,
    dispatchCandidates: [],
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('button', { name: 'Bind to project' }),
    ).toBeDisabled()
    await expect(canvas.getByLabelText('Linear API key')).toHaveAttribute(
      'type',
      'password',
    )
    await expect(
      canvas.getByRole('button', { name: 'Store key' }),
    ).toBeDisabled()
    await expect(canvas.getByRole('button', { name: 'Test' })).toBeDisabled()
    await expect(
      canvas.getByRole('switch', { name: /Auto-dispatch/ }),
    ).toBeDisabled()
    await expect(canvas.getByText('Not tested yet')).toBeVisible()
    await expect(canvas.getByText('Nothing would start now')).toBeVisible()
  },
}

/** Linear refused the stored key: the form asks for it again, and says why. */
export const Failed: Story = {
  args: {
    lastProbe: {
      probe: {
        ok: false,
        refusal: {
          kind: 'unauthorized',
          message: 'The key was revoked.',
          retryAt: null,
        },
      },
      at: '2026-09-17T12:00:00.000Z',
    },
    error: 'The last read was refused.',
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByLabelText('Enter the Linear API key again'),
    ).toBeVisible()
    await expect(
      canvas.getByText('Linear refused the API key — The key was revoked.'),
    ).toBeVisible()
    await expect(canvas.getByRole('alert')).toHaveTextContent(
      'The last read was refused.',
    )
  },
}

export const FailedDark: Story = {
  ...Failed,
  globals: { theme: 'dark' },
}

/** Saving: every control waits, and the stored key's status stays readable. */
export const Busy: Story = {
  args: { busy: true, credential: null },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Checking…')).toBeVisible()
    await expect(
      canvas.getByRole('button', { name: 'Save binding' }),
    ).toBeDisabled()
    await expect(canvas.getByRole('button', { name: 'Unbind' })).toBeDisabled()
    await expect(
      canvas.getByRole('textbox', { name: 'Project (URL, name or id)' }),
    ).toBeDisabled()
  },
}
