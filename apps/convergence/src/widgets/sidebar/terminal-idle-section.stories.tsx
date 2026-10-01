import type { Meta, StoryObj } from '@storybook/react-vite'
import type { TerminalIdleNotice } from '@/entities/terminal'
import { TooltipProvider } from '@convergence/ui'
import { expect, fn } from 'storybook/test'
import { TerminalIdleSection } from './terminal-idle-section.presentational'

const notice = (
  id: string,
  sessionName: string,
  processName: string,
  projectName: string,
): TerminalIdleNotice => ({
  id,
  sessionId: `session-${id}`,
  terminalId: `terminal-${id}`,
  processName,
  busySince: '2026-09-30T09:00:00.000Z',
  idleAt: '2026-09-30T09:04:12.000Z',
  sessionName,
  projectName,
  receivedAt: '2026-09-30T09:04:12.000Z',
})

const notices: TerminalIdleNotice[] = [
  notice('1', 'Terminal · tests', 'npm', 'convergence'),
  notice('2', 'Terminal · build', 'cargo', 'emergence'),
]

const meta = {
  title: 'Widgets/Sidebar/Terminal idle section',
  component: TerminalIdleSection,
  args: {
    notices,
    onSelect: fn(),
    onDismiss: fn(),
  },
  decorators: [
    (Story) => (
      <TooltipProvider>
        <div className="w-72 bg-background pt-2 text-foreground">
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
} satisfies Meta<typeof TerminalIdleSection>

export default meta

type Story = StoryObj<typeof meta>

/**
 * Terminals whose command finished: each opens its session, and each can be
 * acknowledged without opening it.
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await expect(canvas.getByText('Terminals Idle')).toBeVisible()
    await userEvent.click(
      canvas.getByRole('button', {
        name: 'Terminal · tests, terminal idle after npm, convergence',
      }),
    )
    await expect(args.onSelect).toHaveBeenCalledWith(notices[0])

    // The acknowledge button is reachable by keyboard though it shows on hover.
    const dismiss = canvas.getByRole('button', {
      name: 'Dismiss idle terminal Terminal · build',
    })
    dismiss.focus()
    await expect(dismiss).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await expect(args.onDismiss).toHaveBeenCalledWith('terminal-2')
    await expect(args.onSelect).toHaveBeenCalledOnce()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** Long names are cut short; the row stays one line in the sidebar. */
export const Long: Story = {
  args: {
    notices: Array.from({ length: 6 }, (_, index) =>
      notice(
        `${index}`,
        `Terminal · a long-running watcher for the design system package ${index + 1}`,
        'node --watch scripts/build-everything.mjs',
        'a-project-with-a-rather-long-name',
      ),
    ),
  },
  play: async ({ canvas }) => {
    const rows = canvas.getAllByRole('button', { name: /terminal idle after/ })
    await expect(rows).toHaveLength(6)
    for (const row of rows) {
      await expect(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth)
    }
  },
}

/** No idle terminals: no section. */
export const Empty: Story = {
  args: { notices: [] },
  play: async ({ canvas }) => {
    await expect(canvas.queryByText('Terminals Idle')).toBeNull()
  },
}
