import type { Meta, StoryObj } from '@storybook/react-vite'
import { useRef, useState, type ComponentProps } from 'react'
import { expect, fn, screen, waitFor, within } from 'storybook/test'
import { ModelPickerDialogPresentational } from './model-picker-dialog.presentational'
import type {
  ModelPickerModelItem,
  ModelPickerProviderFilter,
} from './model-picker-dialog.types'

const providers: ModelPickerProviderFilter[] = [
  {
    id: 'favorites',
    label: 'Favorites',
    name: 'Favorites',
    vendorLabel: '',
    count: 1,
    kind: 'favorites',
  },
  {
    id: 'claude-code',
    label: 'Anthropic',
    name: 'Claude Code',
    vendorLabel: 'Anthropic',
    count: 2,
    kind: 'provider',
  },
  {
    id: 'codex',
    label: 'OpenAI',
    name: 'Codex',
    vendorLabel: 'OpenAI',
    count: 1,
    kind: 'provider',
  },
  {
    id: 'antigravity',
    label: 'Google',
    name: 'Antigravity CLI',
    vendorLabel: 'Google',
    count: 1,
    kind: 'provider',
    badge: {
      label: 'ALPHA',
      title:
        'Antigravity support is early: tool visibility is post-run and provider telemetry is limited.',
    },
  },
]

const model = (
  overrides: Partial<ModelPickerModelItem> &
    Pick<ModelPickerModelItem, 'providerId' | 'modelId' | 'modelLabel'>,
): ModelPickerModelItem => ({
  value: `${overrides.providerId}:${overrides.modelId}`,
  providerName: 'Claude Code',
  providerLabel: 'Anthropic',
  selected: false,
  favorite: false,
  ...overrides,
})

const models: ModelPickerModelItem[] = [
  model({
    providerId: 'claude-code',
    modelId: 'opus',
    modelLabel: 'Claude Opus',
    modelDescription: 'Most capable, for long agentic work.',
    contextWindowTokens: 200_000,
    selected: true,
    favorite: true,
  }),
  model({
    providerId: 'claude-code',
    modelId: 'sonnet',
    modelLabel: 'Claude Sonnet',
    contextWindowTokens: 1_000_000,
  }),
  model({
    providerId: 'codex',
    providerName: 'Codex',
    providerLabel: 'OpenAI',
    modelId: 'gpt-5.4',
    modelLabel: 'GPT-5.4',
  }),
  model({
    providerId: 'antigravity',
    providerName: 'Antigravity CLI',
    providerLabel: 'Google',
    providerBadge: providers[3].badge,
    modelId: 'gemini-3.5-flash',
    modelLabel: 'Gemini 3.5 Flash',
  }),
]

/**
 * The dialog with the state its container keeps: open, the query, the
 * provider filter and the highlighted row, and a ref of its own for the
 * search field.
 */
function HeldDialog(
  props: ComponentProps<typeof ModelPickerDialogPresentational>,
) {
  const [open, setOpen] = useState(props.open)
  const [query, setQuery] = useState(props.query)
  const [providerFilterId, setProviderFilterId] = useState(
    props.providerFilterId,
  )
  const [selectedValue, setSelectedValue] = useState(props.selectedValue)
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <ModelPickerDialogPresentational
      {...props}
      open={open}
      query={query}
      providerFilterId={providerFilterId}
      selectedValue={selectedValue}
      inputRef={inputRef}
      onOpenChange={(next) => {
        setOpen(next)
        props.onOpenChange(next)
      }}
      onQueryChange={(next) => {
        setQuery(next)
        props.onQueryChange(next)
      }}
      onProviderFilterChange={(next) => {
        setProviderFilterId(next)
        props.onProviderFilterChange(next)
      }}
      onSelectedValueChange={(next) => {
        setSelectedValue(next)
        props.onSelectedValueChange(next)
      }}
    />
  )
}

/** The dialog, once it has finished opening. */
const openedDialog = async () => {
  const dialog = await screen.findByRole('dialog', { name: 'Select model' })
  await waitFor(() => expect(dialog).toBeVisible())
  return dialog
}

const meta = {
  title: 'Features/ModelPicker/ModelPickerDialog',
  component: ModelPickerDialogPresentational,
  args: {
    open: false,
    query: '',
    providerFilterId: 'all',
    selectedValue: undefined,
    value: 'Claude Opus',
    providers,
    models,
    totalModelCount: 4,
    isDisabled: false,
    triggerVariant: 'secondary',
    triggerSize: 'md',
    triggerClassName: 'px-2 text-xs',
    // Never filled: HeldDialog renders the dialog with a ref of its own.
    inputRef: { current: null },
    onOpenChange: fn(),
    onQueryChange: fn(),
    onProviderFilterChange: fn(),
    onSelectedValueChange: fn(),
    onSelect: fn(),
    onToggleFavorite: fn(),
  },
  render: (args) => <HeldDialog {...args} />,
} satisfies Meta<typeof ModelPickerDialogPresentational>

