import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ResponseAnnotation } from '@/entities/response-annotation'
import { expect, fn } from 'storybook/test'
import { AnnotationChip } from './annotation-chip.presentational'
import { AnnotationStrip } from './annotation-strip.presentational'
import { fourteenAnnotationDrafts } from './annotation-strip-payload.fixture'

/** The fourteen annotations of the MAR-3004 QA reply, as the store holds them. */
const fourteen: ResponseAnnotation[] = fourteenAnnotationDrafts({
  latest: 'item-latest',
  earlier: 'item-earlier',
}).map((draft, index) => ({
  ...draft,
  id: `annotation-${index + 1}`,
  state: 'pending',
  createdAt: `2026-10-01T14:${String(10 + index).padStart(2, '0')}:00.000Z`,
}))

const three = fourteen.slice(0, 3)

const meta = {
  title: 'Features/ResponseAnnotations/AnnotationStrip',
  component: AnnotationStrip,
  args: {
    annotations: three,
    expandedId: null,
    tabStopId: 'annotation-1',
    onExpand: fn(),
    onCollapse: fn(),
    onPillFocus: fn(),
    renderExpanded: (annotation) => (
      <AnnotationChip
        annotation={annotation}
        isEditing={false}
        editValue={annotation.body}
        onEditValueChange={fn()}
        onStartEdit={fn()}
        onSubmitEdit={fn()}
        onCancelEdit={fn()}
        onRemove={fn()}
      />
    ),
  },
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="w-[44rem] max-w-full">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AnnotationStrip>

export default meta

type Story = StoryObj<typeof meta>

/** Every pending annotation as one pill in a row; the arrows walk it. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const list = canvas.getByRole('list', { name: 'Responding to' })
    await expect(list).toBeVisible()
    await expect(canvas.getByText('3 annotations')).toBeVisible()
    const pills = canvas.getAllByRole('button')
    await expect(pills).toHaveLength(3)
    // One Tab stop for the whole row.
    await expect(pills[0]).toHaveAttribute('tabindex', '0')
    await expect(pills[1]).toHaveAttribute('tabindex', '-1')
    await userEvent.tab()
    await expect(pills[0]).toHaveFocus()
    await expect(args.onPillFocus).toHaveBeenCalledWith('annotation-1')
    await userEvent.keyboard('{ArrowRight}')
    await expect(pills[1]).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await expect(args.onExpand).toHaveBeenCalledWith('annotation-2')
  },
}

/** One pill open into its full chip; Escape folds it again. */
export const Expanded: Story = {
  args: { expandedId: 'annotation-2', tabStopId: 'annotation-2' },
  play: async ({ args, canvas, userEvent }) => {
    const edit = canvas.getByRole('button', { name: /^Edit response to/ })
    edit.focus()
    await userEvent.keyboard('{Escape}')
    await expect(args.onCollapse).toHaveBeenCalledOnce()
  },
}

/** Fourteen annotations stay one row that scrolls sideways. */
export const Long: Story = {
  args: { annotations: fourteen },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('14 annotations')).toBeVisible()
    const list = canvas.getByRole('list', { name: 'Responding to' })
    await expect(list.scrollWidth).toBeGreaterThan(list.clientWidth)
    await expect(canvas.getAllByRole('listitem')).toHaveLength(14)
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

export const ExpandedDark: Story = {
  ...Expanded,
  name: 'Expanded, dark',
  globals: { theme: 'dark' },
}
