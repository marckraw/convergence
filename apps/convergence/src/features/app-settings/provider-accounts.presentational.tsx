import type { ProviderAccountLoginAttempt } from '@/shared/types/provider-account-login.types'
import { ProviderAccountLoginProgress } from './provider-account-login.presentational'
import { Pencil, Plug, RefreshCw, Star, Trash2 } from 'lucide-react'
import type {
  ClaudeAccountLayout,
  ProviderAccountConnectors,
  ProviderAccountChatGptApps,
  ProviderAccountChatGptSignIns,
  ProviderAccountEnrollmentProvider,
  ProviderAccountSettingsRow,
  ProviderAccountSettingsWarning,
} from '@/entities/provider-account'
import {
  Badge,
  Button,
  Card,
  Checkbox,
  ChoiceField,
  cn,
  ConfirmDialog,
  EmptyState,
  FormError,
  Input,
  Notice,
  SegmentedControl,
  SegmentedControlItem,
  settingsHeading,
  Timestamp,
  type Tone,
} from '@convergence/ui'
import { ProviderIcon } from '@/shared/ui/provider-icon.presentational'
import {
  CONFIGURED_SERVERS_SENTENCE,
  chatGptLinkCopiedMessage,
  clearedNeedsAuthNotesMessage,
  configuredServerAction,
  configuredServerNeedsSignIn,
  chatGptManageLabel,
  chatGptSignInLine,
  configuredServerSignInLine,
  describeChatGptSignInsCheckedAt,
  oneSignInPerAppNote,
  type ChatGptLinkAction,
} from './chatgpt-app-sign-in.pure'
import { CHATGPT_SIGN_IN_TONE } from './chatgpt-app-sign-in.styles'
import { ChatGptLinkMenu } from './chatgpt-link-menu.presentational'

/**
 * Whose truth the Connectors list tells (MAR-3213, R3): the panel shows what
 * the Claude CLI reports for the account — a terminal's one-shot view — while
 * a running conversation loads its own list at its start. The exact copy the
 * brief rules; keep it byte-for-byte.
 */
const CLAUDE_CONNECTORS_VIEW_SENTENCE =
  "This is what the Claude CLI reports for this account — what a terminal sees. A running conversation loads its own list when it starts and can differ; open that conversation's Harness details to see it. Restart the app after authorizing a claude.ai connector so running conversations pick it up."

/**
 * Where Connect Linear writes for a Claude account (MAR-3185, R5): the server
 * goes to the shared profile every Claude account is reconciled from
 * (`mcpServers`), the authorization to this account's slot (`mcpOAuth`).
 */
const CLAUDE_LINEAR_HOMES_SENTENCE =
  'Linear is added for every Claude account on this Mac; authorization is per account.'

/** The Figma rule under a row that needs signing in (MAR-3516). */
function OneSignInPerAppNote(props: { name: string; needsSignIn: boolean }) {
  const note = oneSignInPerAppNote(props)
  return note ? (
    <p className="text-xs text-pretty text-ink-muted">{note}</p>
  ) : null
}

/** What an account's state says (R1): fine, needs a look, or failed. */
const STATUS_TONE: Record<ProviderAccountSettingsRow['status']['tone'], Tone> =
  {
    ok: 'success',
    warning: 'warning',
    danger: 'danger',
  }

/**
 * What removing an account does to its files, in the words of the question
 * that asks first (R5).
 */
function removalDescription(
  isCodex: boolean,
  layout: ClaudeAccountLayout | null,
): string {
  if (isCodex)
    return 'This signs the account out of Codex and removes its local account directory. Shared native history and Convergence messages remain. Any history stored only in this account directory, including migration backups, is removed.'
  if (layout?.privateEntries.length)
    return `This account contains private history or data in ${layout.privateEntries.join(', ')}. Removing it will permanently delete those copies. Convergence messages remain. Cancel to keep the account and its files.`
  if (layout?.fullyShared)
    return 'This signs the account out of Claude Code and deletes its account directories. Native conversations stay in the verified shared location. Convergence messages remain.'
  return 'This signs the account out of Claude Code and deletes its account directories. Conversation sharing is not fully verified. Linked destinations and Convergence messages remain.'
}

/** A row of a heading or name and its actions, wrapping when it runs out of room. */
const spreadRow = 'flex flex-wrap items-center justify-between gap-2'

