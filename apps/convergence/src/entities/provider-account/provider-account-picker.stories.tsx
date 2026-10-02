import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, waitFor } from 'storybook/test'
import type { ProviderAccount } from './provider-account.types'
import { ProviderAccountPicker } from './provider-account-picker.presentational'

const account = (
  overrides: Partial<ProviderAccount> & Pick<ProviderAccount, 'id' | 'label'>,
): ProviderAccount => ({
  providerId: 'claude-code',
  authKind: 'subscription-oauth',
  email: null,
  orgId: null,
  plan: 'max',
  configDir: `/Users/marcin/.convergence/accounts/${overrides.id}`,
  credentialDir: `/Users/marcin/.convergence/accounts/${overrides.id}/credentials`,
  executionHostId: 'local',
  isDefault: false,
  status: 'connected',
  lastValidatedAt: '2026-09-30T08:00:00.000Z',
  createdAt: '2026-08-01T08:00:00.000Z',
  updatedAt: '2026-09-30T08:00:00.000Z',
  ...overrides,
})

const accounts: ProviderAccount[] = [
  account({
    id: 'work',
    label: 'Work',
    email: 'marcin@work.example',
    orgId: 'acme-engineering',
    isDefault: true,
  }),
  account({ id: 'personal', label: 'Personal', email: 'marcin@home.example' }),
  account({
    id: 'old',
    label: 'Old team',
    email: 'marcin@old-team.example',
    status: 'expired',
  }),
]

const meta = {
  title: 'Entities/Provider account/Provider account picker',
  component: ProviderAccountPicker,
  args: {
    accounts,
    selectedAccountId: 'work',
    providerName: 'Claude Code',
    onChange: fn(),
    onManageAccounts: fn(),
  },
} satisfies Meta<typeof ProviderAccountPicker>

export default meta

type Story = StoryObj<typeof meta>

/**
 * Which account serves the next turn: the machine's own login first, then
 * every enrolled account by who it is, and a way to manage them.
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const trigger = canvas.getByRole('combobox', {
      name: 'marcin@work.example',
    })
    await userEvent.click(trigger)
    const ambient = await screen.findByRole('option', {
      name: /Default account/,
    })
    await waitFor(() => expect(ambient).toBeVisible())
    // An expired account is listed, and cannot serve a turn.
    await expect(
      screen.getByRole('option', { name: /marcin@old-team\.example/ }),
    ).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(
      screen.getByRole('option', { name: /marcin@home\.example/ }),
    )
    await expect(args.onChange).toHaveBeenCalledWith('personal')
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** The default account is the one this machine was already signed in with. */
export const AmbientDefault: Story = {
  args: { selectedAccountId: null },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole('combobox', { name: 'Default account' }),
    )
    await userEvent.click(
      await screen.findByRole('button', { name: 'Manage accounts…' }),
    )
    await expect(args.onManageAccounts).toHaveBeenCalledOnce()
  },
}

/** What the picker is for, in our tooltip on the trigger (R2), never a native title. */
export const Help: Story = {
  args: {
    help: 'Accounts belong to organisations: a swap can change what answers.',
  },
  play: async ({ canvas, userEvent }) => {
    const trigger = canvas.getByRole('combobox', {
      name: 'marcin@work.example',
    })
    await expect(trigger.closest('[title]')).toBeNull()
    await userEvent.hover(trigger)
    await expect(
      await screen.findByRole('tooltip', {}, { timeout: 2000 }),
    ).toHaveTextContent('a swap can change what answers')
  },
}

/** Locked while a turn is in flight: the swap applies to the next one. */
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('combobox', { name: 'marcin@work.example' }),
    ).toBeDisabled()
  },
}

/** No accounts and nowhere to manage them (a remote machine): no picker. */
export const Empty: Story = {
  args: { accounts: [], onManageAccounts: undefined },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('combobox')).toBeNull()
  },
}

/** Many accounts with long addresses scroll inside the list. */
export const Long: Story = {
  args: {
    accounts: Array.from({ length: 14 }, (_, index) =>
      account({
        id: `account-${index}`,
        label: `Account ${index + 1}`,
        email: `marcin.krawczyk+client-number-${index + 1}@a-rather-long-organisation-domain.example`,
        orgId: `organisation-${index + 1}`,
      }),
    ),
    selectedAccountId: 'account-0',
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('combobox'))
    const listbox = await screen.findByRole('listbox')
    await expect(listbox.scrollHeight).toBeGreaterThan(listbox.clientHeight)
  },
}
