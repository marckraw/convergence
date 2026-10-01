import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, within } from 'storybook/test'
import { loomIssueDetail } from './loom-detail.pure'
import { loomHorses } from './loom-horses.pure'
import { LoomOutsideGroupView } from './loom-outside.presentational'
import { loomOutsideView } from './loom-outside.pure'
import { loomSearchNowhereLine, loomSearchSummary } from './loom-search.pure'
import { loomSheets } from './loom-sheets.pure'
import { LoomStackView } from './loom-stack.presentational'
import type { LoomSheetDetail } from './loom-stack.types'
import { boundCrewWith, crewMember, ledgerEntry } from './wave-rows.fixture'

/**
 * The board's clock, fixed (MAR-3619): Before is a window over it and Plan
 * ages its groundings against its day, so a story on the real clock would
 * age out of its own fixture.
 */
const NOW = Date.parse('2026-09-17T12:10:00.000Z')
const AT = '2026-09-17T12:00:00.000Z'

/**
 * Two horse seats as recipes. A resident seat's card asks the main process
 * which account its next turn runs on; a recipe has no conversation to ask
 * about, so the Now sheet renders here without reaching for Electron. The
 * resident card has its own stories (LoomHorse).
 */
const crew = boundCrewWith('crew-1', 'convergence development', [
  crewMember({ role: 'mastermind', batonName: 'fable' }),
  crewMember({ batonName: 'opus-mac', hostPolicy: 'local' }),
  crewMember({ batonName: 'sonnet-mac', hostPolicy: 'local' }),
])

const rows = [
  ledgerEntry({
    issueIdentifier: 'MAR-3180',
    issueTitle: 'Loom: the four sheets replace the Waves rail',
    state: 'done',
    trackerStatus: 'Done',
    wave: 'loom-p1',
  }),
  ledgerEntry({
    issueIdentifier: 'MAR-3181',
    issueTitle: 'Loom: compact and expanded share one stack',
    state: 'done',
    trackerStatus: 'Done',
    wave: 'loom-p1',
  }),
  ledgerEntry({
    issueIdentifier: 'MAR-3190',
    issueTitle: 'Loom: the label facts reach the ledger',
    state: 'done',
    trackerStatus: 'Done',
  }),
  ledgerEntry({
    issueIdentifier: 'MAR-3195',
    issueTitle: 'Loom: read an issue in place',
    state: 'working',
    seat: 'opus-mac',
  }),
  ...[3191, 3192, 3193, 3194].map((n) =>
    ledgerEntry({
      issueIdentifier: `MAR-${n}`,
      issueTitle: `Loom: reviewed slice ${n}`,
      state: 'reviewed',
      trackerStatus: 'In Review',
    }),
  ),
  ledgerEntry({
    issueIdentifier: 'MAR-3196',
    issueTitle: 'Loom: a returned lap waits for the verdict',
    state: 'returned',
    trackerStatus: 'In Progress',
    lap: 2,
  }),
  ledgerEntry({
    issueIdentifier: 'MAR-3197',
    issueTitle: 'Loom: should a blocked label stop auto-dispatch?',
    state: 'working',
    blocked: true,
    seat: 'sonnet-mac',
  }),
  ledgerEntry({
    issueIdentifier: 'MAR-3201',
    issueTitle: 'Learn Loom: the guide opens from the footer',
    state: 'assigned',
    trackerStatus: 'Todo',
    seat: 'opus-mac',
    fact: {
      logicalStatus: 'todo',
      branchName: null,
      updatedAt: null,
      groomed: true,
      grounded: true,
      dispatch: true,
    },
  }),
  ledgerEntry({
    issueIdentifier: 'MAR-3210',
    issueTitle: 'Loom: search every sheet at once',
    state: 'assigned',
    trackerStatus: 'Backlog',
    seat: null,
    fact: {
      logicalStatus: 'backlog',
      branchName: null,
      updatedAt: null,
      groomMe: true,
    },
  }),
]

const sheets = loomSheets(rows, NOW)
const horses = loomHorses({
  crews: [crew],
  sessionsById: new Map(),
  sheets,
  hostLabelOf: (id) => (id === 'local' ? 'This Mac' : id),
})

const field = {
  value: '',
  onChange: fn(),
  onClear: fn(),
  onApply: fn(),
  revealed: false,
  onToggleReveal: fn(),
  onShortcut: fn(),
}

