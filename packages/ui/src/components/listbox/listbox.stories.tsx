import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, fn, waitFor } from 'storybook/test'
import { EmptyState } from '../empty-state/empty-state'
import { SearchField } from '../search-field/search-field'
import { Listbox, ListboxGroup, ListboxOption } from './listbox'
import { listboxOptionId, listboxStep } from './listbox.pure'

type Command = { name: string; group: string; hint?: string; off?: boolean }

const COMMANDS: Command[] = [
  { name: 'Fix the sidebar overflow', group: 'Waiting on you' },
  { name: 'Safety-net stories', group: 'Recent sessions' },
  { name: 'Move the tokens', group: 'Recent sessions' },
  { name: 'emergence', group: 'Projects', hint: '~/Projects/Private' },
  {
    name: 'divergence',
    group: 'Projects',
    hint: 'Archived: open it in Finder first',
    off: true,
  },
]

type PickerProps = {
  /** Everything that can be picked, in the order shown. */
  commands: Command[]
  /** Group the rows under their headings. */
  grouped?: boolean
  onPick: (name: string) => void
}

const LIST_ID = 'commands'

/**
 * A picker as the app builds one: a SearchField that is the combobox, and the
 * Listbox it drives. The field keeps the focus: its arrows move the active
 * row (listboxStep), Enter picks it, and a click picks too.
 */
function CommandPicker({ commands, grouped = false, onPick }: PickerProps) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const matches = commands.filter((command) =>
    command.name.toLowerCase().includes(query.trim().toLowerCase()),
  )
  const pick = (command: Command | undefined) => {
    if (command && !command.off) onPick(command.name)
  }
  const option = (command: Command, index: number) => (
    <ListboxOption
      key={command.name}
      index={index}
      disabled={command.off}
      onPick={() => pick(command)}
      onHover={() => setActive(index)}
    >
      <span className="min-w-0 flex-1 truncate">{command.name}</span>
      {command.hint ? (
        <span className="shrink-0 truncate text-xs text-ink-muted">
          {command.hint}
        </span>
      ) : null}
    </ListboxOption>
  )
  const groups = [...new Set(matches.map((command) => command.group))]
  return (
    <div className="flex w-96 max-w-full flex-col gap-2 rounded-md border border-line bg-raised p-2 shadow-raised">
      <SearchField
        role="combobox"
        aria-label="Search commands"
        aria-autocomplete="list"
        aria-controls={LIST_ID}
        aria-expanded={matches.length > 0}
        aria-activedescendant={
          matches.length > 0 ? listboxOptionId(LIST_ID, active) : undefined
        }
        placeholder="Search commands"
        value={query}
        onChange={(event) => {
          setQuery(event.currentTarget.value)
          setActive(0)
        }}
        onKeyDown={(event) => {
          const next = listboxStep(active, matches.length, event)
          if (next !== undefined) setActive(next)
          else if (event.key === 'Enter') pick(matches[active])
          else return
          event.preventDefault()
        }}
      />
      {matches.length === 0 ? (
        <EmptyState
          variant="plain"
          size="compact"
          title={`No commands match “${query.trim()}”`}
        />
      ) : (
        // The list scrolls itself: as the popup a combobox controls, it needs
        // no tab stop of its own, since the field's arrows move through it.
        <Listbox
          id={LIST_ID}
          aria-label="Commands"
          active={active}
          className="max-h-60 overflow-y-auto"
        >
          {grouped
            ? groups.map((group) => (
                <ListboxGroup key={group} label={group}>
                  {matches.map((command, index) =>
                    command.group === group ? option(command, index) : null,
                  )}
                </ListboxGroup>
              ))
            : matches.map(option)}
        </Listbox>
      )}
    </div>
  )
}

const meta = {
  title: 'Components/Listbox',
  component: CommandPicker,
  args: { commands: COMMANDS, onPick: fn() },
} satisfies Meta<typeof CommandPicker>

