import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { ConversationDockPlaceholder } from './conversation-dock-placeholder.presentational'
import { WorkspaceLayoutView } from './workspace-layout.presentational'

const conversation = (
  <section
    aria-label="Conversation"
    className="flex flex-1 flex-col gap-2 bg-background p-4 text-sm text-foreground"
  >
    <p className="font-medium">Fix the sidebar overflow</p>
    <p className="text-muted-foreground">
      The project list overflows below 900 px; the search field loses focus on
      Escape.
    </p>
  </section>
)

const terminal = (
  <section
    aria-label="Terminal dock"
    className="flex h-40 min-w-56 shrink-0 flex-col bg-terminal-bg p-3 font-mono text-xs text-terminal-ink"
  >
    <span>~/Projects/Private/convergence $ npm run test:stories</span>
  </section>
)

const meta = {
  title: 'Widgets/Workspace layout/Workspace layout',
  component: WorkspaceLayoutView,
  args: {
    mainSlot: conversation,
    dockSlot: terminal,
    dockVisible: true,
    dockPlacement: 'bottom',
  },
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="h-120 border border-border">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof WorkspaceLayoutView>

export default meta

type Story = StoryObj<typeof meta>

const precedes = (first: Element, second: Element) =>
  Boolean(
    first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING,
  )

/** The conversation above, the terminal dock below it. */
export const Default: Story = {
  play: async ({ canvas }) => {
    const main = canvas.getByRole('region', { name: 'Conversation' })
    const dock = canvas.getByRole('region', { name: 'Terminal dock' })
    await expect(precedes(main, dock)).toBe(true)
    await expect(dock.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      main.getBoundingClientRect().bottom,
    )
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** Docked to the right: side by side, the conversation first. */
export const Right: Story = {
  args: { dockPlacement: 'right' },
  play: async ({ canvas }) => {
    const main = canvas.getByRole('region', { name: 'Conversation' })
    const dock = canvas.getByRole('region', { name: 'Terminal dock' })
    await expect(precedes(main, dock)).toBe(true)
    await expect(dock.getBoundingClientRect().left).toBeGreaterThanOrEqual(
      main.getBoundingClientRect().right,
    )
  },
}

/** Docked to the left: the dock comes first, in reading order too. */
export const Left: Story = {
  args: { dockPlacement: 'left' },
  play: async ({ canvas }) => {
    const main = canvas.getByRole('region', { name: 'Conversation' })
    const dock = canvas.getByRole('region', { name: 'Terminal dock' })
    await expect(precedes(dock, main)).toBe(true)
    await expect(main.getBoundingClientRect().left).toBeGreaterThanOrEqual(
      dock.getBoundingClientRect().right,
    )
  },
}

/** A hidden dock leaves the conversation alone in the window. */
export const Empty: Story = {
  args: { dockVisible: false },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('region', { name: 'Conversation' }),
    ).toBeVisible()
    await expect(
      canvas.queryByRole('region', { name: 'Terminal dock' }),
    ).toBeNull()
  },
}

/**
 * A terminal session's workspace: the terminal is the main view, and the dock
 * says there is no conversation to show.
 */
export const TerminalOnly: Story = {
  name: 'Terminal only',
  args: {
    mainSlot: terminal,
    dockSlot: <ConversationDockPlaceholder />,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('No conversation history')).toBeVisible()
    await expect(
      canvas.getByText(/Convert it to a conversation session/),
    ).toHaveTextContent(/workspace\.$/)
  },
}

/** Once converting exists, the placeholder says it is coming. */
export const TerminalOnlyConvertible: Story = {
  name: 'Terminal only, convertible',
  args: {
    mainSlot: terminal,
    dockSlot: <ConversationDockPlaceholder onConvert={() => undefined} />,
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText(/Convert it to a conversation session/),
    ).toHaveTextContent(/\(coming soon\)\.$/)
  },
}
