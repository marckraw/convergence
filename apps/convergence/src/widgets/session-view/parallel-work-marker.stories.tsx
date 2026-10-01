import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { ParallelWorkMarkerView } from './parallel-work-marker.presentational'

const meta = {
  title: 'Widgets/SessionView/ParallelWorkMarker',
  component: ParallelWorkMarkerView,
  args: {
    marker: {
      rowKey: 'agent:run-7f3a',
      label: 'Started agent: Audit the IPC handlers for missing guards',
      replace: false,
    },
    onSelect: fn(),
  },
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="w-[36rem] max-w-full">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ParallelWorkMarkerView>

export default meta

type Story = StoryObj<typeof meta>

/** A line in the transcript where work started in parallel; it opens that row. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole('button', {
        name: /Started agent: Audit the IPC handlers/,
      }),
    )
    await expect(args.onSelect).toHaveBeenCalledWith('agent:run-7f3a')
  },
}

/** A long label wraps rather than running out of the transcript. */
export const Long: Story = {
  args: {
    marker: {
      rowKey: 'task:bg-91c2',
      label:
        'Started background command: npm run test:unit -- --reporter=verbose --coverage apps/convergence/src/widgets/session-view apps/convergence/src/features/composer',
      replace: false,
    },
  },
  play: async ({ canvas }) => {
    const marker = canvas.getByRole('button', {
      name: /Started background command/,
    })
    await expect(marker.scrollWidth).toBeLessThanOrEqual(marker.clientWidth)
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
