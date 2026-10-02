import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ComponentProps } from 'react'
import { expect } from 'storybook/test'
import { DescriptionItem, DescriptionList } from '@convergence/ui'
import { AttentionIndicator } from './attention-indicator.presentational'

type IndicatorProps = ComponentProps<typeof AttentionIndicator>

/** Every pill the header can show, in the order they outrank each other. */
const STATES: Array<{ label: string; props: IndicatorProps }> = [
  {
    label: 'Waiting on an approval',
    props: { status: 'running', attention: 'needs-approval' },
  },
  {
    label: 'Waiting on an answer',
    props: { status: 'running', attention: 'needs-input' },
  },
  {
    label: 'A turn in progress',
    props: { status: 'running', attention: 'none' },
  },
  {
    label: 'Compacting its context',
    props: {
      status: 'completed',
      attention: 'finished',
      activity: 'compacting',
    },
  },
  {
    label: 'Background work after the turn',
    props: {
      status: 'completed',
      attention: 'finished',
      parallelWork: { running: 2, unknown: 0, failed: 0, stopped: 0 },
    },
  },
  { label: 'Done', props: { status: 'completed', attention: 'finished' } },
  { label: 'The turn broke', props: { status: 'failed', attention: 'failed' } },
  {
    label: 'The machine went quiet',
    props: { status: 'idle', attention: 'host-unreachable' },
  },
]

/** The pills in a list, each named for the case it shows. */
function AllStates() {
  return (
    <DescriptionList layout="inline" className="w-96 gap-2">
      {STATES.map(({ label, props }) => (
        <DescriptionItem key={label} term={label}>
          <AttentionIndicator {...props} />
        </DescriptionItem>
      ))}
    </DescriptionList>
  )
}

/** The tone each pill wears, in order. */
const canvasTones = (values: HTMLElement[]) =>
  values.map((value) =>
    value.querySelector('[data-slot="status-pill"]')?.getAttribute('data-tone'),
  )

const meta = {
  title: 'Entities/Session/Attention indicator',
  component: AttentionIndicator,
  args: { status: 'running', attention: 'needs-approval' },
} satisfies Meta<typeof AttentionIndicator>

export default meta

type Story = StoryObj<typeof meta>

/** Blocked on a human outranks the spinner, though the turn is still running. */
export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Needs Approval')).toBeVisible()
    await expect(canvas.queryByText('Running')).toBeNull()
  },
}

/** Every state at once: the order is the precedence the header uses. */
export const States: Story = {
  render: () => <AllStates />,
  play: async ({ canvas }) => {
    for (const text of [
      'Needs Approval',
      'Needs Input',
      'Running',
      'Compacting context…',
      'finished · 2 tasks running',
      'Finished',
      'Failed',
      'Host Unreachable',
    ]) {
      await expect(canvas.getByText(text)).toBeVisible()
    }
    // R1: each settled attention wears the session's tone for it.
    const tones = canvasTones(canvas.getAllByRole('definition'))
    await expect(tones).toEqual([
      'warning',
      'warning',
      'neutral',
      'neutral',
      'neutral',
      'success',
      'danger',
      'warning',
    ])
  },
}

export const Dark: Story = {
  ...States,
  globals: { theme: 'dark' },
}

/** A running turn spins, and says so in words. */
export const Busy: Story = {
  args: { status: 'running', attention: 'none' },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Running')).toBeVisible()
  },
}

/** A compacting conversation is busy, never Finished. */
export const Compacting: Story = {
  args: { status: 'completed', attention: 'finished', activity: 'compacting' },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Compacting context…')).toBeVisible()
    await expect(canvas.queryByText('Finished')).toBeNull()
  },
}

export const Failed: Story = {
  args: { status: 'failed', attention: 'failed' },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Failed')).toBeVisible()
  },
}

/** Nothing needs anyone: silence, not a pill. */
export const Empty: Story = {
  args: { status: 'idle', attention: 'none' },
  play: async ({ canvasElement }) => {
    await expect(canvasElement).toHaveTextContent('')
  },
}
