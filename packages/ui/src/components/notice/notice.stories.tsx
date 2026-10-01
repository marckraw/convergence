import type { Meta, StoryObj } from '@storybook/react-vite'
import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { expect, fn } from 'storybook/test'
import { tokenColor } from '../../../.storybook/color-testing'
import { Notice } from './notice'

/** One notice in each tone, as the app's dialogs and settings show them. */
function NoticeSheet() {
  return (
    <div className="flex w-96 max-w-full flex-col gap-2 rounded-md bg-canvas p-4">
      <Notice title="Nothing changed since the last run." />
      <Notice tone="info" icon={<Info />} title="Runs on the remote host.">
        Files stay on the endpoint you picked.
      </Notice>
      <Notice
        tone="success"
        icon={<CircleCheck />}
        title="Signed in as marcin@example.com."
      />
      <Notice
        tone="warning"
        icon={<TriangleAlert />}
        title="The fork starts from an older turn."
      >
        Everything after turn 12 stays in the original.
      </Notice>
      <Notice
        tone="danger"
        icon={<CircleAlert />}
        title="Couldn't save the project."
      >
        The folder is read-only.
      </Notice>
    </div>
  )
}

const meta = {
  title: 'Components/Notice',
  component: NoticeSheet,
} satisfies Meta<typeof NoticeSheet>

export default meta

type Story = StoryObj<typeof meta>

/**
 * Every tone: its line, tint and ink. Danger and warning are alerts, the rest
 * a polite status; each is named by its title.
 */
export const Default: Story = {
  play: async ({ canvas }) => {
    const alerts = canvas.getAllByRole('alert')
    await expect(alerts.map((alert) => alert.dataset.tone)).toEqual([
      'warning',
      'danger',
    ])
    await expect(canvas.getAllByRole('status')).toHaveLength(3)
    const failed = canvas.getByRole('alert', {
      name: "Couldn't save the project.",
    })
    await expect(getComputedStyle(failed).color).toBe(
      tokenColor('--danger-ink'),
    )
    await expect(getComputedStyle(failed).borderTopColor).toBe(
      tokenColor('--danger-line'),
    )
    await expect(getComputedStyle(failed).borderTopLeftRadius).toBe('8px')
  },
}

export const Dark: Story = {
  globals: { theme: 'dark' },
  play: async ({ canvas }) => {
    const info = canvas.getByRole('status', {
      name: 'Runs on the remote host.',
    })
    await expect(getComputedStyle(info).color).toBe(tokenColor('--info-ink'))
  },
}

/** A Save that fails: the notice appears, and is announced as it does. */
function SaveForm() {
  const [failed, setFailed] = useState(false)
  return (
    <div className="flex w-80 flex-col gap-2 rounded-md bg-canvas p-4">
      <button
        type="button"
        onClick={() => setFailed(true)}
        className="self-start rounded-md border border-line px-3 py-1 text-sm text-ink"
      >
        Save
      </button>
      {failed ? (
        <Notice
          tone="danger"
          icon={<CircleAlert />}
          title="Couldn't save the project."
        >
          The folder is read-only.
        </Notice>
      ) : null}
    </div>
  )
}

/** Failed (R10): "Couldn't …" with the reason under it, as an alert. */
export const Failed: Story = {
  render: () => <SaveForm />,
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.queryByRole('alert')).toBeNull()
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }))
    const alert = canvas.getByRole('alert', {
      name: "Couldn't save the project.",
    })
    await expect(alert).toHaveTextContent('The folder is read-only.')
  },
}

/** Long: the words wrap inside the box, even a path with no spaces. */
export const Long: Story = {
  render: () => (
    <div className="w-72 rounded-md bg-canvas p-4">
      <Notice
        tone="warning"
        icon={<TriangleAlert />}
        title="The worktree for this conversation was removed outside Convergence."
      >
        /Users/marcin/Projects/Private/convergence/.claude/worktrees/agent-a7a8a3f6e5f98797c
      </Notice>
    </div>
  ),
  play: async ({ canvas }) => {
    const notice = canvas.getByRole('alert')
    await expect(notice.scrollWidth).toBeLessThanOrEqual(notice.clientWidth)
  },
}

const onDismiss = fn()

/** Dismissible: the ✕ at its top right, named "Not now", puts it away. */
export const Dismissible: Story = {
  render: () => (
    <div className="w-80 rounded-md bg-canvas p-4">
      <Notice
        tone="info"
        icon={<Info />}
        title="Convergence 0.96 is ready."
        onDismiss={onDismiss}
      >
        Restart to use it.
      </Notice>
    </div>
  ),
  play: async ({ canvas, userEvent }) => {
    onDismiss.mockClear()
    const dismiss = canvas.getByRole('button', { name: 'Not now' })
    await userEvent.tab()
    await expect(dismiss).toHaveFocus()
    await expect(getComputedStyle(dismiss).outlineStyle).toBe('solid')
    await userEvent.keyboard('{Enter}')
    await expect(onDismiss).toHaveBeenCalledOnce()
  },
}
