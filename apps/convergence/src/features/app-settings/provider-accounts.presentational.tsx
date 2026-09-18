import type { ProviderAccountLoginAttempt } from '@/shared/types/provider-account-login.types'
import { ProviderAccountLoginProgress } from './provider-account-login.presentational'
import { Pencil, Plug, RefreshCw, Star, Trash2 } from 'lucide-react'
import type {
  ClaudeAccountLayout,
  ProviderAccountConnectors,
  ProviderAccountEnrollmentProvider,
  ProviderAccountSettingsRow,
  ProviderAccountSettingsWarning,
} from '@/entities/provider-account'
import { cn } from '@/shared/lib/cn.pure'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { ProviderIcon } from '@/shared/ui/provider-icon.presentational'

const STATUS_TONE: Record<
  ProviderAccountSettingsRow['status']['tone'],
  string
> = {
  ok: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  warning:
    'border-amber-400/35 bg-amber-500/12 text-amber-700 dark:text-amber-200',
  danger:
    'border-destructive/40 bg-destructive/10 text-destructive dark:text-destructive',
}

export interface ProviderAccountsFieldsProps {
  loginAttempt: ProviderAccountLoginAttempt | null
  loginCode: string
  onLoginCodeChange: (value: string) => void
  onSubmitLoginCode: () => void
  onCancelLogin: () => void
  providerId: ProviderAccountEnrollmentProvider
  rows: ProviderAccountSettingsRow[]
  settingsWarnings: ProviderAccountSettingsWarning[]
  lastCheckedAt: string | null
  claudeVersion: string | null
  isLoading: boolean
  /** The active account action; any value locks the other credential actions. */
  busyAccountId: string | null
  isEnrolling: boolean
  enrolEmail: string
  enrolLabel: string
  renamingAccountId: string | null
  renameDraft: string
  confirmingRemovalAccountId: string | null
  removalLayout: ClaudeAccountLayout | null
  privateDeletionAcknowledged: boolean
  onPrivateDeletionAcknowledged: (value: boolean) => void
  /** The account whose connectors are open, if any. */
  expandedConnectorsAccountId: string | null
  connectors: ProviderAccountConnectors | null
  isLoadingConnectors: boolean
  authorizingServerName: string | null
  message: string | null
  error: string | null
  onProviderChange: (providerId: ProviderAccountEnrollmentProvider) => void
  onEnrolEmailChange: (value: string) => void
  onEnrolLabelChange: (value: string) => void
  onEnrol: () => void
  onStartRename: (accountId: string, current: string) => void
  onRenameDraftChange: (value: string) => void
  onCommitRename: () => void
  onCancelRename: () => void
  onSetDefault: (accountId: string) => void
  onReconnect: (accountId: string) => void
  onRequestRemove: (accountId: string) => void
  onConfirmRemove: (accountId: string, deletePrivateHistory?: boolean) => void
  onCancelRemove: () => void
  onCheckHealth: () => void
  onToggleConnectors: (accountId: string) => void
  onAuthorizeConnector: (accountId: string, serverName: string) => void
  onConnectLinear: (accountId: string) => void
}

