import type { Meta, StoryObj } from '@storybook/react-vite'
import { LayoutGrid, List } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { expect, fn } from 'storybook/test'
import { SegmentedControl, SegmentedControlItem } from './segmented-control'
import type { SegmentedSize } from './segmented-control.styles'

type Segment = {
  value: string
  label: string
  icon?: ReactNode
  disabled?: boolean
}

type ChooseOneProps = {
  label: string
  segments: Segment[]
  defaultValue?: string
  size?: SegmentedSize
  className?: string
  onValueChange: (value: string) => void
}

/** A view with a few short answers, on one line: Mission Control's layout. */
function ChooseOne({
  label,
  segments,
  defaultValue,
  size,
  className,
  onValueChange,
}: ChooseOneProps) {
  const [value, setValue] = useState(defaultValue)
  const labelId = useId()
  return (
    <div className="flex w-96 max-w-full items-center justify-between gap-2">
      <span id={labelId} className="text-sm font-medium">
        {label}
      </span>
      <SegmentedControl
        aria-labelledby={labelId}
        size={size}
        className={className}
        value={value}
        onValueChange={(next: string) => {
          setValue(next)
          onValueChange(next)
        }}
      >
        {segments.map((segment) => (
          <SegmentedControlItem
            key={segment.value}
            value={segment.value}
            disabled={segment.disabled}
          >
            {segment.icon}
            {segment.label}
          </SegmentedControlItem>
        ))}
      </SegmentedControl>
    </div>
  )
}

const views: Segment[] = [
  { value: 'board', label: 'Board', icon: <LayoutGrid aria-hidden /> },
  { value: 'list', label: 'List', icon: <List aria-hidden /> },
]

const meta = {
  title: 'Primitives/SegmentedControl',
  component: ChooseOne,
  args: {
    label: 'View',
    segments: views,
    defaultValue: 'board',
    onValueChange: fn(),
  },
} satisfies Meta<typeof ChooseOne>

export default meta

type Story = StoryObj<typeof meta>

/** R7: the chosen segment is a raised chip (a shadow); the rest lie flat on the track. */
const expectRaised = async (chosen: HTMLElement, others: HTMLElement[]) => {
  await expect(chosen).toBeChecked()
  await expect(getComputedStyle(chosen).boxShadow).not.toBe('none')
  for (const other of others) {
    await expect(other).not.toBeChecked()
    await expect(getComputedStyle(other).boxShadow).toBe('none')
  }
}

/**
 * A click chooses a segment and raises it. The keyboard does the same: Tab
 * reaches the chosen segment, the arrow keys move the choice.
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const board = canvas.getByRole('radio', { name: 'Board' })
    const list = canvas.getByRole('radio', { name: 'List' })
    await expect(canvas.getByRole('radiogroup', { name: 'View' })).toBeVisible()
    await expectRaised(board, [list])
    await expect(board.getBoundingClientRect().height).toBe(32)

    await userEvent.click(list)
    await expectRaised(list, [board])
    await expect(args.onValueChange).toHaveBeenCalledWith('list')

    await userEvent.tab()
    await userEvent.tab({ shift: true })
    await expect(list).toHaveFocus()
    await expect(getComputedStyle(list).outlineStyle).toBe('solid')
    await userEvent.keyboard('{ArrowLeft}')
    await expectRaised(board, [list])
    await expect(args.onValueChange).toHaveBeenLastCalledWith('board')
  },
}

/** Sizes (R3): items 24, 28 and 32 px tall inside the 2 px track. */
export const Sizes: Story = {
  render: (args) => (
    <div className="flex flex-col gap-3">
      {(['xs', 'sm', 'md'] as const).map((size) => (
        <ChooseOne key={size} {...args} label={`View ${size}`} size={size} />
      ))}
    </div>
  ),
  play: async ({ canvas }) => {
    const heights = { xs: 24, sm: 28, md: 32 }
    for (const [size, height] of Object.entries(heights)) {
      const group = canvas.getByRole('radiogroup', { name: `View ${size}` })
      await expect(group).toHaveAttribute('data-size', size)
      for (const radio of Array.from(
        group.querySelectorAll<HTMLElement>('[role="radio"]'),
      )) {
        await expect(radio.getBoundingClientRect().height).toBe(height)
      }
    }
  },
}

/** Empty: nothing chosen yet, every segment quiet. */
export const Empty: Story = {
  args: { defaultValue: undefined },
  play: async ({ canvas }) => {
    for (const radio of canvas.getAllByRole('radio')) {
      await expect(radio).not.toBeChecked()
    }
  },
}

/** Disabled: one segment can't be chosen. */
export const Disabled: Story = {
  args: {
    label: 'Range',
    defaultValue: '7d',
    segments: [
      { value: '7d', label: '7 days' },
      { value: '30d', label: '30 days' },
      { value: '90d', label: '90 days', disabled: true },
    ],
  },
  play: async ({ args, canvas, userEvent }) => {
    const ninety = canvas.getByRole('radio', { name: '90 days' })
    await expect(ninety).toHaveAttribute('aria-disabled', 'true')
    // The arrows skip it: from 30 days they wrap round to 7 days.
    await userEvent.click(canvas.getByRole('radio', { name: '30 days' }))
    await userEvent.keyboard('{ArrowRight}')
    await expect(ninety).not.toBeChecked()
    await expect(canvas.getByRole('radio', { name: '7 days' })).toBeChecked()
    await expect(args.onValueChange).not.toHaveBeenCalledWith('90d')
  },
}

/** Long: in too little room, the words are cut short with an ellipsis, each on one line. */
export const Long: Story = {
  args: {
    label: 'Notify',
    defaultValue: 'mentions',
    className: 'w-56',
    segments: [
      { value: 'everything', label: 'Everything that happens' },
      { value: 'mentions', label: 'Only when it needs me' },
      { value: 'none', label: 'Nothing at all' },
    ],
  },
  play: async ({ canvas }) => {
    const radio = canvas.getByRole('radio', { name: 'Everything that happens' })
    const words = canvas.getByText('Everything that happens')
    await expect(getComputedStyle(words).textOverflow).toBe('ellipsis')
    await expect(words.scrollWidth).toBeGreaterThan(words.clientWidth)
    await expect(radio.getBoundingClientRect().height).toBe(32)
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