export default meta

type Story = StoryObj<typeof meta>

/**
 * The keyboard: the arrows move the active row, which the field announces
 * (aria-activedescendant) and the row says it is (aria-selected); Enter picks
 * it, and the focus never leaves the field. Escape belongs to whatever holds
 * the picker; here the field keeps it.
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const field = canvas.getByRole('combobox', { name: 'Search commands' })
    await userEvent.click(field)
    await expect(canvas.getByRole('listbox')).toHaveAccessibleName('Commands')
    await expect(field).toHaveAttribute(
      'aria-activedescendant',
      listboxOptionId(LIST_ID, 0),
    )
    await userEvent.keyboard('{ArrowDown}')
    const second = canvas.getByRole('option', { name: 'Safety-net stories' })
    await expect(field).toHaveAttribute('aria-activedescendant', second.id)
    await expect(second).toHaveAttribute('aria-selected', 'true')
    await expect(
      canvas.getByRole('option', { name: /Fix the sidebar/ }),
    ).toHaveAttribute('aria-selected', 'false')
    await userEvent.keyboard('{ArrowUp}{ArrowUp}')
    await expect(field).toHaveAttribute(
      'aria-activedescendant',
      listboxOptionId(LIST_ID, 4),
    )
    await userEvent.keyboard('{ArrowUp}{Enter}')
    await expect(args.onPick).toHaveBeenCalledWith('emergence')
    await expect(field).toHaveFocus()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/**
 * The pointer: moving onto a row makes it the active one, and a click picks
 * it while the focus stays in the field, so the arrows go on from there.
 */
export const Pointer: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const field = canvas.getByRole('combobox', { name: 'Search commands' })
    await userEvent.click(field)
    const tokens = canvas.getByRole('option', { name: 'Move the tokens' })
    await userEvent.hover(tokens)
    await expect(tokens).toHaveAttribute('aria-selected', 'true')
    await userEvent.click(tokens)
    await expect(args.onPick).toHaveBeenCalledWith('Move the tokens')
    await expect(field).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    await expect(field).toHaveAttribute(
      'aria-activedescendant',
      listboxOptionId(LIST_ID, 3),
    )
  },
}

/** Grouped: rows under their headings, which name the groups; the rows count on across them. */
export const Grouped: Story = {
  args: { grouped: true },
  play: async ({ canvas, userEvent }) => {
    const groups = canvas.getAllByRole('group')
    await expect(groups).toHaveLength(3)
    await expect(groups[0]).toHaveAccessibleName('Waiting on you')
    await expect(groups[1]).toHaveAccessibleName('Recent sessions')
    await expect(groups[2]).toHaveAccessibleName('Projects')
    const field = canvas.getByRole('combobox', { name: 'Search commands' })
    await userEvent.click(field)
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}')
    await expect(
      canvas.getByRole('option', { name: /emergence/ }),
    ).toHaveAttribute('aria-selected', 'true')
  },
}

/** Disabled: a row that can't be picked now is announced so, and Enter and a click pass it by. */
export const Disabled: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const archived = canvas.getByRole('option', { name: /divergence/ })
    await expect(archived).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(archived)
    await userEvent.keyboard('{End}{Enter}')
    await expect(args.onPick).not.toHaveBeenCalled()
  },
}

/** Empty: nothing matches, so an EmptyState says so, and no list shows. */
export const Empty: Story = {
  play: async ({ canvas, userEvent }) => {
    const field = canvas.getByRole('combobox', { name: 'Search commands' })
    await userEvent.type(field, 'zz')
    await expect(canvas.getByText('No commands match “zz”')).toBeVisible()
    await expect(canvas.queryByRole('listbox')).toBeNull()
    await expect(field).toHaveAttribute('aria-expanded', 'false')
    await expect(field).not.toHaveAttribute('aria-activedescendant')
  },
}

