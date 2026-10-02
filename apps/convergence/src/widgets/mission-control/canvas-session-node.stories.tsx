import type { Meta, StoryObj } from '@storybook/react-vite'
import { ReactFlow, type Node, type NodeTypes } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { expect, fn, waitFor } from 'storybook/test'
import type { SessionSummary } from '@/entities/session'
import type { SessionCard } from '@/features/mission-control'
import { CanvasSessionNode } from './canvas-session-node.presentational'
import type { CanvasSessionNodeData } from './session-canvas.types'

const nodeTypes: NodeTypes = { session: CanvasSessionNode }

/**
 * One node on a real, read-only canvas: React Flow gives the node its id, so
 * its handles attach as they do in the app. Nothing here needs the app's IPC.
 */
function OnCanvas(data: CanvasSessionNodeData) {
  const nodes: Node[] = [
    {
      id: 'node-opus',
      type: 'session',
      position: { x: 24, y: 24 },
      data: data as unknown as Record<string, unknown>,
    },
  ]
  return (
    <div className="h-50 w-90">
      <ReactFlow
        nodes={nodes}
        edges={[]}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesFocusable={false}
        edgesFocusable={false}
        panOnDrag={false}
        zoomOnScroll={false}
        proOptions={{ hideAttribution: true }}
      />
    </div>
  )
}

const session = (overrides: Partial<SessionSummary> = {}): SessionSummary => ({
  id: 'session-opus',
  contextKind: 'project',
  projectId: 'project-convergence',
  workspaceId: null,
  providerId: 'claude-code',
  model: 'claude-opus-5',
  effort: 'high',
  name: 'opus-mac',
  status: 'idle',
  attention: 'none',
  activity: null,
  contextWindow: null,
  workingDirectory: '/Users/marcin/Projects/Private/convergence',
  archivedAt: null,
  parentSessionId: null,
  forkStrategy: null,
  primarySurface: 'conversation',
  continuationToken: null,
  lastSequence: 0,
  createdAt: '2026-09-17T10:00:00.000Z',
  updatedAt: '2026-09-17T12:00:00.000Z',
  executionHost: 'local',
  originKind: 'resident',
  pinnedAt: null,
  ...overrides,
})

const cardOf = (
  overrides: Partial<SessionSummary> = {},
  activityLabel = 'idle · 10m',
): SessionCard => ({
  session: session(overrides),
  projectName: 'convergence',
  providerLabel: 'Claude Code',
  activityLabel,
  crews: [],
  searchText: 'opus-mac convergence',
})

const meta = {
  title: 'Widgets/MissionControl/CanvasSessionNode',
  component: OnCanvas,
  args: {
    card: cardOf(),
    crewId: 'crew-1',
    onOpen: fn(),
    onPick: fn(),
  },
} satisfies Meta<typeof OnCanvas>

export default meta

type Story = StoryObj<typeof meta>

/** The card a node's door belongs to. */
const cardOfDoor = (door: HTMLElement) =>
  door.closest<HTMLElement>('[data-canvas-session-node]')!

/** A session on the canvas: the card's face; the body opens it, by click or key. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const node = await canvas.findByRole('button', { name: 'Open opus-mac' })
    await waitFor(() => expect(node).toBeVisible())
    await expect(cardOfDoor(node)).toHaveTextContent('Claude Code')
    await userEvent.click(node)
    await expect(args.onOpen).toHaveBeenCalledWith(args.card)
    node.focus()
    await userEvent.keyboard('{Enter}')
    await expect(args.onOpen).toHaveBeenCalledTimes(2)
    await expect(args.onPick).not.toHaveBeenCalled()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** Connect armed: the same gesture picks the card instead of opening it. */
export const Connecting: Story = {
  args: { authoring: true, connecting: true },
  play: async ({ args, canvas, userEvent }) => {
    const node = await canvas.findByRole('button', {
      name: 'Connect to opus-mac',
    })
    await waitFor(() => expect(node).toBeVisible())
    await userEvent.click(node)
    await expect(args.onPick).toHaveBeenCalledWith('session-opus')
    await expect(args.onOpen).not.toHaveBeenCalled()
  },
}

/** The chosen source: its name says what picking it again does. */
export const Busy: Story = {
  args: {
    authoring: true,
    connecting: true,
    connectSource: true,
    card: cardOf({ status: 'running' }, 'working · reading the Loom sheets'),
  },
  play: async ({ canvas }) => {
    const node = await canvas.findByRole('button', {
      name: 'opus-mac is the source — pick a recipient, or pick it again to start over',
    })
    await waitFor(() => expect(node).toBeVisible())
    await expect(cardOfDoor(node)).toHaveTextContent(
      'working · reading the Loom sheets',
    )
  },
}

/** Waiting on you, in the card's attention frame. */
export const Failed: Story = {
  args: {
    card: cardOf(
      { status: 'failed', attention: 'failed' },
      'failed · the provider exited',
    ),
  },
  play: async ({ canvas }) => {
    const node = await canvas.findByRole('button', { name: 'Open opus-mac' })
    await waitFor(() => expect(node).toBeVisible())
    await expect(cardOfDoor(node)).toHaveTextContent(
      'failed · the provider exited',
    )
  },
}

/**
 * A running session on a host the room cannot see (MC-4): the node keeps the
 * card's guard, so it says "Host unreachable" with unreachable's own glyph in
 * the warning tone (R1, MC-2), never a working pulse or a dot that reads as
 * the run's state.
 */
export const HostUnreachable: Story = {
  args: {
    card: cardOf(
      { status: 'running', attention: 'host-unreachable' },
      'working · reading the Loom sheets',
    ),
  },
  play: async ({ canvas }) => {
    const node = await canvas.findByRole('button', { name: 'Open opus-mac' })
    await waitFor(() => expect(node).toBeVisible())
    const card = cardOfDoor(node)
    await expect(card).toHaveTextContent('Host unreachable')
    await expect(card.querySelector('[data-slot="status-dot"]')).toBeNull()
    const glyph = card.querySelector('svg[data-tone]')!
    await expect(glyph).toHaveAttribute('data-tone', 'warning')
    await expect(card.querySelector('[data-pulse]')).toBeNull()
  },
}

export const HostUnreachableDark: Story = {
  ...HostUnreachable,
  globals: { theme: 'dark' },
}
