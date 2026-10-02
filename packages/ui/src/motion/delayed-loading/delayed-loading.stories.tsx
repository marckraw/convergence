import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, waitFor } from 'storybook/test'
import { Button } from '../../components/button/button'
import { useDelayedLoading } from './useDelayedLoading'

type LoadDemoProps = {
  /** How long each answer takes, in ms, by button label. */
  answers: Record<string, number>
}

/** Buttons that start work of a known length, and the loading line the hook decides on. */
function LoadDemo({ answers }: LoadDemoProps) {
  const [pending, setPending] = useState(0)
  const showLoading = useDelayedLoading(pending > 0)
  const load = (milliseconds: number) => {
    setPending((count) => count + 1)
    setTimeout(() => setPending((count) => count - 1), milliseconds)
  }
  return (
    <div className="flex w-96 max-w-full flex-col gap-3 rounded-md bg-canvas p-3">
      <div className="flex flex-wrap gap-2">
        {Object.entries(answers).map(([label, milliseconds]) => (
          <Button key={label} onClick={() => load(milliseconds)}>
            {label}
          </Button>
        ))}
      </div>
      <p role="status" className="h-5 text-sm text-ink-muted">
        {showLoading ? 'Loading…' : ''}
      </p>
    </div>
  )
}

const meta = {
  title: 'Motion/DelayedLoading',
  component: LoadDemo,
  args: {
    answers: {
      'Answer in 50 ms': 50,
      'Answer in 1.5 s': 1500,
    },
  },
} satisfies Meta<typeof LoadDemo>

export default meta

type Story = StoryObj<typeof meta>

const sleep = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds))

/** A quick answer never flashes a loading state; a slow one shows it after 300 ms. */
export const Default: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole('button', { name: 'Answer in 50 ms' }),
    )
    const until = performance.now() + 500
    while (performance.now() < until) {
      await expect(canvas.getByRole('status')).toHaveTextContent('')
      await sleep(10)
    }
  },
}

/** Busy: a slow answer shows the loading state after the delay, until it arrives. */
export const Busy: Story = {
  play: async ({ canvas, userEvent }) => {
    const start = performance.now()
    await userEvent.click(
      canvas.getByRole('button', { name: 'Answer in 1.5 s' }),
    )
    await canvas.findByText('Loading…', {}, { timeout: 1000 })
    await expect(performance.now() - start).toBeGreaterThanOrEqual(290)
    await waitFor(
      () => expect(canvas.getByRole('status')).toHaveTextContent(''),
      { timeout: 2500 },
    )
    await expect(performance.now() - start).toBeGreaterThanOrEqual(1500)
  },
}

export const Dark: Story = {
  globals: { theme: 'dark' },
}
