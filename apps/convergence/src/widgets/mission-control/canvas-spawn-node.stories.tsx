import type { Meta, StoryObj } from '@storybook/react-vite'
import { ReactFlow, type Node, type NodeTypes } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { expect, waitFor } from 'storybook/test'
import { CanvasSpawnNode } from './canvas-spawn-node.presentational'
import type { CanvasSpawnNodeData } from './session-canvas.types'

const nodeTypes: NodeTypes = { spawn: CanvasSpawnNode }

/** The spawn node on a real, read-only canvas, so its handles have a node. */
function OnCanvas(data: CanvasSpawnNodeData) {
  const nodes: Node[] = [
    {
      id: 'spawn-relay-1',
      type: 'spawn',
      position: { x: 24, y: 24 },
      data: data as unknown as Record<string, unknown>,
    },
  ]
  return (
    <div className="h-40 w-90">
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

const meta = {
  title: 'Widgets/MissionControl/CanvasSpawnNode',
  component: OnCanvas,
  args: {
    id: 'spawn-relay-1',
    relayId: 'relay-1',
    crewId: 'crew-1',
    name: 'Reviewer',
    providerId: 'codex',
    model: 'gpt-6',
    armed: true,
  },
} satisfies Meta<typeof OnCanvas>

export default meta

type Story = StoryObj<typeof meta>

/** The session an armed spawn wire will open, captioned with what it will be. */
export const Default: Story = {
  play: async ({ canvas }) => {
    const name = await canvas.findByText('Reviewer')
    await waitFor(() => expect(name).toBeVisible())
    await expect(
      canvas.getByText('starts a new session · codex · gpt-6'),
    ).toBeVisible()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** A wire that is off, with a spec nobody can read: still drawn, and it says so. */
export const Disabled: Story = {
  args: { armed: false, providerId: null, model: null },
  play: async ({ canvas }) => {
    const caption = await canvas.findByText(
      'starts a new session · spec unreadable',
    )
    await waitFor(() => expect(caption).toBeVisible())
  },
}
