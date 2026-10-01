import type { Meta, StoryObj } from '@storybook/react-vite'
import { ReactFlow, type Node, type NodeTypes } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { expect, waitFor } from 'storybook/test'
import { CanvasCrewCluster } from './canvas-crew-cluster.presentational'
import type { CanvasCrewClusterData } from './session-canvas.types'
import { crewTokens } from '@convergence/ui'

const nodeTypes: NodeTypes = { cluster: CanvasCrewCluster }

/** The crew's frame on a real, read-only canvas, as the app draws it. */
function OnCanvas(data: CanvasCrewClusterData) {
  const nodes: Node[] = [
    {
      id: 'cluster-crew-1',
      type: 'cluster',
      position: { x: 16, y: 16 },
      data: data as unknown as Record<string, unknown>,
    },
  ]
  return (
    <div className="h-[260px] w-[520px]">
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
  title: 'Widgets/MissionControl/CanvasCrewCluster',
  component: OnCanvas,
  args: {
    crewId: 'crew-1',
    name: 'convergence development',
    emoji: '🐎',
    accentColor: crewTokens.violet,
    parked: false,
    width: 480,
    height: 220,
    originX: 0,
    originY: 0,
  },
} satisfies Meta<typeof OnCanvas>

export default meta

type Story = StoryObj<typeof meta>

/** A crew's frame: its emoji, its accent and its name as the frame's heading. */
export const Default: Story = {
  play: async ({ canvas }) => {
    const heading = await canvas.findByRole('heading', {
      name: 'convergence development',
    })
    await waitFor(() => expect(heading).toBeVisible())
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** A plain crew: no emoji, no accent, the frame still named. */
export const Empty: Story = {
  args: { name: 'spikes', emoji: null, accentColor: null },
  play: async ({ canvas }) => {
    const heading = await canvas.findByRole('heading', { name: 'spikes' })
    await waitFor(() => expect(heading).toBeVisible())
  },
}

/** A parked loop: the frame goes amber, whatever accent the crew chose. */
export const Busy: Story = {
  args: { parked: true },
  play: async ({ canvas, canvasElement }) => {
    const heading = await canvas.findByRole('heading', {
      name: 'convergence development',
    })
    await waitFor(() => expect(heading).toBeVisible())
    await expect(
      canvasElement.querySelector('[data-crew-parked]'),
    ).toHaveAttribute('data-crew-parked', 'true')
  },
}

/** A long name is cut short inside the frame's header. */
export const Long: Story = {
  args: {
    name: 'convergence development — the Loom wave, the Door and everything after them',
    width: 280,
  },
  play: async ({ canvas }) => {
    const heading = await canvas.findByRole('heading', {
      name: /the Loom wave/,
    })
    await waitFor(() => expect(heading).toBeVisible())
    await expect(heading.scrollWidth).toBeGreaterThan(heading.clientWidth)
  },
}