export default meta

type Story = StoryObj<typeof meta>

/** The trigger names the chosen model and opens the dialog. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const trigger = canvas.getByRole('combobox', { name: 'Claude Opus' })
    await expect(trigger).toHaveAttribute('aria-haspopup', 'dialog')
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(trigger)
    await expect(args.onOpenChange).toHaveBeenCalledWith(true)
    const dialog = await openedDialog()
    // Search takes focus as the dialog opens.
    await waitFor(() =>
      expect(
        within(dialog).getByPlaceholderText('Search models...'),
      ).toHaveFocus(),
    )
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await expect(args.onOpenChange).toHaveBeenLastCalledWith(false)
  },
}

/** Open: search, filter by provider, star a model, and pick one. */
export const Open: Story = {
  args: { open: true },
  play: async ({ args, userEvent }) => {
    const dialog = await openedDialog()
    await userEvent.type(
      within(dialog).getByPlaceholderText('Search models...'),
      'gpt',
    )
    await expect(args.onQueryChange).toHaveBeenLastCalledWith('gpt')
    const openai = within(dialog).getByRole('button', { name: /OpenAI/ })
    await expect(openai).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(openai)
    await expect(args.onProviderFilterChange).toHaveBeenCalledWith('codex')
    await expect(openai).toHaveAttribute('aria-pressed', 'true')
    // The keyboard's star is the active row's, beside the field.
    await userEvent.hover(
      within(dialog).getByRole('option', { name: /GPT-5\.4/ }),
    )
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Add GPT-5.4 to favorites' }),
    )
    await expect(args.onToggleFavorite).toHaveBeenCalledWith(models[2])
    await userEvent.click(
      within(dialog).getByRole('option', { name: /GPT-5\.4/ }),
    )
    await expect(args.onSelect).toHaveBeenCalledWith(models[2])
    await expect(within(dialog).getByText('1m context')).toBeInTheDocument()
  },
}

/** Nothing matches the search: the words stand in for the list, which isn't drawn empty. */
export const Empty: Story = {
  args: { open: true, query: 'llama', models: [] },
  play: async () => {
    const dialog = await openedDialog()
    await expect(within(dialog).getByText('No models found.')).toBeVisible()
    await expect(within(dialog).queryByRole('listbox')).toBeNull()
    await expect(
      within(dialog).getByRole('combobox', { name: 'Search models' }),
    ).toHaveAttribute('aria-expanded', 'false')
  },
}

/**
 * The keyboard: the search keeps the focus, the arrows move the active row
 * (the field names it), and Enter picks it.
 */
export const Keyboard: Story = {
  args: { open: true },
  play: async ({ args, userEvent }) => {
    const dialog = await openedDialog()
    const search = within(dialog).getByRole('combobox', {
      name: 'Search models',
    })
    await waitFor(() => expect(search).toHaveFocus())
    await expect(within(dialog).getByRole('listbox')).toHaveAccessibleName(
      'Models',
    )
    const options = within(dialog).getAllByRole('option')
    await expect(search).toHaveAttribute('aria-activedescendant', options[0].id)
    await expect(options[0]).toHaveAttribute('aria-selected', 'true')
    await userEvent.keyboard('{ArrowDown}')
    await expect(args.onSelectedValueChange).toHaveBeenLastCalledWith(
      'claude-code:sonnet',
    )
    await expect(search).toHaveAttribute('aria-activedescendant', options[1].id)
    await userEvent.keyboard('{Enter}')
    await expect(args.onSelect).toHaveBeenCalledWith(models[1])
    await expect(search).toHaveFocus()
  },
}

/** Many models: the list scrolls under a fixed search and filter. */
export const Long: Story = {
  args: {
    open: true,
    totalModelCount: 30,
    models: Array.from({ length: 30 }, (_, index) =>
      model({
        providerId: 'claude-code',
        modelId: `claude-model-${index + 1}`,
        modelLabel: `Claude model ${index + 1} with a long marketing name`,
        modelDescription:
          'A model description long enough to wrap onto two lines in the list.',
        contextWindowTokens: 200_000 + index,
      }),
    ),
  },
  play: async () => {
    const dialog = await openedDialog()
    await expect(within(dialog).getAllByRole('option')).toHaveLength(30)
  },
}

/** No provider chosen yet, or the session pins its model. */
export const Disabled: Story = {
  args: { isDisabled: true },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('combobox', { name: 'Claude Opus' }),
    ).toBeDisabled()
  },
}

export const Dark: Story = {
  ...Open,
  globals: { theme: 'dark' },
}

export const ReducedMotion: Story = {
  ...Default,
  globals: { motion: 'reduced' },
}
