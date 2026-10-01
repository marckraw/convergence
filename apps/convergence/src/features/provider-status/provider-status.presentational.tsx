import { ProviderIcon } from '@/shared/ui/provider-icon.presentational'
import type { FC, ReactElement, ReactNode } from 'react'
import type {
  ProviderRuntimeInfo,
  ProviderStatusInfo,
} from '@/entities/session'
import {
  Badge,
  Button,
  Card,
  cn,
  CodeBlock,
  DescriptionItem,
  DescriptionList,
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  EmptyState,
  focusRingInset,
  Notice,
  SectionLabel,
  sectionLabel,
  type Tone,
} from '@convergence/ui'
import {
  Bot,
  CircleAlert,
  CircleCheck,
  KeyRound,
  RefreshCw,
  Terminal,
  Wrench,
} from 'lucide-react'
import {
  describeProviderAccountStatus,
  summariseProviderAccountHealth,
  type ProviderAccount,
  type ProviderAccountHealth,
} from '@/entities/provider-account'

interface ProviderStatusDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  trigger: ReactElement
  statuses: ProviderStatusInfo[]
  runtimeInfo: ProviderRuntimeInfo | null
  providerAccounts: ProviderAccount[]
  providerAccountHealth: ProviderAccountHealth | null
  isLoading: boolean
  updatingProviderId: string | null
  error: string | null
  message: string | null
  onRefresh: () => void
  onUpdateProvider: (providerId: string) => void
}

/** The badges' print: today's uppercase small caps, on Badge's box. */
const badgeWords = 'font-medium uppercase tracking-eyebrow'

/** A term in the provider's facts: the eyebrow look, over its value. */
const Term: FC<{ children: ReactNode }> = ({ children }) => (
  <span className={sectionLabel}>{children}</span>
)

function renderStatusBadge(provider: ProviderStatusInfo) {
  // An available provider that still carries a reason is degraded (needs
  // login, too old to report completion) — it should not read as all-clear.
  const tone: Tone =
    provider.availability === 'available' && !provider.reason
      ? 'success'
      : 'warning'

  return (
    <Badge tone={tone} className={badgeWords}>
      {provider.statusLabel}
    </Badge>
  )
}

function renderUpdateBadge(provider: ProviderStatusInfo) {
  const tone: Tone =
    provider.update.status === 'current'
      ? 'info'
      : provider.update.status === 'outdated'
        ? 'warning'
        : 'neutral'

  const label =
    provider.update.status === 'current'
      ? 'Latest'
      : provider.update.status === 'outdated'
        ? 'Update available'
        : provider.update.latestVersion
          ? 'Version unknown'
          : 'Latest unknown'

  return (
    <Badge tone={tone} className={badgeWords}>
      {label}
    </Badge>
  )
}

function renderCommand(label: string, command: string) {
  return (
    <div className="space-y-1">
      <SectionLabel className="flex items-center gap-1.5">
        <Terminal aria-hidden className="size-3.5" />
        {label}
      </SectionLabel>
      <CodeBlock label={label} maxHeight="none">
        {command}
      </CodeBlock>
    </div>
  )
}

function renderRuntimeInfo(runtimeInfo: ProviderRuntimeInfo | null) {
  if (!runtimeInfo) return null

  return (
    <Card>
      <div className="flex items-center gap-2">
        <Bot aria-hidden className="size-4 text-ink-muted" />
        <p className="text-sm font-semibold">Convergence runtime</p>
      </div>
      <DescriptionList
        density="compact"
        className="mt-2 grid gap-2 sm:grid-cols-2"
      >
        <DescriptionItem term={<Term>App version</Term>}>
          {runtimeInfo.appVersion}
        </DescriptionItem>
        <DescriptionItem term={<Term>Embedded app Node</Term>}>
          {runtimeInfo.appNodeVersion} via Electron
        </DescriptionItem>
        <DescriptionItem term={<Term>Electron</Term>}>
          {runtimeInfo.electronVersion ?? 'Unknown'}
        </DescriptionItem>
        <DescriptionItem term={<Term>Build</Term>}>
          {runtimeInfo.isPackaged ? 'Packaged' : 'Development'} ·{' '}
          {runtimeInfo.platform}/{runtimeInfo.arch}
        </DescriptionItem>
      </DescriptionList>
      <p className="mt-3 text-xs text-ink-muted">
        Provider CLIs run outside Electron with the Node/npm prefix that owns
        the detected binary below.
      </p>
    </Card>
  )
}