const detail: LoomSheetDetail = {
  view: loomIssueDetail({
    row: sheets.now.inFlight[0]!,
    opening: { openable: false, reason: 'conversation not loaded' },
    horse: horses[0] ?? null,
    lastOkAt: AT,
    now: NOW,
  }),
  onClose: fn(),
  onOpenConversation: fn(),
}

/**
 * Loom's row words fail contrast today: the amber action words on the light
 * paper, the muted status chips and closed titles on the dark one, the
 * emerald Done chip on light. Only the stories that draw those rows.
 */
const lowContrastRows = {
  a11y: {
    config: {
      // a11y-known: Loom row action words, status chips and closed sheet titles miss 4.5:1 (color-contrast) — fixed by the sweep (DS4)
      rules: [{ id: 'color-contrast', enabled: false }],
    },
  },
}

const meta = {
  title: 'Features/Waves/LoomStack',
  component: LoomStackView,
  args: {
    sheets,
    now: NOW,
    horses,
    qaExpanded: false,
    onToggleQa: fn(),
    onOpenSeat: fn(),
    onShowNext: fn(),
    onShowDetail: fn(),
    header: { kind: 'live', text: null },
    subline: { text: 'convergence development', picker: null },
    field,
    search: null,
    open: 'now',
    onSelectSheet: fn(),
    inertReason: () => null,
    onOpen: fn(),
    onOpenGuide: fn(),
  },
  decorators: [
    (Story, { args }) => (
      <div
        className={
          args.wide ? 'flex h-160 w-275 flex-col' : 'flex h-190 w-85 flex-col'
        }
      >
        <Story />
      </div>
    ),
  ],
  parameters: { layout: 'padded' },
  beforeEach: () => {
    const realNow = Date.now
    Date.now = () => NOW
    return () => {
      Date.now = realNow
    }
  },
} satisfies Meta<typeof LoomStackView>

export default meta

type Story = StoryObj<typeof meta>

/**
 * Now, open: the horses, then Awaiting QA (three of four, with its own
 * reveal), Fable's turn, Decide and what is in flight. The other three sheets
 * are titles, each a button that opens its sheet.
 */
export const Default: Story = {
  parameters: lowContrastRows,
  play: async ({ args, canvas, userEvent }) => {
    const now = canvas.getByRole('button', {
      name: 'Now · 3 open · 4 awaiting QA',
    })
    await expect(now).toHaveAttribute('aria-expanded', 'true')
    await expect(now).toHaveAttribute('aria-controls', 'loom-sheet-now')
    const next = canvas.getByRole('button', { name: /^Next · / })
    await expect(next).toHaveAttribute('aria-expanded', 'false')
    await expect(
      canvas.getByRole('region', { name: 'Horses' }),
    ).toHaveTextContent('opus-mac')
    const qa = canvas.getByRole('region', { name: 'Awaiting QA' })
    await expect(
      within(qa).getAllByRole('button', { name: /MAR-/ }),
    ).toHaveLength(3)
    const reveal = within(qa).getByRole('button', {
      name: 'Show all 4 awaiting QA',
    })
    await expect(reveal).toHaveAttribute('aria-expanded', 'false')
    await expect(reveal).toHaveAttribute('aria-controls', 'loom-awaiting-qa')
    await userEvent.click(reveal)
    await expect(args.onToggleQa).toHaveBeenCalledOnce()
    await expect(
      canvas.getByRole('region', { name: 'Decide' }),
    ).toHaveTextContent('MAR-3197')
    await userEvent.click(next)
    await expect(args.onSelectSheet).toHaveBeenCalledWith('next')
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** Awaiting QA revealed: every row, and the control says it shows fewer. */
export const Long: Story = {
  parameters: lowContrastRows,
  args: { qaExpanded: true },
  play: async ({ canvas }) => {
    const qa = canvas.getByRole('region', { name: 'Awaiting QA' })
    await expect(
      within(qa).getAllByRole('button', { name: /MAR-/ }),
    ).toHaveLength(4)
    await expect(
      within(qa).getByRole('button', { name: 'Show fewer' }),
    ).toHaveAttribute('aria-expanded', 'true')
  },
}

/** Before: grouped by wave, newest first, only the newest open. */
export const Before: Story = {
  parameters: lowContrastRows,
  args: { open: 'before' },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('button', { name: 'Before · 3 done' }),
    ).toHaveAttribute('aria-expanded', 'true')
    await expect(canvas.getAllByRole('group')).toHaveLength(2)
  },
}