/**
 * Long: a long name is cut short on its row, and a long list scrolls inside
 * its box, keeping the active row in view as the arrows move it.
 */
export const Long: Story = {
  args: {
    commands: [
      {
        name: 'Design system sweep: moving every screen onto the shared parts, one slice at a time',
        group: 'Recent sessions',
      },
      ...Array.from({ length: 20 }, (_, index) => ({
        name: `Session number ${index + 1}`,
        group: 'Recent sessions',
      })),
    ],
  },
  play: async ({ canvas, userEvent }) => {
    const [first] = canvas.getAllByRole('option')
    const name = first.querySelector('span') as HTMLElement
    await expect(name.scrollWidth).toBeGreaterThan(name.clientWidth)
    const scroller = canvas.getByRole('listbox')
    await expect(scroller.scrollHeight).toBeGreaterThan(scroller.clientHeight)
    await userEvent.click(
      canvas.getByRole('combobox', { name: 'Search commands' }),
    )
    await userEvent.keyboard('{End}')
    const last = canvas.getByRole('option', { name: 'Session number 20' })
    await waitFor(() =>
      expect(last.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        scroller.getBoundingClientRect().bottom + 1,
      ),
    )
  },
}

type Found = { title: string; words: string }

const FOUND: Found[] = [
  { title: 'diagnose', words: 'Reproduce, minimise, hypothesise, fix.' },
  {
    title: 'tdd',
    words:
      'Red, green, refactor in small steps, with a failing test before every change and the suite green between them.',
  },
  {
    title: 'ship-it',
    words: 'Commit, changeset, push, open the pull request.',
  },
]

/** A multiline Listbox: each row a name over its words, as tall as they are. */
function SkillPicker({ onPick }: { onPick: (title: string) => void }) {
  const [active, setActive] = useState(0)
  return (
    <div className="flex w-96 max-w-full flex-col gap-2 rounded-md border border-line bg-raised p-2 shadow-raised">
      <SearchField
        role="combobox"
        aria-label="Find a skill"
        aria-autocomplete="list"
        aria-controls="skills"
        aria-expanded
        aria-activedescendant={listboxOptionId('skills', active)}
        onKeyDown={(event) => {
          const next = listboxStep(active, FOUND.length, event)
          if (next !== undefined) setActive(next)
          else if (event.key === 'Enter') onPick(FOUND[active].title)
          else return
          event.preventDefault()
        }}
      />
      <Listbox id="skills" aria-label="Skills" active={active} multiline>
        {FOUND.map((item, index) => (
          <ListboxOption
            key={item.title}
            index={index}
            onPick={() => onPick(item.title)}
            onHover={() => setActive(index)}
          >
            <span className="font-medium">{item.title}</span>
            <span className="text-xs text-ink-muted">{item.words}</span>
          </ListboxOption>
        ))}
      </Listbox>
    </div>
  )
}

/** Multiline: rows as tall as their words; the arrows and Enter work from the field. */
export const Multiline: Story = {
  render: (args) => <SkillPicker onPick={args.onPick} />,
  play: async ({ args, canvas, userEvent }) => {
    const field = canvas.getByRole('combobox', { name: 'Find a skill' })
    await userEvent.click(field)
    const [first, second, third] = canvas.getAllByRole('option')
    await expect(second.getBoundingClientRect().height).toBeGreaterThan(
      third.getBoundingClientRect().height,
    )
    await userEvent.keyboard('{ArrowDown}')
    await expect(field).toHaveAttribute('aria-activedescendant', second.id)
    await expect(second).toHaveAttribute('aria-selected', 'true')
    await expect(first).toHaveAttribute('aria-selected', 'false')
    await userEvent.keyboard('{Enter}')
    await expect(args.onPick).toHaveBeenCalledWith('tdd')
  },
}

export const MultilineDark: Story = {
  ...Multiline,
  globals: { theme: 'dark' },
}
