import type {
  ClaudeCodePermissionMode,
  CodexApprovalPolicy,
  CodexSandboxMode,
  ProviderDescriptor,
  SessionPermissionPreset,
} from './provider.types'

/**
 * One provider on one machine, and whether that machine will run it
 * (MAR-2682).
 *
 * The descriptor says what the provider is; `blockedReason` says whether this
 * host will take a session on it. They are one value because they are one
 * answer to one question -- "what can I pick here?" -- and splitting them let
 * the option row list a provider the host had already refused.
 *
 * A reason rather than a flag, and listed rather than dropped: S2's precedent,
 * because a disabled row teaches what the machine cannot do while an absent one
 * is a mystery.
 */
export interface ProviderCatalogEntry {
  descriptor: ProviderDescriptor
  /** Why this provider cannot be picked on this host, or null when it can. */
  blockedReason: string | null
  /**
   * The permission choices this host offers a session of this provider, and
   * what each Codex sandbox really runs as there (MAR-4272). Absent when the
   * host does not say -- every local catalog, and a daemon that sends none --
   * and then the app's own choices stand.
   */
  hostPermissions?: ProviderHostPermissions
  /**
   * How much of the host account's limits this provider has used, credits
   * included (MAR-4272). Absent when the host does not say: unknown, never 0%.
   * Shown to anyone (Marcin, 18 Oct); the account it belongs to is not here.
   */
  hostUsage?: ProviderHostUsage
}

/**
 * A host's permission choices for one provider: the protocol's
 * `ExecutionProviderPermissions` in this app's words. A provider's part is
 * null when the host offers none for it.
 */
export interface ProviderHostPermissions {
  presets: SessionPermissionPreset[]
  codex: {
    approvalPolicies: CodexApprovalPolicy[]
    sandboxModes: CodexSandboxMode[]
    /**
     * What each sandbox a session asks for really runs as on this host. A
     * sandbox left out is one the host does not speak for: unknown, not "as
     * asked". Null is a sandbox the host does not offer.
     */
    effectiveSandboxModes: Partial<
      Record<CodexSandboxMode, CodexSandboxMode | null>
    >
  } | null
  claudeCode: {
    permissionModes: ClaudeCodePermissionMode[]
  } | null
}

/** One limit window of a host account: how much of it is used. */
export interface ProviderHostUsageWindow {
  id: string
  span: 'session' | 'week' | 'other'
  label: string
  /** 0-100. */
  usedPercent: number
  /** When it starts again (ISO 8601), or null when the provider doesn't say. */
  resetsAt: string | null
  /** The model family it limits, or null for every model. */
  modelFamily: string | null
}

/** A host account's credits, for display only: they never refuse a turn. */
export interface ProviderHostUsageCredits {
  hasCredits: boolean
  unlimited: boolean
  /** A decimal string as reported, never converted; null when not reported. */
  balance: string | null
  /** When the host heard the credits (ISO 8601). */
  observedAt: string
}

/** The protocol's `ExecutionProviderUsage`, as the host last heard it. */
export interface ProviderHostUsage {
  /** When the host heard it (ISO 8601). */
  observedAt: string
  source: 'turn' | 'read'
  /** The provider's own verdict, or null when it gives none. */
  status: 'ok' | 'warning' | 'limited' | null
  windows: ProviderHostUsageWindow[]
  credits: ProviderHostUsageCredits | null
}

/**
 * Every provider one machine offers, carrying which machine that is
 * (MAR-2682).
 *
 * The `executionHostId` is not decoration and not a convenience for logging:
 * it is what makes a cached catalog refusable. A list of providers is only
 * true of the machine it was read from, and a catalog that did not say which
 * machine that was is one the renderer could hand to a session bound for
 * another -- the lie this era exists to stop (MAR-2619).
 *
 * `unreachableReason` is the third state, and it is here because the other two
 * cannot express it: an empty listing from a daemon that answered and an empty
 * listing from a daemon that never did are the same shape and different facts.
 */
export interface ProviderCatalog {
  /** `'local'`, or the Endpoint id this catalog was read from. */
  executionHostId: string
  providers: ProviderCatalogEntry[]
  /** Why this machine could not be asked, or null when it answered. */
  unreachableReason: string | null
}
