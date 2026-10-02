import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, fn, screen, waitFor } from 'storybook/test'
import { tokenColor } from '../../../.storybook/color-testing'
import { Tooltip } from '../tooltip/tooltip'
import { Card, CardAction } from './card'

/** The three surfaces side by side, as a session panel stacks them. */
function Surfaces() {
  return (
    <div className="flex w-80 flex-col gap-3 rounded-md bg-canvas p-4 text-sm">
      <Card>
        <p className="font-medium">Inset</p>
        <p className="text-xs text-ink-muted">
          The panel&apos;s faint wash, the default.
        </p>
      </Card>
      <Card surface="raised" padding="md">
        <p className="font-medium">Raised</p>
        <p className="text-xs text-ink-muted">The full surface.</p>
      </Card>
      <Card surface="dashed">
        <p className="text-xs text-ink-muted">No pull request yet.</p>
      </Card>
      <Card tone="warning">
        <p className="font-medium text-warning-ink">Needs your approval</p>
        <p className="text-xs text-ink-muted">
          The agent wants to run a command.
        </p>
      </Card>
    </div>
  )
}

const cardOf = (element: Element) =>
  element.closest('[data-slot="card"]') as HTMLElement

const meta = {
  title: 'Components/Card',
  component: Surfaces,
} satisfies Meta<typeof Surfaces>

export default meta

type Story = StoryObj<typeof meta>

/** inset (the default), raised, dashed, and one with a tone; each rounded-lg. */
export const Default: Story = {
  play: async ({ canvas }) => {
    const inset = cardOf(canvas.getByText('Inset'))
    const raised = cardOf(canvas.getByText('Raised'))
    await expect(getComputedStyle(inset).borderTopLeftRadius).toBe('8px')
    await expect(getComputedStyle(raised).backgroundColor).toBe(
      tokenColor('--surface'),
    )
    await expect(getComputedStyle(raised).paddingTop).toBe('16px')
    await expect(getComputedStyle(inset).paddingTop).toBe('12px')
    const dashed = cardOf(canvas.getByText('No pull request yet.'))
    await expect(getComputedStyle(dashed).borderTopStyle).toBe('dashed')
    const request = cardOf(canvas.getByText('Needs your approval'))
    await expect(getComputedStyle(request).borderTopColor).toBe(
      tokenColor('--warning-line'),
    )
  },
}

export const Dark: Story = {
  globals: { theme: 'dark' },
  play: async ({ canvas }) => {
    const raised = cardOf(canvas.getByText('Raised'))
    await expect(getComputedStyle(raised).backgroundColor).toBe(
      tokenColor('--surface'),
    )
  },
}

type SessionCardProps = { onOpen: () => void; onArchive: () => void }

/** A clickable card with a second control inside it. */
function SessionCard({ onOpen, onArchive }: SessionCardProps) {
  return (
    <div className="w-80 rounded-md bg-canvas p-4">
      <Card interactive>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardAction onClick={onOpen} className="text-sm font-medium">
              Rewrite the importer
            </CardAction>
            <p className="text-xs text-ink-muted">convergence · 4 min ago</p>
          </div>
          {/* A control of its own sits above the card's hit area. */}
          <button
            type="button"
            onClick={onArchive}
            className="relative rounded-sm px-1 text-xs text-ink-muted hover:text-ink"
          >
            Archive
          </button>
        </div>
      </Card>
    </div>
  )
}

/**
 * Interactive: one tab stop for the card, Enter opens it, a click anywhere on
 * it opens it, and the ring is drawn round the whole card. A control inside
 * stays its own tab stop and does its own thing.
 */
const onOpen = fn()
const onArchive = fn()

export const Interactive: Story = {
  render: () => <SessionCard onOpen={onOpen} onArchive={onArchive} />,
  play: async ({ canvas, userEvent }) => {
    onOpen.mockClear()
    onArchive.mockClear()
    const action = canvas.getByRole('button', { name: 'Rewrite the importer' })
    await userEvent.tab()
    await expect(action).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await expect(onOpen).toHaveBeenCalledTimes(1)
    const ring = getComputedStyle(action, '::after')
    await expect(ring.outlineStyle).toBe('solid')
    // The hit area covers the card, so the pointer over its facts is over the
    // action, and a click there opens it too.
    const facts = canvas
      .getByText('convergence · 4 min ago')
      .getBoundingClientRect()
    const under = document.elementFromPoint(
      facts.left + facts.width / 2,
      facts.top + facts.height / 2,
    ) as HTMLElement
    await expect(under).toBe(action)
    await userEvent.click(under)
    await expect(onOpen).toHaveBeenCalledTimes(2)
    await userEvent.tab()
    await expect(canvas.getByRole('button', { name: 'Archive' })).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await expect(onArchive).toHaveBeenCalledTimes(1)
    await expect(onOpen).toHaveBeenCalledTimes(2)
  },
}

