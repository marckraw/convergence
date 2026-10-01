import type { Meta, StoryObj } from '@storybook/react-vite'
import { ReactFlow, type Node, type NodeTypes } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { expect, fn, waitFor } from 'storybook/test'
import { CanvasChairNode } from './canvas-chair-node.presentational'
import type { CanvasChairNodeData } from './session-canvas.types'

const nodeTypes: NodeTypes = { chair: CanvasChairNode }

/** The chair on a real, read-only canvas, so its handles have a node to attach to. */
function OnCanvas(data: CanvasChairNodeData) {
  const nodes: Node[] = [
    {
      id: 'chair-crew-1',
      type: 'chair',
      position: { x: 24, y: 24 },
      data: data as unknown as Record<string, unknown>,
    },
  ]
  return (
    <div className="h-[160px] w-[360px]">
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
  title: 'Widgets/MissionControl/CanvasChairNode',
  component: OnCanvas,
  args: {
    id: 'chair-crew-1',
    crewId: 'crew-1',
    lit: false,
    detail: null,
    onAcknowledge: fn(),
  },
} satisfies Meta<typeof OnCanvas>

export default meta

type Story = StoryObj<typeof meta>

/** Dark until something parks there: nothing is waiting, and there is no Seen. */
export const Default: Story = {
  play: async ({ canvas }) => {
    const words = await canvas.findByText('nothing is waiting on you here')
    await waitFor(() => expect(words).toBeVisible())
    await expect(canvas.getByText('Marcin')).toBeVisible()
    await expect(canvas.queryByRole('button')).toBeNull()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** Lit: what the crew is asking, and Seen answers every call it is making. */
export const Busy: Story = {
  args: {
    lit: true,
    detail: 'Fable: two laps in, the reviewer still wants the cap discussed',
  },
  play: async ({ args, canvas, userEvent }) => {
    const seen = await canvas.findByRole('button', {
      name: 'Answer the hails for this crew',
    })
    await waitFor(() => expect(seen).toBeVisible())
    await expect(canvas.getByText(args.detail!)).toBeVisible()
    await userEvent.click(seen)
    await expect(args.onAcknowledge).toHaveBeenCalledWith('crew-1')
  },
}

export const BusyDark: Story = {
  ...Busy,
  globals: { theme: 'dark' },
}