/** A row of marks or buttons, wrapping when it runs out of room. */
const wrapRow = 'flex flex-wrap items-center gap-2'

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
  chatGptApps: ProviderAccountChatGptApps | null
  isLoadingChatGptApps: boolean
  /** The expanded account's last sign-in check (MAR-3470). */
  chatGptSignIns: ProviderAccountChatGptSignIns | null
  isCheckingChatGptSignIns: boolean
  chatGptLinkError: string | null
  /** A ChatGPT link of the expanded account was just copied (MAR-3486). */
  chatGptLinkCopied: boolean
  onRefreshChatGptApps: () => void
  onManageChatGptApp: (
    accountId: string,
    appId: string,
    action: ChatGptLinkAction,
  ) => void
  onBrowseChatGptApps: (accountId: string, action: ChatGptLinkAction) => void
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

/** When the identity was checked: a Timestamp, the whole moment in its tooltip. */
function checkedAt(value: string | null) {
  if (!value) return 'not checked yet'
  return <Timestamp date={value} format="datetime" />
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
  chatGptApps,
  isLoadingChatGptApps,
  chatGptSignIns,
  isCheckingChatGptSignIns,
  chatGptLinkError,
  chatGptLinkCopied,
  onRefreshChatGptApps,
  onManageChatGptApp,
  onBrowseChatGptApps,
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
  const deletesPrivateHistory =
    !isCodex && Boolean(removalLayout?.privateEntries.length)

  return (
    <div className="space-y-4">
      {/* Two providers, one at a time (R9): a SegmentedControl. */}
      <SegmentedControl
        aria-label="Account provider"
        value={providerId}
        disabled={actionPending || isLoadingConnectors}
        onValueChange={(next: ProviderAccountEnrollmentProvider) =>
          onProviderChange(next)
        }
        className="flex w-full"
      >
        {(
          [
            { id: 'claude-code', label: 'Anthropic' },
            { id: 'codex', label: 'OpenAI' },
          ] as const
        ).map((provider) => (
          <SegmentedControlItem
            key={provider.id}
            value={provider.id}
            className="flex-1"
          >
            <ProviderIcon providerId={provider.id} title="" />
            {provider.label}
          </SegmentedControlItem>
        ))}
      </SegmentedControl>

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
        <Notice
          tone="warning"
          title="Shared settings outrank account selection"
        >
          {settingsWarnings.map((warning) => (
            <p
              key={`${warning.kind}-${warning.key}`}
              className="leading-relaxed"
            >
              {warning.message}
            </p>
          ))}
        </Notice>
      ) : null}

      {isLoading ? (
        <EmptyState state="loading" title="Loading accounts…" />
      ) : rows.length === 0 ? (
        <EmptyState
          title={`No ${providerName} accounts enrolled`}
          detail={`Convergence uses the ${agentName} login already on this Mac. Connect an account below to manage it here.`}
        />
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const isBusy = actionPending
            const isRenaming = renamingAccountId === row.id
            const isConfirmingRemoval = confirmingRemovalAccountId === row.id
            const showsConnectors = expandedConnectorsAccountId === row.id

            return (
              <Card
                key={row.id}
                render={<section />}
                padding="md"
                className="space-y-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className={wrapRow}>
                      <ProviderIcon providerId={providerId} />
                      <h4 className={cn(settingsHeading, 'break-all')}>
                        {row.identity}
                      </h4>
                      {row.isDefault ? (
                        <Badge shape="label" caps>
                          default
                        </Badge>
                      ) : null}
                      <Badge
                        shape="label"
                        tone={STATUS_TONE[row.status.tone]}
                        caps
                      >
                        {row.status.label}
                      </Badge>
                    </div>
                    <p className="text-xs text-ink-muted">
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
                      disabled={isBusy || isRenaming}
                      onClick={() => onStartRename(row.id, row.label)}
                    >
                      <Pencil className="size-3.5" />
                      Rename
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={isBusy || !row.canSetDefault}
                      onClick={() => onSetDefault(row.id)}
                    >
                      <Star className="size-3.5" />
                      Set default
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      aria-expanded={showsConnectors}
                      disabled={isBusy || isLoadingConnectors}
                      onClick={() => onToggleConnectors(row.id)}
                    >
                      <Plug className="size-3.5" />
                      Connectors
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={isBusy}
                      onClick={() => onReconnect(row.id)}
                    >
                      <RefreshCw className="size-3.5" />
                      Reconnect
                    </Button>
                    <Button
                      type="button"
                      variant="danger-quiet"
                      disabled={isBusy}
                      onClick={() => onRequestRemove(row.id)}
                    >
                      <Trash2 className="size-3.5" />
                      Remove…
                    </Button>
                  </div>
                </div>

                {/*
                  Removing asks first, in the app's own dialog (R5); with
                  private history it also waits for the box that names it.
                */}
                <ConfirmDialog
                  open={isConfirmingRemoval}
                  onOpenChange={(open) => {
                    if (!open) onCancelRemove()
                  }}
                  title={`Remove “${row.identity}”?`}
                  description={removalDescription(isCodex, removalLayout)}
                  confirmLabel={
                    deletesPrivateHistory
                      ? 'Sign out and delete private history'
                      : 'Sign out and remove'
                  }
                  pendingLabel="Signing out…"
                  variant="danger"
                  pending={isConfirmingRemoval && busyAccountId === row.id}
                  error={isConfirmingRemoval ? error : null}
                  confirmDisabledReason={
                    deletesPrivateHistory && !privateDeletionAcknowledged
                      ? 'Tick the box to delete the private files first.'
                      : undefined
                  }
                  onConfirm={() =>
                    onConfirmRemove(
                      row.id,
                      deletesPrivateHistory && privateDeletionAcknowledged,
                    )
                  }
                >
                  {deletesPrivateHistory && removalLayout ? (
                    <ChoiceField
                      disabled={isBusy}
                      label={`Delete the private files in ${removalLayout.privateEntries.join(', ')} — this cannot be undone.`}
                    >
                      <Checkbox
                        checked={privateDeletionAcknowledged}
                        onCheckedChange={(checked) =>
                          onPrivateDeletionAcknowledged(checked)
                        }
                      />
                    </ChoiceField>
                  ) : null}
                </ConfirmDialog>

                {isRenaming ? (
                  <div className={wrapRow}>
                    <Input
                      size="lg"
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
                      disabled={isBusy || renameDraft.trim().length === 0}
                      onClick={onCommitRename}
                    >
                      Save label
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={isBusy}
                      onClick={onCancelRename}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : null}

                {showsConnectors ? (
                  <Card className="space-y-2">
                    {isCodex ? (
                      <section
                        aria-label="From ChatGPT"
                        className="space-y-3 pb-3"
                      >
                        <div className={spreadRow}>
                          <h4 className={settingsHeading}>From ChatGPT</h4>
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={isLoadingChatGptApps}
                            onClick={onRefreshChatGptApps}
                          >
                            <RefreshCw className="size-3.5" />
                            Refresh
                          </Button>
                        </div>
                        <p className="text-xs leading-relaxed text-pretty text-ink-muted">
                          Opening this panel checks each app that has a "who am
                          I" call by using it once through Codex. If an app
                          needs signing in again, reconnect it on ChatGPT;
                          coming back here checks again.
                        </p>
                        {describeChatGptSignInsCheckedAt(
                          chatGptSignIns?.checkedAt ?? null,
                        ) ? (
                          <p className="text-xs text-ink-muted">
                            {describeChatGptSignInsCheckedAt(
                              chatGptSignIns?.checkedAt ?? null,
                            )}
                          </p>
                        ) : null}
                        <FormError>{chatGptSignIns?.error}</FormError>
                        {isLoadingChatGptApps ? (
                          <p role="status" className="text-sm text-ink-muted">
                            Reading ChatGPT apps…
                          </p>
                        ) : null}
                        {chatGptApps?.requiresChatGpt ? (
                          <p className="text-sm text-ink-muted">
                            ChatGPT apps need a ChatGPT sign-in
                          </p>
                        ) : null}
                        {chatGptApps?.apps.map((app) => {
                          const signIn = chatGptSignIns?.signIns.find(
                            (entry) => entry.appId === app.id,
                          )
                          const line = chatGptSignInLine({
                            signIn,
                            checking: isCheckingChatGptSignIns,
                            appState: app.state,
                          })
                          return (
                            <div key={app.id} className={spreadRow}>
                              <div className="min-w-0">
                                <p className="text-sm font-medium wrap-break-word">
                                  {app.name}
                                </p>
                                <p className="text-xs text-pretty text-ink-muted">
                                  {app.state === 'available'
                                    ? 'Tools available'
                                    : app.state === 'off'
                                      ? 'Turned off'
                                      : 'Tools not available to Codex here'}
                                </p>
                                {line ? (
                                  <p
                                    className={cn(
                                      'text-xs text-pretty wrap-break-word',
                                      CHATGPT_SIGN_IN_TONE[line.tone],
                                    )}
                                  >
                                    {line.text}
                                  </p>
                                ) : null}
                                <OneSignInPerAppNote
                                  name={app.name}
                                  needsSignIn={
                                    !isCheckingChatGptSignIns &&
                                    signIn?.status === 'needs-sign-in'
                                  }
                                />
                              </div>
                              <ChatGptLinkMenu
                                label={chatGptManageLabel(signIn)}
                                onChoose={(action) =>
                                  onManageChatGptApp(row.id, app.id, action)
                                }
                              />
                            </div>
                          )
                        })}
                        {!isLoadingChatGptApps &&
                        chatGptApps &&
                        !chatGptApps.error &&
                        !chatGptApps.requiresChatGpt &&
                        chatGptApps.apps.length === 0 ? (
                          <p className="text-sm text-ink-muted">
                            No ChatGPT apps are available for this account.
                          </p>
                        ) : null}
                        {!isLoadingChatGptApps ? (
                          <FormError>{chatGptApps?.error}</FormError>
                        ) : null}
                        {chatGptLinkCopied ? (
                          <p
                            role="status"
                            className="text-sm text-pretty text-ink-muted"
                          >
                            {chatGptLinkCopiedMessage(row.identity)}
                          </p>
                        ) : null}
                        <FormError>{chatGptLinkError}</FormError>
                        <ChatGptLinkMenu
                          label="Browse apps on ChatGPT"
                          onChoose={(action) =>
                            onBrowseChatGptApps(row.id, action)
                          }
                        />
                      </section>
                    ) : null}
                    {isCodex ? (
                      <h4 className={settingsHeading}>
                        Configured on this Mac
                      </h4>
                    ) : null}
                    <p className="text-xs leading-relaxed text-ink-muted">
                      {CONFIGURED_SERVERS_SENTENCE}
                    </p>
                    {isLoadingConnectors ? (
                      <p className="text-sm text-ink-muted">
                        Asking this account what it can reach…
                      </p>
                    ) : connectors?.connectors.length === 0 &&
                      !connectors.error ? (
                      <p className="text-sm text-ink-muted">
                        No MCP servers are configured.
                      </p>
                    ) : (
                      (connectors?.connectors ?? []).map((connector) => {
                        // A Codex account's saved "Authorized" gives way to
                        // what the sign-in check observed (MAR-3470).
                        const liveSignIn = isCodex
                          ? chatGptSignIns?.servers.find(
                              (entry) => entry.server === connector.name,
                            )
                          : undefined
                        const live = isCodex
                          ? configuredServerSignInLine({
                              signIn: liveSignIn,
                              checking: isCheckingChatGptSignIns,
                            })
                          : null
                        const observed = {
                          needsAuthorization: connector.needsAuthorization,
                          liveStatus: isCheckingChatGptSignIns
                            ? null
                            : (liveSignIn?.status ?? null),
                        }
                        const action = configuredServerAction(observed)
                        return (
                          <div key={connector.name} className={spreadRow}>
                            <div className="min-w-0">
                              <p className="text-sm font-medium">
                                {connector.name}
                              </p>
                              {live ? (
                                <p
                                  className={cn(
                                    'text-xs text-pretty wrap-break-word',
                                    CHATGPT_SIGN_IN_TONE[live.tone],
                                  )}
                                >
                                  {live.text}
                                </p>
                              ) : (
                                <p className="truncate text-xs text-ink-muted">
                                  {connector.statusLabel}
                                </p>
                              )}
                              <OneSignInPerAppNote
                                name={connector.name}
                                needsSignIn={configuredServerNeedsSignIn(
                                  observed,
                                )}
                              />
                            </div>
                            {connector.needsAuthorization ||
                            (isCodex && connector.status === 'ready') ? (
                              <Button
                                type="button"
                                variant={
                                  action.emphasis === 'primary'
                                    ? 'primary'
                                    : 'secondary'
                                }
                                disabled={authorizingServerName !== null}
                                pending={
                                  authorizingServerName === connector.name
                                }
                                pendingLabel="Waiting for browser…"
                                onClick={() =>
                                  onAuthorizeConnector(row.id, connector.name)
                                }
                              >
                                {action.label}
                              </Button>
                            ) : null}
                          </div>
                        )
                      })
                    )}
                    {!isLoadingConnectors &&
                    clearedNeedsAuthNotesMessage(
                      connectors?.clearedNeedsAuthNotes,
                    ) ? (
                      <p
                        role="status"
                        className="text-xs text-pretty text-ink-muted"
                      >
                        {clearedNeedsAuthNotesMessage(
                          connectors?.clearedNeedsAuthNotes,
                        )}
                      </p>
                    ) : null}
                    {!isLoadingConnectors && connectors?.error ? (
                      <p className="text-sm text-ink-muted">
                        {connectors.error}
                      </p>
                    ) : null}
                    {!isLoadingConnectors &&
                    connectors &&
                    !connectors.connectors.some(
                      (connector) => connector.name === 'linear',
                    ) ? (
                      <Button
                        type="button"
                        disabled={actionPending}
                        pending={authorizingServerName === 'linear'}
                        pendingLabel="Waiting for browser…"
                        onClick={() => onConnectLinear(row.id)}
                      >
                        Connect Linear
                      </Button>
                    ) : null}
                    {!isCodex ? (
                      <p className="text-xs leading-relaxed text-ink-muted">
                        {CLAUDE_CONNECTORS_VIEW_SENTENCE}
                      </p>
                    ) : null}
                    {!isCodex ? (
                      <p className="text-xs leading-relaxed text-ink-muted">
                        {CLAUDE_LINEAR_HOMES_SENTENCE}
                      </p>
                    ) : null}
                  </Card>
                ) : null}

                {row.statusDetail ? (
                  <p className="text-sm leading-relaxed text-ink-muted">
                    {row.statusDetail}
                  </p>
                ) : null}

                {row.notes.map((note) => (
                  <p
                    key={note}
                    className="rounded-lg border border-dashed border-line px-3 py-2 text-xs leading-relaxed text-ink-muted"
                  >
                    {note}
                  </p>
                ))}
              </Card>
            )
          })}
        </div>
      )}

      <Card render={<section />} padding="md" className="space-y-3">
        <div className="space-y-1">
          <h4 className={settingsHeading}>Connect an {providerName} account</h4>
          <p className="text-sm leading-relaxed text-ink-muted">
            {isCodex
              ? 'Codex opens a browser. Choose the OpenAI account and workspace you want to use; its signed-in identity and plan appear here after login.'
              : 'Claude Code opens a browser to sign in. The email prefills the login page so you can identify the account you are authorising.'}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          {!isCodex ? (
            <Input
              size="lg"
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
            size="lg"
            aria-label="Account label (optional)"
            placeholder="Label (optional)"
            value={enrolLabel}
            disabled={actionPending}
            className="min-w-0 flex-1"
            onChange={(event) => onEnrolLabelChange(event.target.value)}
          />
          <Button
            type="button"
            disabled={actionPending}
            disabledReason={
              !actionPending && !isCodex && enrolEmail.trim().length === 0
                ? 'Enter the account’s email first.'
                : undefined
            }
            pending={isEnrolling}
            pendingLabel="Sign-in in progress…"
            onClick={onEnrol}
            size="lg"
          >
            Connect {providerName}
          </Button>
        </div>
      </Card>

      <div className={spreadRow}>
        <p className="text-xs text-ink-muted">
          Identity checked: {checkedAt(lastCheckedAt)}
          {claudeVersion ? ` · Claude Code ${claudeVersion}` : ''}
        </p>
        <Button
          type="button"
          variant="ghost"
          disabled={isLoading || actionPending}
          onClick={onCheckHealth}
        >
          <RefreshCw className="size-3.5" />
          Check now
        </Button>
      </div>

      {message ? <Notice tone="success" title={message} /> : null}
      {/* While the removal question is open, its error is said there. */}
      {error && confirmingRemovalAccountId === null ? (
        <Notice tone="danger" title={error} />
      ) : null}
    </div>
  )
}