function formatCheckedAt(value: string | null): string {
  if (!value) return 'not checked yet'
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function ProviderAccountsFields({
  loginAttempt,
  loginCode,
  onLoginCodeChange,
  onSubmitLoginCode,
  onCancelLogin,
  providerId,
  rows,
  settingsWarnings,
  lastCheckedAt,
  claudeVersion,
  isLoading,
  busyAccountId,
  isEnrolling,
  enrolEmail,
  enrolLabel,
  renamingAccountId,
  renameDraft,
  confirmingRemovalAccountId,
  removalLayout,
  privateDeletionAcknowledged,
  onPrivateDeletionAcknowledged,
  expandedConnectorsAccountId,
  connectors,
  isLoadingConnectors,
  authorizingServerName,
  message,
  error,
  onProviderChange,
  onEnrolEmailChange,
  onEnrolLabelChange,
  onEnrol,
  onStartRename,
  onRenameDraftChange,
  onCommitRename,
  onCancelRename,
  onSetDefault,
  onReconnect,
  onRequestRemove,
  onConfirmRemove,
  onCancelRemove,
  onCheckHealth,
  onToggleConnectors,
  onAuthorizeConnector,
  onConnectLinear,
}: ProviderAccountsFieldsProps) {
  const isCodex = providerId === 'codex'
  const providerName = isCodex ? 'OpenAI' : 'Anthropic'
  const agentName = isCodex ? 'Codex' : 'Claude Code'
  const actionPending =
    isEnrolling || busyAccountId !== null || authorizingServerName !== null

  return (
    <div className="space-y-4 [&_button]:min-h-10">
      <div role="group" aria-label="Account provider" className="flex gap-2">
        {(
          [
            { id: 'claude-code', label: 'Anthropic' },
            { id: 'codex', label: 'OpenAI' },
          ] as const
        ).map((provider) => (
          <Button
            key={provider.id}
            type="button"
            variant={providerId === provider.id ? 'secondary' : 'ghost'}
            className="min-h-10 flex-1 gap-2"
            aria-pressed={providerId === provider.id}
            disabled={actionPending || isLoadingConnectors}
            onClick={() => onProviderChange(provider.id)}
          >
            <ProviderIcon providerId={provider.id} title="" />
            {provider.label}
          </Button>
        ))}
      </div>

      {loginAttempt ? (
        <ProviderAccountLoginProgress
          attempt={loginAttempt}
          code={loginCode}
          onCodeChange={onLoginCodeChange}
          onSubmitCode={onSubmitLoginCode}
          onCancel={onCancelLogin}
        />
      ) : null}

      {settingsWarnings.length > 0 ? (
        <div
          role="alert"
          className="space-y-2 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3"
        >
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
            Shared settings outrank account selection
          </p>
          {settingsWarnings.map((warning) => (
            <p
              key={`${warning.kind}-${warning.key}`}
              className="text-sm leading-relaxed text-amber-800/90 dark:text-amber-200/90"
            >
              {warning.message}
            </p>
          ))}
        </div>
      ) : null}

      {isLoading ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
          Loading accounts...
        </p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-5 text-sm leading-relaxed text-muted-foreground">
          No {providerName} accounts enrolled. Convergence uses the {agentName}{' '}
          login already on this Mac. Connect an account below to manage it here.
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const isBusy = actionPending
            const isRenaming = renamingAccountId === row.id
            const isConfirmingRemoval = confirmingRemovalAccountId === row.id
            const showsConnectors = expandedConnectorsAccountId === row.id

            return (
              <section
                key={row.id}
                className="space-y-3 rounded-xl border border-border bg-card/45 px-4 py-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <ProviderIcon providerId={providerId} />
                      <h4 className="break-all text-sm font-semibold">
                        {row.identity}
                      </h4>
                      {row.isDefault ? (
                        <span className="rounded border border-border bg-muted/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none text-muted-foreground">
                          default
                        </span>
                      ) : null}
                      <span
                        className={cn(
                          'rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none',
                          STATUS_TONE[row.status.tone],
                        )}
                      >
                        {row.status.label}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {row.showsLabel ? `${row.label} · ` : ''}
                      {row.organization
                        ? `${isCodex ? 'Workspace' : 'Organization'} ${row.organization}`
                        : `${isCodex ? 'Workspace' : 'Organization'} unknown`}
                      {row.plan ? ` · ${row.plan}` : ''}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={isBusy || isRenaming}
                      onClick={() => onStartRename(row.id, row.label)}
                    >
                      <Pencil className="mr-1.5 h-3.5 w-3.5" />
                      Rename
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={isBusy || !row.canSetDefault}
                      onClick={() => onSetDefault(row.id)}
                    >
                      <Star className="mr-1.5 h-3.5 w-3.5" />
                      Set default
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-expanded={showsConnectors}
                      disabled={isBusy || isLoadingConnectors}
                      onClick={() => onToggleConnectors(row.id)}
                    >
                      <Plug className="mr-1.5 h-3.5 w-3.5" />
                      Connectors
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={isBusy}
                      onClick={() => onReconnect(row.id)}
                    >
                      <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                      Reconnect
                    </Button>
                    {isConfirmingRemoval ? (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={isBusy}
                          onClick={onCancelRemove}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          disabled={
                            isBusy ||
                            (!isCodex &&
                              !!removalLayout?.privateEntries.length &&
                              !privateDeletionAcknowledged)
                          }
                          onClick={() =>
                            onConfirmRemove(
                              row.id,
                              !isCodex &&
                                !!removalLayout?.privateEntries.length &&
                                privateDeletionAcknowledged,
                            )
                          }
                        >
                          {!isCodex && removalLayout?.privateEntries.length
                            ? 'Sign out and delete private history'
                            : 'Sign out and remove'}
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={isBusy}
                        onClick={() => onRequestRemove(row.id)}
                      >
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                        Remove
                      </Button>
                    )}
                  </div>
                </div>

                {isConfirmingRemoval ? (
                  <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm leading-relaxed text-destructive">
                    <p>
                      {isCodex
                        ? 'This signs the account out of Codex and removes its local account directory. Shared native history and Convergence messages remain. Any history stored only in this account directory, including migration backups, is removed.'
                        : removalLayout?.privateEntries.length
                          ? `This account contains private history or data in ${removalLayout.privateEntries.join(', ')}. Removing it will permanently delete those copies. Convergence messages remain. Cancel to keep the account and its files.`
                          : removalLayout?.fullyShared
                            ? 'This signs the account out of Claude Code and deletes its account directories. Native conversations stay in the verified shared location. Convergence messages remain.'
                            : 'This signs the account out of Claude Code and deletes its account directories. Conversation sharing is not fully verified. Linked destinations and Convergence messages remain.'}
                    </p>
                    {!isCodex && !!removalLayout?.privateEntries.length ? (
                      <label className="mt-2 flex cursor-pointer items-start gap-2">
                        <Input
                          type="checkbox"
                          checked={privateDeletionAcknowledged}
                          disabled={isBusy}
                          onChange={(event) =>
                            onPrivateDeletionAcknowledged(event.target.checked)
                          }
                          className="mt-1 h-4 w-4 shrink-0 accent-destructive"
                        />
                        <span>
                          Delete the private files in{' '}
                          {removalLayout.privateEntries.join(', ')} — this
                          cannot be undone.
                        </span>
                      </label>
                    ) : null}
                  </div>
                ) : null}

                {isRenaming ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      aria-label={`Label for ${row.identity}`}
                      value={renameDraft}
                      disabled={isBusy}
                      className="min-w-0 flex-1"
                      onChange={(event) =>
                        onRenameDraftChange(event.target.value)
                      }
                    />
                    <Button
                      type="button"
                      size="sm"
                      disabled={isBusy || renameDraft.trim().length === 0}
                      onClick={onCommitRename}
                    >
                      Save label
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={isBusy}
                      onClick={onCancelRename}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : null}

                {showsConnectors ? (
                  <div className="space-y-2 rounded-lg border border-border/70 bg-card/40 px-3 py-3">
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      MCP tokens are stored per account, so each account
                      authorizes a connector once — and keeps it across every
                      later swap.
                    </p>
                    {isLoadingConnectors ? (
                      <p className="text-sm text-muted-foreground">
                        Asking this account what it can reach...
                      </p>
                    ) : connectors?.connectors.length === 0 &&
                      !connectors.error ? (
                      <p className="text-sm text-muted-foreground">
                        No MCP servers are configured.
                      </p>
                    ) : (
                      (connectors?.connectors ?? []).map((connector) => (
                        <div
                          key={connector.name}
                          className="flex flex-wrap items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium">
                              {connector.name}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {connector.statusLabel}
                            </p>
                          </div>
                          {connector.needsAuthorization ||
                          (isCodex && connector.status === 'ready') ? (
                            <Button
                              type="button"
                              size="sm"
                              disabled={authorizingServerName !== null}
                              onClick={() =>
                                onAuthorizeConnector(row.id, connector.name)
                              }
                            >
                              {authorizingServerName === connector.name
                                ? 'Waiting for browser...'
                                : 'Authorize'}
                            </Button>
                          ) : null}
                        </div>
                      ))
                    )}
                    {!isLoadingConnectors && connectors?.error ? (
                      <p className="text-sm text-muted-foreground">
                        {connectors.error}
                      </p>
                    ) : null}
                    {isCodex &&
                    !isLoadingConnectors &&
                    connectors &&
                    !connectors.error &&
                    !connectors.connectors.some(
                      (connector) => connector.name === 'linear',
                    ) ? (
                      <Button
                        type="button"
                        size="sm"
                        disabled={actionPending}
                        onClick={() => onConnectLinear(row.id)}
                      >
                        {authorizingServerName === 'linear'
                          ? 'Waiting for browser...'
                          : 'Connect Linear'}
                      </Button>
                    ) : null}
                  </div>
                ) : null}

                {row.statusDetail ? (
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {row.statusDetail}
                  </p>
                ) : null}

                {row.notes.map((note) => (
                  <p
                    key={note}
                    className="rounded-lg border border-dashed border-border px-3 py-2 text-xs leading-relaxed text-muted-foreground"
                  >
                    {note}
                  </p>
                ))}
              </section>
            )
          })}
        </div>
      )}

      <section className="space-y-3 rounded-xl border border-border bg-card/45 px-4 py-4">
        <div className="space-y-1">
          <h4 className="text-sm font-semibold">
            Connect an {providerName} account
          </h4>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {isCodex
              ? 'Codex opens a browser. Choose the OpenAI account and workspace you want to use; its signed-in identity and plan appear here after login.'
              : 'Claude Code opens a browser to sign in. The email prefills the login page so you can identify the account you are authorising.'}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          {!isCodex ? (
            <Input
              aria-label="Account email"
              type="email"
              autoComplete="off"
              placeholder="you@example.com"
              value={enrolEmail}
              disabled={actionPending}
              className="min-w-0 flex-1"
              onChange={(event) => onEnrolEmailChange(event.target.value)}
            />
          ) : null}
          <Input
            aria-label="Account label (optional)"
            placeholder="Label (optional)"
            value={enrolLabel}
            disabled={actionPending}
            className="min-w-0 flex-1"
            onChange={(event) => onEnrolLabelChange(event.target.value)}
          />
          <Button
            type="button"
            disabled={
              actionPending || (!isCodex && enrolEmail.trim().length === 0)
            }
            onClick={onEnrol}
          >
            {isEnrolling ? 'Sign-in in progress...' : `Connect ${providerName}`}
          </Button>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Identity checked: {formatCheckedAt(lastCheckedAt)}
          {claudeVersion ? ` · Claude Code ${claudeVersion}` : ''}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isLoading || actionPending}
          onClick={onCheckHealth}
        >
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Check now
        </Button>
      </div>

      {message ? (
        <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
          {message}
        </p>
      ) : null}
      {error ? (
        <p
          className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  )
}
