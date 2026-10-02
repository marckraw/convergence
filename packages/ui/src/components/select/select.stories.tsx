import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, waitFor, within } from 'storybook/test'
import {
  arrived,
  snapshotWhileAnimating,
} from '../../../.storybook/motion-testing'
import { Field, FieldError, FieldLabel } from '../field/field'
import { Input } from '../input/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from './select'

type Model = { value: string; label: string }

type ModelSelectProps = {
  onValueChange: (value: string) => void
  disabled?: boolean
  invalid?: boolean
  /** The Claude Code models listed. */
  models: Model[]
  /** Nothing chosen yet: the placeholder shows. */
  empty?: boolean
  /** Open at first. */
  defaultOpen?: boolean
}

const codex: Model = { value: 'gpt-6.1-sol', label: 'GPT-6.1 Sol' }

/** Choosing a model, as the composer's model setting does. */
function ModelSelect({
  onValueChange,
  disabled,
  invalid,
  models,
  empty,
  defaultOpen,
}: ModelSelectProps) {
  return (
    <Select
      items={[...models, codex]}
      defaultValue={empty ? null : models[0]?.value}
      onValueChange={onValueChange}
      disabled={disabled}
      defaultOpen={defaultOpen}
    >
      <SelectTrigger
        aria-label="Model"
        aria-invalid={invalid || undefined}
        className="w-56"
      >
        <SelectValue placeholder="Choose a model" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Claude Code</SelectLabel>
          {models.map((model) => (
            <SelectItem key={model.value} value={model.value}>
              {model.label}
            </SelectItem>
          ))}
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>Codex</SelectLabel>
          <SelectItem value={codex.value}>{codex.label}</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

/** The panel the list sits in: what grows in and out. */
const panelOf = (listbox: HTMLElement): HTMLElement =>
  listbox.closest<HTMLElement>('[data-slot="select-content"]') ?? listbox

const listClosed = () =>
  waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())

const meta = {
  title: 'Primitives/Select',
  component: ModelSelect,
  args: {
    onValueChange: fn(),
    models: [
      { value: 'claude-opus-5-5', label: 'Claude Opus 5.5' },
      { value: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
    ],
  },
} satisfies Meta<typeof ModelSelect>

export default meta

type Story = StoryObj<typeof meta>

/**
 * The trigger shows the chosen label, never the raw value; a click picks,
 * and the keyboard opens it, moves with the arrows and picks with Enter.
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const trigger = canvas.getByRole('combobox', { name: 'Model' })
    await expect(trigger).toHaveTextContent('Claude Opus 5.5')
    await expect(trigger).not.toHaveTextContent('claude-opus-5-5')
    await userEvent.click(trigger)
    const listbox = await screen.findByRole('listbox')
    await arrived(panelOf(listbox))
    await userEvent.click(
      within(listbox).getByRole('option', { name: 'GPT-6.1 Sol' }),
    )
    await expect(args.onValueChange).toHaveBeenLastCalledWith(
      'gpt-6.1-sol',
      expect.anything(),
    )
    await waitFor(() => expect(trigger).toHaveTextContent('GPT-6.1 Sol'))
    await listClosed()
    await expect(trigger).toHaveFocus()

    await userEvent.keyboard('{ArrowDown}')
    const again = await screen.findByRole('listbox')
    await waitFor(() =>
      expect(
        within(again).getByRole('option', { name: 'GPT-6.1 Sol' }),
      ).toHaveFocus(),
    )
    await userEvent.keyboard('{ArrowUp}{Enter}')
    await expect(args.onValueChange).toHaveBeenLastCalledWith(
      'claude-sonnet-5-5',
      expect.anything(),
    )
    await waitFor(() => expect(trigger).toHaveTextContent('Claude Sonnet 5.5'))
    await listClosed()
    await expect(trigger).toHaveFocus()
  },
}

/** Escape and a press outside close it and keep the choice. */
export const Dismiss: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const trigger = canvas.getByRole('combobox', { name: 'Model' })
    await userEvent.click(trigger)
    await arrived(panelOf(await screen.findByRole('listbox')))
    await userEvent.keyboard('{Escape}')
    await listClosed()
    await expect(trigger).toHaveFocus()
    await userEvent.click(trigger)
    await arrived(panelOf(await screen.findByRole('listbox')))
    await userEvent.click(document.body)
    await listClosed()
    await expect(trigger).toHaveTextContent('Claude Opus 5.5')
    await expect(args.onValueChange).not.toHaveBeenCalled()
  },
}

/** Empty: nothing chosen yet, and the placeholder says what to do. */
export const Empty: Story = {
  args: { empty: true },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('combobox', { name: 'Model' }),
    ).toHaveTextContent('Choose a model')
  },
}

/** Long: a long list scrolls inside the window. */
export const Long: Story = {
  args: {
    models: Array.from({ length: 40 }, (_, index) => ({
      value: `claude-${index + 1}`,
      label: `Claude model ${index + 1}`,
    })),
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('combobox', { name: 'Model' }))
    const panel = panelOf(await screen.findByRole('listbox'))
    await arrived(panel)
    const box = panel.getBoundingClientRect()
    await expect(box.top).toBeGreaterThanOrEqual(0)
    await expect(box.bottom).toBeLessThanOrEqual(window.innerHeight)
    await userEvent.keyboard('{Escape}')
    await listClosed()
  },
}

