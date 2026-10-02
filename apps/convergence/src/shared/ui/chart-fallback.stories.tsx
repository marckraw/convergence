import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { ChartFallback } from './chart-fallback.presentational'

const meta = {
  title: 'Components/Shared/Chart fallback',
  component: ChartFallback,
  decorators: [
    (Story) => (
      <div className="h-64 w-96 max-w-full">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ChartFallback>

export default meta

type Story = StoryObj<typeof meta>

/**
 * Where a chart would be, on a machine without WebGPU: a dashed box that says
 * so, as a status, while the numbers around it still work.
 */
export const Default: Story = {
  play: async ({ canvas }) => {
    const status = canvas.getByRole('status')
    await expect(status).toHaveTextContent('Charts unavailable')
    await expect(status).toHaveTextContent(/needs WebGPU support/)
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** The caller's own words, long enough to wrap under the title. */
export const Long: Story = {
  args: {
    title: 'Usage over time is unavailable',
    description:
      'This chart draws with WebGPU, which this machine does not offer. The totals, the per-provider table and the export above it are unaffected and stay up to date.',
  },
  play: async ({ canvas }) => {
    const description = canvas.getByText(/draws with WebGPU/)
    await expect(description.getClientRects().length).toBeGreaterThan(0)
    await expect(description.getBoundingClientRect().height).toBeGreaterThan(20)
  },
}
