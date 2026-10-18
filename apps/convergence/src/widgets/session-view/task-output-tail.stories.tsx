import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { TaskOutputTail } from './task-output-tail.presentational'

const meta = {
  title: 'Widgets/SessionView/TaskOutputTail',
  component: TaskOutputTail,
  args: { view: { kind: 'idle' }, onRead: fn() },
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="w-96 max-w-full">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TaskOutputTail>

export default meta

type Story = StoryObj<typeof meta>

const OUTPUT = {
  kind: 'output',
  status: 'running',
  truncated: true,
  totalBytes: 183_204,
  readAt: '2026-10-18T10:00:00.000Z',
  text: [
    '> convergence@0.98.7 test:unit',
    '> vitest run --maxWorkers=2',
    '',
    ' ✓ src/shared/lib/parallel-work.pure.test.ts (41 tests) 12ms',
    ' ✓ src/widgets/session-view/parallel-work.container.test.tsx (58 tests) 2140ms',
    ' ❯ electron/backend/session/session.service.test.ts (212 tests | 1 failed)',
    '',
  ].join('\n'),
} as const

/** Nothing is fetched until the person asks: the output lives on another machine. */
export const Idle: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole('button', { name: 'Read output tail' }),
    )
    await expect(args.onRead).toHaveBeenCalledTimes(1)
  },
}

export const Loading: Story = { args: { view: { kind: 'loading' } } }

/** The host's redacted lines, what they cover, and a way to read again. */
export const Output: Story = {
  args: { view: { kind: 'output', reading: OUTPUT } },
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText('Task output tail')).toBeVisible()
    await expect(
      canvas.getByRole('button', { name: 'Read again' }),
    ).toBeEnabled()
  },
}

export const WholeOutput: Story = {
  args: {
    view: {
      kind: 'output',
      reading: { ...OUTPUT, truncated: false, status: 'completed' },
    },
  },
}

export const NoCompleteLine: Story = {
  args: { view: { kind: 'output', reading: { ...OUTPUT, text: '' } } },
}

/** A host's coded refusal, in Convergence's words. */
export const Refused: Story = {
  args: { view: { kind: 'refused', code: 'read-refused' } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('status')).toHaveTextContent(
      'The host’s policy does not allow reading this task’s output.',
    )
  },
}

export const NoOutput: Story = {
  args: { view: { kind: 'refused', code: 'no-output' } },
}

export const Failed: Story = {
  args: {
    view: { kind: 'failed', message: 'Remote execution host is unreachable' },
  },
}

export const Dark: Story = {
  ...Output,
  globals: { theme: 'dark' },
}
