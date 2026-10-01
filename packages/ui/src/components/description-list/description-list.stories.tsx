import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import {
  DescriptionItem,
  DescriptionList,
  type DescriptionListLayout,
} from './description-list'

type SessionDetailsProps = {
  layout: DescriptionListLayout
  branch: string
}

/** A session's details, as the Details menu and Parallel work show them. */
function SessionDetails({ layout, branch }: SessionDetailsProps) {
  return (
    <div className="w-72 rounded-md bg-canvas p-4">
      <DescriptionList layout={layout}>
        <DescriptionItem term="Branch">{branch}</DescriptionItem>
        <DescriptionItem term="Model">Claude Opus</DescriptionItem>
        <DescriptionItem term="Started">4 min ago</DescriptionItem>
      </DescriptionList>
    </div>
  )
}

const meta = {
  title: 'Components/DescriptionList',
  component: SessionDetails,
  args: { layout: 'stacked', branch: 'ui/ds3d-display' },
} satisfies Meta<typeof SessionDetails>

export default meta

type Story = StoryObj<typeof meta>

/** Stacked: each term over its value, in a `<dl>`. */
export const Default: Story = {
  play: async ({ canvas, canvasElement }) => {
    const list = canvasElement.querySelector('dl') as HTMLElement
    await expect(list.querySelectorAll('dt')).toHaveLength(3)
    const term = canvas.getByText('Branch')
    const value = canvas.getByText('ui/ds3d-display')
    await expect(term.tagName).toBe('DT')
    await expect(value.tagName).toBe('DD')
    await expect(value.getBoundingClientRect().top).toBeGreaterThan(
      term.getBoundingClientRect().top,
    )
  },
}

/** Inline: the term at the start of its line, the value at its end. */
export const Inline: Story = {
  args: { layout: 'inline' },
  play: async ({ canvas }) => {
    const term = canvas.getByText('Model').getBoundingClientRect()
    const value = canvas.getByText('Claude Opus').getBoundingClientRect()
    await expect(Math.abs(value.bottom - term.bottom)).toBeLessThan(4)
    await expect(value.left).toBeGreaterThan(term.right)
  },
}

export const Dark: Story = {
  globals: { theme: 'dark' },
}

/** Long: stacked, a long value wraps; inline, it is cut short at the line's end. */
export const Long: Story = {
  args: {
    layout: 'inline',
    branch: 'ui/ds3d-display-parts-for-the-design-system-and-everything-after',
  },
  play: async ({ canvas }) => {
    const value = canvas.getByText(/ui\/ds3d-display-parts/)
    await expect(getComputedStyle(value).textOverflow).toBe('ellipsis')
    await expect(value.scrollWidth).toBeGreaterThan(value.clientWidth)
    await expect(canvas.getByText('Branch')).toBeVisible()
  },
}
