import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import {
  SessionStateBadge,
  type SessionStateBadgeSession,
} from './session-state-badge.presentational'

/** Every glyph a session's row can wear, with what each one means. */
const STATES: Array<{ label: string; session: SessionStateBadgeSession }> = [
  {
    label: 'Needs approval',
    session: { status: 'running', attention: 'needs-approval', activity: null },
  },
  {
    label: 'Needs input',
    session: { status: 'running', attention: 'needs-input', activity: null },
  },
  {
    label: 'Running',
    session: { status: 'running', attention: 'none', activity: 'streaming' },
  },
  {
    label: 'Compacting',
    session: {
      status: 'completed',
      attention: 'finished',
      activity: 'compacting',
    },
  },
  {
    label: 'Background tasks',
    session: {
      status: 'completed',
      attention: 'finished',
      activity: null,
      parallelWork: { running: 1, unknown: 0, failed: 0, stopped: 0 },
    },
  },
  {
    label: 'Finished',
    session: { status: 'completed', attention: 'finished', activity: null },
  },
  {
    label: 'Failed',
    session: { status: 'failed', attention: 'failed', activity: null },
  },
]

/** The glyphs in a list, each beside the words a row would show it with. */
function AllStates() {
  return (
    <ul
      aria-label="Session states"
      className="space-y-1.5 text-xs text-foreground"
    >
      {STATES.map(({ label, session }) => (
        <li key={label} className="flex items-center gap-2">
          <SessionStateBadge session={session} />
          {label}
        </li>
      ))}
    </ul>
  )
}

const meta = {
  title: 'Entities/Session/Session state badge',
  component: SessionStateBadge,
  args: {
    session: { status: 'completed', attention: 'finished', activity: null },
  },
} satisfies Meta<typeof SessionStateBadge>

export default meta

type Story = StoryObj<typeof meta>

/** A finished session: a check, decoration beside the row's own name. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const glyph = canvasElement.querySelector('svg')
    await expect(glyph).toBeVisible()
    await expect(glyph).toHaveAttribute('aria-hidden', 'true')
  },
}

/** Every state; the busy ones that a row cannot say otherwise are named. */
export const States: Story = {
  render: () => <AllStates />,
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole('listitem')).toHaveLength(STATES.length)
    // Compacting and background work have no word on the row, so the glyph
    // carries one.
    await expect(
      canvas.getByLabelText('Compacting context…'),
    ).toBeInTheDocument()
    await expect(
      canvas.getByLabelText('finished · 1 tasks running'),
    ).toBeInTheDocument()
    // R1: the settled states wear their tones; waiting on you is warning,
    // for an answer as for an approval.
    const tones = canvas
      .getAllByRole('listitem')
      .map((item) =>
        item.querySelector('[data-tone]')?.getAttribute('data-tone'),
      )
    await expect(tones).toEqual([
      'warning',
      'warning',
      undefined,
      undefined,
      undefined,
      'success',
      'danger',
    ])
  },
}

export const Dark: Story = {
  ...States,
  globals: { theme: 'dark' },
}

/** A compacting conversation is busy, never a green check. */
export const Busy: Story = {
  args: {
    session: {
      status: 'completed',
      attention: 'finished',
      activity: 'compacting',
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText('Compacting context…')).toBeVisible()
  },
}

/** A row with no record (an unknown attempt) still draws a glyph. */
export const Empty: Story = {
  args: { session: null },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('svg')).toBeVisible()
  },
}