/** Disabled: it can't be opened, and the keyboard passes it by. */
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvas, userEvent }) => {
    const trigger = canvas.getByRole('combobox', { name: 'Model' })
    await expect(trigger).toHaveAttribute('data-disabled')
    await userEvent.tab()
    await expect(trigger).not.toHaveFocus()
  },
}

/** Invalid: the trigger says so, to assistive tech and in the danger border. */
export const Invalid: Story = {
  args: { invalid: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('combobox', { name: 'Model' })).toBeInvalid()
  },
}

/**
 * In an invalid Field (DS-15): the Field's label names the trigger, its
 * error describes it, and its border turns the danger colour an invalid
 * Input's does, from the same frame.
 */
export const InvalidInField: Story = {
  render: (args) => (
    <div className="flex w-56 flex-col gap-4">
      <Field invalid>
        <FieldLabel>Branch name</FieldLabel>
        <Input defaultValue="feature fields" />
        <FieldError match>Branch names have no spaces.</FieldError>
      </Field>
      <Field invalid>
        <FieldLabel nativeLabel={false} render={<div />}>
          Model
        </FieldLabel>
        <Select items={args.models} defaultValue={args.models[0]?.value}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {args.models.map((model) => (
              <SelectItem key={model.value} value={model.value}>
                {model.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldError match>Pick a model this account can run.</FieldError>
      </Field>
    </div>
  ),
  play: async ({ canvas }) => {
    const trigger = canvas.getByRole('combobox', { name: 'Model' })
    await expect(trigger).toHaveAttribute('data-invalid')
    await expect(trigger).toHaveAccessibleDescription(
      'Pick a model this account can run.',
    )
    const input = canvas.getByRole('textbox', { name: 'Branch name' })
    await expect(getComputedStyle(trigger).borderTopColor).toBe(
      getComputedStyle(input).borderTopColor,
    )
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

const efforts = [
  { value: 'low', label: 'Low', description: 'Answers sooner, thinks less.' },
  { value: 'medium', label: 'Medium' },
  {
    value: 'max',
    label: 'Max',
    description: "This account's plan doesn't offer Max on this model.",
    disabled: true,
  },
]

/**
 * In a toolbar (ruling 12): the composer's provider and effort. A ghost
 * Button of its size (28 px here), named by what it picks and showing its
 * value; each choice may carry a line under it, and an unavailable one says
 * why, in full.
 */
export const Toolbar: Story = {
  render: (args) => (
    <div className="flex items-center gap-1 rounded-xl border border-line bg-surface p-3">
      <Select
        items={efforts}
        defaultValue="medium"
        onValueChange={args.onValueChange}
      >
        <SelectTrigger
          variant="ghost"
          size="sm"
          aria-label="Reasoning effort"
          className="text-ink-muted hover:text-ink"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {efforts.map((effort) => (
            <SelectItem
              key={effort.value}
              value={effort.value}
              description={effort.description}
              disabled={effort.disabled}
            >
              {effort.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  ),
  play: async ({ args, canvas, userEvent }) => {
    const trigger = canvas.getByRole('combobox', { name: 'Reasoning effort' })
    await expect(trigger).toHaveTextContent('Medium')
    await expect(trigger).toHaveAttribute('data-variant', 'ghost')
    await expect(trigger.getBoundingClientRect().height).toBe(28)
    // A ghost Button has no edge of its own, unlike the field frame.
    await expect(getComputedStyle(trigger).borderTopWidth).toBe('0px')
    // The keyboard reaches it and it rings, as a Button does.
    await userEvent.tab()
    await expect(trigger).toHaveFocus()
    await expect(getComputedStyle(trigger).outlineStyle).toBe('solid')

    await userEvent.click(trigger)
    const listbox = await screen.findByRole('listbox')
    await arrived(panelOf(listbox))
    const max = within(listbox).getByRole('option', { name: /Max/ })
    await expect(max).toHaveAttribute('aria-disabled', 'true')
    await expect(max).toHaveTextContent(/doesn't offer Max/)
    const low = within(listbox).getByRole('option', { name: /Low/ })
    await expect(low).toHaveTextContent('Answers sooner, thinks less.')
    await userEvent.click(low)
    await expect(args.onValueChange).toHaveBeenLastCalledWith(
      'low',
      expect.anything(),
    )
    // The trigger shows the choice's words, not its line.
    await waitFor(() => expect(trigger).toHaveTextContent('Low'))
    await expect(trigger).not.toHaveTextContent('Answers sooner')
    await listClosed()
  },
}

export const ToolbarDark: Story = {
  ...Toolbar,
  globals: { theme: 'dark' },
}

/** Reduced motion: dropped below its trigger it fades in, without the grow or the travel. */
export const ReducedMotion: Story = {
  globals: { motion: 'reduced' },
  render: (args) => (
    <Select items={args.models} defaultValue={args.models[0]?.value}>
      <SelectTrigger aria-label="Model" className="w-56">
        <SelectValue />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        {args.models.map((model) => (
          <SelectItem key={model.value} value={model.value}>
            {model.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('combobox', { name: 'Model' }))
    const panel = panelOf(await screen.findByRole('listbox'))
    const opening = await snapshotWhileAnimating(panel, 'opacity')
    await expect(opening.opacity).toBeLessThan(1)
    await expect(opening.scale).toBe(1)
    await expect(opening.shiftY).toBe(0)
    await arrived(panel)
  },
}
