import type { ExecutionSessionWorkspace } from '@mrck-labs/execution-host-protocol'
import type {
  ExecutionHostEndpoint,
  ExecutionHostEndpointInput,
} from '@/entities/execution-host'
import type {
  NotificationEventPrefs,
  NotificationPrefs,
} from '../notifications'
import type { ReasoningEffort } from '../session'
import type { UpdatePrefs } from '../updates'
import type { KeyboardShortcutBinding } from '@/shared/lib/keyboard-shortcut.pure'
import { DEFAULT_COMMAND_CENTER_SHORTCUT } from '@/shared/lib/keyboard-shortcut.pure'

export type CommandCenterShortcutPrefs = KeyboardShortcutBinding

export { DEFAULT_COMMAND_CENTER_SHORTCUT }

export type { NotificationEventPrefs, NotificationPrefs, UpdatePrefs }
export { DEFAULT_NOTIFICATION_PREFS } from '../notifications'
export { DEFAULT_UPDATE_PREFS } from '../updates'

export interface OnboardingPrefs {
  notificationsCardDismissed: boolean
}

export const DEFAULT_ONBOARDING_PREFS: OnboardingPrefs = {
  notificationsCardDismissed: false,
}

export interface DebugLoggingPrefs {
  enabled: boolean
}

export const DEFAULT_DEBUG_LOGGING_PREFS: DebugLoggingPrefs = {
  enabled: false,
}

export interface PiModelVisibilityPrefs {
  additionalModelIds: string[]
}

export const DEFAULT_PI_MODEL_VISIBILITY_PREFS: PiModelVisibilityPrefs = {
  additionalModelIds: [],
}

export interface FavoriteModelRef {
  providerId: string
  modelId: string
}

export interface FavoriteModelsPrefs {
  items: FavoriteModelRef[]
}

export const DEFAULT_FAVORITE_MODELS_PREFS: FavoriteModelsPrefs = {
  items: [],
}

export interface AppSettings {
  defaultProviderId: string | null
  defaultModelId: string | null
  defaultEffortId: ReasoningEffort | null
  namingModelByProvider: Record<string, string>
  extractionModelByProvider: Record<string, string>
  commandCenterShortcut: CommandCenterShortcutPrefs
  /**
   * The machines other than this one that a session can run on (MAR-2620).
   * The list is the whole fact: there is no single "the" remote base URL any
   * more, because there is no longer a single daemon for "the" to refer to.
   */
  executionHostEndpoints: ExecutionHostEndpoint[]
  notifications: NotificationPrefs
  onboarding: OnboardingPrefs
  updates: UpdatePrefs
  debugLogging: DebugLoggingPrefs
  piModelVisibility: PiModelVisibilityPrefs
  favoriteModels: FavoriteModelsPrefs
}

export type AppSettingsInput = Omit<
  AppSettings,
  | 'namingModelByProvider'
  | 'extractionModelByProvider'
  | 'commandCenterShortcut'
  | 'executionHostEndpoints'
  | 'notifications'
  | 'onboarding'
  | 'updates'
  | 'debugLogging'
  | 'piModelVisibility'
  | 'favoriteModels'
> & {
  namingModelByProvider?: Record<string, string>
  extractionModelByProvider?: Record<string, string>
  commandCenterShortcut?: CommandCenterShortcutPrefs
  executionHostEndpoints?: ExecutionHostEndpointInput[]
  notifications?: NotificationPrefs
  onboarding?: OnboardingPrefs
  updates?: UpdatePrefs
  debugLogging?: DebugLoggingPrefs
  piModelVisibility?: PiModelVisibilityPrefs
  favoriteModels?: FavoriteModelsPrefs
}

export interface OpenRouterCredentialStatus {
  providerId: 'openrouter'
  configured: boolean
  source: 'environment' | 'keychain' | null
  storage: 'keychain' | null
  account: string | null
  service: string | null
  error: string | null
}

export interface ExecutionHostDaemonCredentialStatus {
  providerId: 'execution-host-daemon'
  configured: boolean
  source: 'environment' | 'keychain' | null
  storage: 'keychain' | null
  account: string | null
  service: string | null
  error: string | null
}

/**
 * The environment override, which belongs to no Endpoint (MAR-2642).
 *
 * It predates Endpoints and names no machine, so it serves exactly one id: the
 * one the single-host era became. Carries no token — only that one exists, so
 * Settings can say when it exists and serves nobody.
 */
export interface ExecutionHostDaemonEnvironmentOverride {
  /** Whether the variable is set at all. */
  configured: boolean
  /** The variable's name, so a message can say what to unset. */
  envKey: string
  /** The single Endpoint id it can serve, and the only one. */
  endpointId: string
}

export type RemoteExecutionHostConnectionState =
  | 'connected'
  | 'missing-base-url'
  | 'invalid-base-url'
  | 'missing-token'
  | 'unreachable'
  | 'auth-failed'
  | 'invalid-response'
  | 'daemon-error'
  | 'incompatible'

/**
 * What the daemon reported about itself during the `/health` handshake. Null
 * means it answered none — an older daemon, or a proxy hiding the route — so
 * the settings surface says nothing rather than guessing.
 */
export interface RemoteExecutionHostDaemonSummary {
  version: string | null
  apiVersion: string | null
  protocolCapabilities: string[]
}

export interface RemoteExecutionHostProviderSummary {
  providerId: string
  name: string
  available: boolean
  authenticated: boolean
  supportsContinuation: boolean
  models: { id: string; label: string }[]
}

/**
 * How many sessions name one execution host (MAR-2642).
 *
 * Pairs rather than a record keyed by id: the ids are the user's own, and a
 * bare object indexed by them answers `toString` with a function and loses
 * `__proto__` to the prototype setter.
 */
export interface ExecutionHostSessionCount {
  executionHostId: string
  sessions: number
}

export interface RemoteExecutionHostConnectionResult {
  ok: boolean
  state: RemoteExecutionHostConnectionState
  baseUrl: string | null
  message: string
  providers: RemoteExecutionHostProviderSummary[] | null
  daemon: RemoteExecutionHostDaemonSummary | null
}

export type RemoteSessionWorkspaceResult =
  | {
      ok: true
      info: {
        /** The protocol's own union, verbatim (MAR-2694). */
        workspace: ExecutionSessionWorkspace | null
        /** Decoded at the wire door, never collapsed (MAR-2718 round 2). */
        pullRequest: RemoteSessionPullRequest
      }
    }
  | { ok: false; message: string }

/**
 * What the daemon's snapshot said about the pull request, as the main process
 * decoded it (MAR-2718 round 2).
 *
 * `none` is the daemon's own explicit negative -- the only answer the panel may
 * render as `None yet`. A missing field, a number, a blank string or anything
 * that is not an `http(s)` URL is `unreadable`, because a successful fetch is
 * not the same thing as a legible answer.
 */
export type RemoteSessionPullRequest =
  | { kind: 'none' }
  | { kind: 'url'; url: string }
  | { kind: 'unreadable'; reason: string }
