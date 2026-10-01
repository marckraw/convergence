import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { Timestamp } from './timestamp'

const now = new Date('2026-10-01T12:00:00Z')
const fourMinutesAgo = '2026-10-01T11:56:00Z'
const lastYear = '2025-09-30T14:00:00Z'

/** One moment in each form, as a panel's facts would write them. */
function Moments() {
  const row = 'flex justify-between gap-6'
  return (
    <dl className="flex w-72 flex-col gap-1 rounded-md bg-canvas p-4 text-xs text-ink">
      <div className={row}>
        <dt className="text-ink-muted">relative</dt>
        <dd>
          <Timestamp date={fourMinutesAgo} now={now} locale="en-US" />
        </dd>
      </div>
      <div className={row}>
        <dt className="text-ink-muted">clock</dt>
        <dd>
          <Timestamp
            date={fourMinutesAgo}
            format="clock"
            locale="en-US"
            timeZone="UTC"
          />
        </dd>
      </div>
      <div className={row}>
        <dt className="text-ink-muted">date</dt>
        <dd>
          <Timestamp
            date={lastYear}
            format="date"
            now={now}
            locale="en-US"
            timeZone="UTC"
          />
        </dd>
      </div>
      <div className={row}>
        <dt className="text-ink-muted">datetime</dt>
        <dd>
          <Timestamp
            date={new Date('2026-09-30T14:00:00Z')}
            format="datetime"
            now={now}
            locale="en-US"
            timeZone="UTC"
          />
        </dd>
      </div>
    </dl>
  )
}

const meta = {
  title: 'Components/Timestamp',
  component: Moments,
} satisfies Meta<typeof Moments>

export default meta

type Story = StoryObj<typeof meta>

/** ICU writes a narrow no-break space before AM and PM; read it as a space. */
const plain = (text: string | null) => (text ?? '').replace(/\s/g, ' ')

/**
 * Each form, in a `<time>` whose dateTime is the exact instant, figures one
 * width.
 */
export const Default: Story = {
  play: async ({ canvas, canvasElement }) => {
    const relative = canvas.getByText('4 minutes ago')
    await expect(relative.tagName).toBe('TIME')
    await expect(relative).toHaveAttribute(
      'dateTime',
      '2026-10-01T11:56:00.000Z',
    )
    const times = [
      ...canvasElement.querySelectorAll<HTMLTimeElement>('time'),
    ].map((time) => plain(time.textContent))
    await expect(times).toEqual([
      '4 minutes ago',
      '11:56 AM',
      'Sep 30, 2025',
      'Sep 30, 2:00 PM',
    ])
    await expect(getComputedStyle(relative).fontVariantNumeric).toBe(
      'tabular-nums',
    )
    // R2: the whole date goes in our Tooltip (DS3a), never a native title.
    await expect(relative).not.toHaveAttribute('title')
  },
}

export const Dark: Story = {
  globals: { theme: 'dark' },
}
