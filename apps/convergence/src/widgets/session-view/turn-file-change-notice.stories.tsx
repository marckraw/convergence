import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { TurnFileChangeNotices } from './turn-file-change-notice.presentational'
import { describeTurnFileChange } from './turn-file-change-notice.pure'

const meta = {
  title: 'Widgets/SessionView/TurnFileChangeNotice',
  component: TurnFileChangeNotices,
  args: {
    notices: describeTurnFileChange({ binary: true, truncated: true }),
  },
  decorators: [
    (Story) => (
      <div className="w-128 max-w-full rounded-md border border-line bg-canvas">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TurnFileChangeNotices>

export default meta

type Story = StoryObj<typeof meta>

/** What a stored diff cannot say about itself, said above it. */
export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText('Binary file — there is no textual diff to show.'),
    ).toBeVisible()
    await expect(
      canvas.getByText(
        'Diff truncated — this is a fragment, not the whole change.',
      ),
    ).toBeVisible()
  },
}

/** A whole, textual diff: nothing to say, so nothing is drawn. */
export const Empty: Story = {
  args: { notices: [] },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.textContent).toBe('')
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