const ACCESS =
  'Figma: read-only · Linear: can comment on MAR-3608 and every issue under it'

/** An openable card whose lines carry tooltips of their own, under its hit area. */
function CardWithHints() {
  return (
    <div className="w-80 rounded-md bg-canvas p-4">
      <Card interactive>
        <CardAction className="text-sm font-medium">opus-mac</CardAction>
        <Tooltip label={ACCESS} when="truncated">
          <p className="truncate text-xs text-ink-muted">{ACCESS}</p>
        </Tooltip>
        <Tooltip label="Working for 4 minutes">
          <p className="w-fit text-xs text-ink-muted">Working</p>
        </Tooltip>
      </Card>
    </div>
  )
}

/** A pointer event on `target`, at the middle of `over`, as a person's would land. */
const pointerAt = (
  type: 'pointerover' | 'pointermove',
  target: Element,
  over: Element,
) => {
  const box = over.getBoundingClientRect()
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      pointerType: 'mouse',
      clientX: box.left + box.width / 2,
      clientY: box.top + box.height / 2,
    }),
  )
}

/**
 * Tooltips under the action (MC N1): the card's hit area covers its lines,
 * so the pointer over one lands on the action, and the line's own tooltip
 * still shows; moving to the next line moves it, and leaving the card puts
 * it away. A click there still opens the card.
 */
export const TooltipsUnderTheAction: Story = {
  name: 'Tooltips under the action',
  render: () => <CardWithHints />,
  play: async ({ canvas }) => {
    const action = canvas.getByRole('button', { name: 'opus-mac' })
    const access = canvas.getByText(ACCESS)
    const box = access.getBoundingClientRect()
    await expect(
      document.elementFromPoint(
        box.left + box.width / 2,
        box.top + box.height / 2,
      ),
    ).toBe(action)
    pointerAt('pointerover', action, access)
    const tooltip = await screen.findByRole('tooltip', {}, { timeout: 2000 })
    await expect(tooltip).toHaveTextContent(ACCESS)
    pointerAt('pointermove', action, canvas.getByText('Working'))
    await waitFor(() =>
      expect(tooltip).toHaveTextContent('Working for 4 minutes'),
    )
    action.dispatchEvent(
      new PointerEvent('pointerout', {
        bubbles: true,
        pointerType: 'mouse',
        relatedTarget: document.body,
      }),
    )
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull())
  },
}

/** A list of cards, one of them chosen. */
function PickOne() {
  const [chosen, setChosen] = useState('main')
  return (
    <div className="flex w-80 flex-col gap-2 rounded-md bg-canvas p-4 text-sm">
      {['main', 'release', 'hotfix'].map((branch) => (
        <Card key={branch} interactive selected={chosen === branch}>
          <CardAction onClick={() => setChosen(branch)}>{branch}</CardAction>
        </Card>
      ))}
    </div>
  )
}

/**
 * Selected (R7): the selected fill and aria-current on its action; the others
 * wash at half that strength under the pointer.
 */
export const Selected: Story = {
  render: () => <PickOne />,
  play: async ({ canvas, userEvent }) => {
    const main = canvas.getByRole('button', { name: 'main' })
    await expect(main).toHaveAttribute('aria-current', 'true')
    await expect(getComputedStyle(cardOf(main)).backgroundColor).toBe(
      tokenColor('--fill-selected'),
    )
    const release = canvas.getByRole('button', { name: 'release' })
    await userEvent.click(release)
    await expect(release).toHaveAttribute('aria-current', 'true')
    await expect(main).not.toHaveAttribute('aria-current')
  },
}

/** Long: words wrap inside the card; it never grows past its column. */
export const Long: Story = {
  render: () => (
    <div className="w-64 rounded-md bg-canvas p-4 text-sm">
      <Card>
        <p className="font-medium wrap-anywhere">
          A conversation about rewriting the importer so that it understands
          every-single-one-of-the-legacy-formats-at-once
        </p>
      </Card>
    </div>
  ),
  play: async ({ canvas }) => {
    const card = cardOf(canvas.getByText(/A conversation/))
    const column = card.parentElement as HTMLElement
    await expect(card.scrollWidth).toBeLessThanOrEqual(card.clientWidth)
    await expect(card.getBoundingClientRect().right).toBeLessThanOrEqual(
      column.getBoundingClientRect().right,
    )
  },
}