function renderProviderRow(
  provider: ProviderStatusInfo,
  updatingProviderId: string | null,
  onUpdateProvider: (providerId: string) => void,
) {
  const showInstallCommand = provider.availability === 'unavailable'
  const showUpdateCommand =
    provider.availability === 'available' &&
    provider.update.status === 'outdated'
  const isUpdating = updatingProviderId === provider.id
  const isAnyProviderUpdating = updatingProviderId !== null
  const canSelfUpdate = provider.update.updateCapability === 'automatic'
  const updateCommand =
    provider.update.automaticUpdateCommand ??
    provider.update.manualUpdateCommand

  return (
    <Card key={provider.id}>
      <div className="flex items-center gap-2">
        {provider.availability === 'available' ? (
          <CircleCheck aria-hidden className="size-4 text-success-ink" />
        ) : (
          <CircleAlert aria-hidden className="size-4 text-warning-ink" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <ProviderIcon
              providerId={provider.id}
              vendorLabel={provider.vendorLabel}
              name={provider.name}
            />
            <p className="truncate text-sm font-semibold">{provider.name}</p>
            <span className="text-xs text-ink-muted">
              {provider.vendorLabel}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {renderUpdateBadge(provider)}
          {renderStatusBadge(provider)}
        </div>
      </div>

      <div className="mt-2 rounded-md border border-line-soft bg-canvas/40 px-2.5 py-2 text-xs text-ink-muted">
        {provider.binaryPath ? (
          <div className="space-y-2">
            {provider.reason && (
              <p className="text-warning-ink">{provider.reason}</p>
            )}
            <DescriptionList density="compact" className="gap-2">
              {provider.version && (
                <DescriptionItem term={<Term>Version</Term>}>
                  {provider.version}
                </DescriptionItem>
              )}
              <DescriptionItem term={<Term>Latest</Term>}>
                {provider.update.latestVersion ??
                  (provider.update.checkError
                    ? `Unable to check: ${provider.update.checkError}`
                    : 'Unknown')}
              </DescriptionItem>
            </DescriptionList>
            {showUpdateCommand && (
              <div className="space-y-2">
                {renderCommand('Update command', updateCommand)}
                {canSelfUpdate ? (
                  <Button
                    variant="secondary"
                    onClick={() => onUpdateProvider(provider.id)}
                    disabled={isAnyProviderUpdating}
                    pending={isUpdating}
                    pendingLabel="Updating…"
                  >
                    <RefreshCw aria-hidden />
                    Update
                  </Button>
                ) : (
                  <p className="text-xs text-ink-muted">
                    Automatic update is unavailable for this install. Run the
                    command above in a terminal.
                  </p>
                )}
              </div>
            )}
            <DescriptionList density="compact" className="gap-2">
              <DescriptionItem
                term={
                  <Term>
                    <span className="inline-flex items-center gap-1.5">
                      <Wrench aria-hidden className="size-3.5" />
                      CLI binary path
                    </span>
                  </Term>
                }
              >
                {provider.binaryPath}
              </DescriptionItem>
              {provider.install && (
                <>
                  <DescriptionItem term={<Term>Install manager</Term>}>
                    {formatInstallManager(provider.install.manager)}
                  </DescriptionItem>
                  <DescriptionItem term={<Term>CLI Node</Term>}>
                    {provider.install.nodeVersion ?? 'Unknown'} ·{' '}
                    {provider.install.nodePath ?? 'Node path unknown'}
                  </DescriptionItem>
                  {provider.install.manager === 'npm' &&
                    provider.install.prefixDirectory && (
                      <DescriptionItem term={<Term>Global npm prefix</Term>}>
                        {provider.install.prefixDirectory}
                        <span className="mt-1 block text-2xs text-ink-muted">
                          Updates run in this prefix. To move a provider to
                          another Node version, make that Node your default and
                          reinstall the CLI there.
                        </span>
                      </DescriptionItem>
                    )}
                  {provider.install.manager === 'homebrew' && (
                    <DescriptionItem term={<Term>Homebrew prefix</Term>}>
                      {provider.install.brewPrefix ?? 'Unknown'}
                    </DescriptionItem>
                  )}
                </>
              )}
            </DescriptionList>
          </div>
        ) : (
          <div className="space-y-2">
            <p>{provider.reason ?? 'Provider binary is unavailable.'}</p>
            {provider.update.latestVersion && (
              <p>Latest version: {provider.update.latestVersion}</p>
            )}
            {showInstallCommand &&
              renderCommand('Install command', provider.update.installCommand)}
          </div>
        )}
      </div>
    </Card>
  )
}

function formatInstallManager(
  manager: NonNullable<ProviderStatusInfo['install']>['manager'],
) {
  switch (manager) {
    case 'npm':
      return 'npm global install'
    case 'homebrew':
      return 'Homebrew'
    case 'self':
      return 'Provider-managed install'
    case 'unknown':
      return 'Unknown'
  }
}

/**
 * Provider accounts (ADR 0007). An account is identity and entitlements rather
 * than an anonymous slot, so each row leads with the email and organization
 * that actually served the turns. Read-only here — enrolment gets a real
 * surface in PA6.
 */
function renderProviderAccounts(
  accounts: ProviderAccount[],
  health: ProviderAccountHealth | null,
) {
  const summary = summariseProviderAccountHealth(health, accounts)

  if (accounts.length === 0 && !summary.hasSettingsOverride) return null

  return (
    <Card padding="md" className="space-y-2 py-3">
      <div className="flex items-center gap-2">
        <KeyRound aria-hidden className="size-4 text-ink-muted" />
        <p className="text-sm font-medium">
          {accounts.length} Claude account{accounts.length === 1 ? '' : 's'}
        </p>
        {health?.checkedAt && (
          <span className="text-2xs text-ink-muted">
            checked {new Date(health.checkedAt).toLocaleString()}
          </span>
        )}
      </div>

      {summary.hasSettingsOverride && (
        <Notice
          tone="warning"
          className="text-xs"
          title="Shared settings.json supplies a credential to every Claude process, so account selection has no effect until it is removed."
        />
      )}

      {accounts.map((account) => {
        const status = describeProviderAccountStatus(account.status)
        const detail = health?.accounts.find(
          (entry) => entry.accountId === account.id,
        )

        return (
          <div
            key={account.id}
            className="flex flex-col gap-1 border-t border-line-soft pt-2 first-of-type:border-t-0 first-of-type:pt-0"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm">
                {account.email ?? account.label}
                {account.isDefault && (
                  <span className="ml-2 text-2xs text-ink-muted">default</span>
                )}
              </span>
              <Badge tone={ACCOUNT_TONES[status.tone]} className={badgeWords}>
                {status.label}
              </Badge>
            </div>
            {account.orgId && (
              <span className="truncate text-2xs text-ink-muted">
                org {account.orgId}
              </span>
            )}
            {detail?.detail && (
              <span className="text-2xs text-danger-ink">{detail.detail}</span>
            )}
            {detail && detail.unknownEntries.length > 0 && (
              <span className="text-2xs text-ink-muted">
                Unrecognised entries in the account directory:{' '}
                {detail.unknownEntries.join(', ')}
              </span>
            )}
          </div>
        )
      })}
    </Card>
  )
}

/** An account's status in R1's tones: connected, needs sign-in, disabled. */
const ACCOUNT_TONES: Record<'ok' | 'warning' | 'danger', Tone> = {
  ok: 'success',
  warning: 'warning',
  danger: 'danger',
}

export const ProviderStatusDialog: FC<ProviderStatusDialogProps> = ({
  open,
  onOpenChange,
  trigger,
  statuses,
  runtimeInfo,
  providerAccounts,
  providerAccountHealth,
  isLoading,
  updatingProviderId,
  error,
  message,
  onRefresh,
  onUpdateProvider,
}) => {
  const availableCount = statuses.filter(
    (provider) => provider.availability === 'available',
  ).length

  return (
    <Dialog open={open} onOpenChange={(open) => onOpenChange(open)}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader
          actions={
            <Button
              variant="secondary"
              onClick={onRefresh}
              disabled={isLoading}
              pending={isLoading}
            >
              <RefreshCw aria-hidden />
              Refresh
            </Button>
          }
        >
          <DialogTitle>Providers</DialogTitle>
          <DialogDescription>
            Availability and update status for local AI CLIs. Convergence uses
            your shell PATH to find them, then updates each CLI in its detected
            npm install.
          </DialogDescription>
        </DialogHeader>

        {/* The body takes the focus, so a keyboard can scroll it with nothing in it to reach. */}
        <DialogBody
          tabIndex={0}
          className={cn('app-scrollbar', focusRingInset)}
        >
          {error ? (
            <Notice tone="danger" title="Couldn't check the providers">
              {error}
            </Notice>
          ) : isLoading && statuses.length === 0 ? (
            <EmptyState
              state="loading"
              variant="plain"
              title="Checking installed providers…"
            />
          ) : (
            <div className="space-y-4">
              {message && <Notice tone="success" title={message} />}

              {renderRuntimeInfo(runtimeInfo)}

              <Card padding="md" className="py-3">
                <div className="flex items-center gap-2">
                  <Bot aria-hidden className="size-4 text-ink-muted" />
                  <p className="text-sm font-medium">
                    {availableCount} of {statuses.length} provider
                    {statuses.length === 1 ? '' : 's'} available
                  </p>
                </div>
              </Card>

              {renderProviderAccounts(providerAccounts, providerAccountHealth)}

              <div className="space-y-3">
                {statuses.map((provider) =>
                  renderProviderRow(
                    provider,
                    updatingProviderId,
                    onUpdateProvider,
                  ),
                )}
              </div>
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <DialogClose render={<Button variant="secondary" />}>
            Done
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