/** Next: the queue per horse, each saying what that horse is doing now. */
export const Next: Story = {
  parameters: lowContrastRows,
  args: { open: 'next' },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('button', { name: /^Next · / }),
    ).toHaveAttribute('aria-expanded', 'true')
    await expect(canvas.getByRole('button', { name: /MAR-3201/ })).toBeVisible()
  },
}

/** Plan: the stages of preparation, then "Not in the loop", folded. */
export const Plan: Story = {
  parameters: lowContrastRows,
  args: {
    open: 'plan',
    outside: (
      <LoomOutsideGroupView
        view={loomOutsideView({
          crewId: 'crew-1',
          readAt: AT,
          more: false,
          issues: [
            {
              id: 'issue-3300',
              identifier: 'MAR-3300',
              title: 'Settings: one search across every pane',
              url: 'https://linear.app/example/issue/mar-3300',
              status: 'Backlog',
              priority: null,
              labels: [],
              updatedAt: AT,
            },
          ],
        })}
        open={false}
        onToggle={fn()}
      />
    ),
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('button', { name: /^Plan · / }),
    ).toHaveAttribute('aria-expanded', 'true')
    await expect(canvas.getByRole('button', { name: /MAR-3210/ })).toBeVisible()
    await expect(
      canvas.getByRole('button', { name: 'Not in the loop · 1' }),
    ).toHaveAttribute('aria-expanded', 'false')
  },
}

/** Expanded's shape: the same sheets side by side, the open one widest. */
export const Wide: Story = {
  parameters: lowContrastRows,
  args: { wide: true },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('button', { name: 'Now · 3 open · 4 awaiting QA' }),
    ).toHaveAttribute('aria-expanded', 'true')
    // Wide says what each group of Now is for.
    await expect(canvas.getByText('QA and say done, by name')).toBeVisible()
  },
}

export const WideDark: Story = {
  ...Wide,
  globals: { theme: 'dark' },
}

/** An issue read in place: the detail takes the sheet's body; Close leaves it. */
export const Detail: Story = {
  args: { detail },
  play: async ({ canvas, userEvent }) => {
    await expect(
      canvas.getByRole('heading', { name: detail.view.title }),
    ).toBeVisible()
    await expect(
      canvas.getByRole('link', { name: /Open issue in Linear/ }),
    ).toHaveAttribute('href', detail.view.url)
    await userEvent.click(
      canvas.getByRole('button', { name: 'Close the issue detail' }),
    )
    await expect(detail.onClose).toHaveBeenCalledOnce()
  },
}

/** A search with no match in the open sheet names where the matches are. */
export const Search: Story = {
  args: {
    search: {
      summary: loomSearchSummary({
        sheets: loomSheets(
          rows.filter((entry) => entry.issueIdentifier === 'MAR-3210'),
          NOW,
        ),
        outside: null,
        query: 'search',
        open: 'now',
      }),
      nowhere: '',
      shownHorses: [],
    },
  },
  play: async ({ args, canvas, userEvent }) => {
    await expect(canvas.getByText(/No match in Now/)).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: '1 in Plan' }))
    await expect(args.onSelectSheet).toHaveBeenCalledWith('plan')
  },
}

/** A search that matches nothing anywhere says so in one sentence. */
export const Empty: Story = {
  args: {
    search: {
      summary: loomSearchSummary({
        sheets: loomSheets([], NOW),
        outside: null,
        query: 'zebra',
        open: 'now',
      }),
      nowhere: loomSearchNowhereLine({
        query: 'zebra',
        crewName: 'convergence development',
        outsideReadAt: null,
        now: NOW,
        severalCrews: false,
      }),
      shownHorses: [],
    },
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText(
        /No issue matches "zebra" in convergence development's Loom/,
      ),
    ).toBeVisible()
  },
}

/** A crew with nothing on the tracker yet: every sheet says it is empty. */
export const Quiet: Story = {
  args: { sheets: loomSheets([], NOW), horses: [] },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('button', { name: 'Now · 0 open · 0 awaiting QA' }),
    ).toBeVisible()
    await expect(canvas.getByText('Nothing in Now right now.')).toBeVisible()
  },
}
