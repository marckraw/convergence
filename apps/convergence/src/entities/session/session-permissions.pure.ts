import type {
  ClaudeCodePermissionMode,
  CodexApprovalPolicy,
  CodexSandboxMode,
  ProviderHostPermissions,
  SessionPermissionConfig,
} from './session.types'

export const ASK_PERMISSION_CONFIG: SessionPermissionConfig = {
  preset: 'ask',
}

export const YOLO_PERMISSION_CONFIG: SessionPermissionConfig = {
  preset: 'yolo',
}

export const CODEX_APPROVAL_POLICY_OPTIONS: Array<{
  id: CodexApprovalPolicy
  label: string
  description: string
}> = [
  {
    id: 'on-request',
    label: 'On request',
    description: 'Ask for risky or out-of-sandbox actions.',
  },
  {
    id: 'untrusted',
    label: 'Untrusted',
    description: 'Ask before all but trusted read commands.',
  },
  {
    id: 'never',
    label: 'Never',
    description: 'Do not ask; failures return to the model.',
  },
]

export const CODEX_SANDBOX_OPTIONS: Array<{
  id: CodexSandboxMode
  label: string
  description: string
}> = [
  {
    id: 'workspace-write',
    label: 'Workspace write',
    description: 'Allow writes in the active workspace.',
  },
  {
    id: 'read-only',
    label: 'Read only',
    description: 'Inspect without writing files.',
  },
  {
    id: 'danger-full-access',
    label: 'Full access',
    description: 'Disable sandbox restrictions.',
  },
]

export const CLAUDE_CODE_PERMISSION_MODE_OPTIONS: Array<{
  id: ClaudeCodePermissionMode
  label: string
  description: string
}> = [
  {
    id: 'default',
    label: 'Ask before edits',
    description: 'Claude asks before file edits and risky actions.',
  },
  {
    id: 'acceptEdits',
    label: 'Edit automatically',
    description: 'Auto-approve in-workspace edits.',
  },
  {
    id: 'auto',
    label: 'Auto',
    description: 'Claude decides which actions need approval.',
  },
  {
    id: 'dontAsk',
    label: 'Do not ask',
    description: 'Block instead of prompting for unapproved actions.',
  },
  {
    id: 'plan',
    label: 'Plan mode',
    description: 'Research and propose before editing.',
  },
  {
    id: 'bypassPermissions',
    label: 'Bypass permissions',
    description: 'Skip Claude permission checks.',
  },
]

export function resolveSimplePermissionConfig(
  preset: 'ask' | 'yolo',
): SessionPermissionConfig {
  return preset === 'yolo' ? YOLO_PERMISSION_CONFIG : ASK_PERMISSION_CONFIG
}

export function getSimplePermissionPreset(
  config: SessionPermissionConfig,
): 'ask' | 'yolo' {
  return config.preset === 'yolo' ? 'yolo' : 'ask'
}

export function defaultCustomPermissionConfigForProvider(
  providerId: string,
): SessionPermissionConfig {
  if (providerId === 'codex') {
    return {
      preset: 'custom',
      codex: {
        approvalPolicy: 'on-request',
        sandbox: 'workspace-write',
      },
    }
  }

  if (providerId === 'claude-code') {
    return {
      preset: 'custom',
      claudeCode: {
        permissionMode: 'default',
      },
    }
  }

  return ASK_PERMISSION_CONFIG
}

export function withCodexApprovalPolicy(
  config: SessionPermissionConfig,
  approvalPolicy: CodexApprovalPolicy,
): SessionPermissionConfig {
  const codex = config.codex ?? {
    approvalPolicy: 'on-request',
    sandbox: 'workspace-write' as CodexSandboxMode,
  }
  return {
    ...config,
    preset: 'custom',
    codex: { ...codex, approvalPolicy },
  }
}

export function withCodexSandbox(
  config: SessionPermissionConfig,
  sandbox: CodexSandboxMode,
): SessionPermissionConfig {
  const codex = config.codex ?? {
    approvalPolicy: 'on-request' as CodexApprovalPolicy,
    sandbox: 'workspace-write',
  }
  return {
    ...config,
    preset: 'custom',
    codex: { ...codex, sandbox },
  }
}

export function withClaudeCodePermissionMode(
  config: SessionPermissionConfig,
  permissionMode: ClaudeCodePermissionMode,
): SessionPermissionConfig {
  return {
    ...config,
    preset: 'custom',
    claudeCode: { permissionMode },
  }
}

export const SIMPLE_PERMISSION_PRESET_OPTIONS: Array<{
  id: 'ask' | 'yolo'
  label: string
  description: string
}> = [
  {
    id: 'ask',
    label: 'Ask',
    description: 'Ask before risky provider actions.',
  },
  {
    id: 'yolo',
    label: 'Yolo',
    description: 'Give the provider full execution freedom.',
  },
]

export interface PermissionChoiceItem<Id extends string = string> {
  id: Id
  label: string
  description: string
}

/** The permission controls the composer offers for one provider on one host. */
export interface PermissionChoices {
  presetItems: PermissionChoiceItem<'ask' | 'yolo'>[]
  /** Whether the advanced controls (the Custom preset) are offered. */
  canCustomize: boolean
  codexApprovalPolicyItems: PermissionChoiceItem<CodexApprovalPolicy>[]
  codexSandboxItems: PermissionChoiceItem<CodexSandboxMode>[]
  claudeCodePermissionModeItems: PermissionChoiceItem<ClaudeCodePermissionMode>[]
}

function sandboxLabel(sandbox: CodexSandboxMode): string {
  return (
    CODEX_SANDBOX_OPTIONS.find((option) => option.id === sandbox)?.label ??
    sandbox
  )
}

/**
 * The permission choices a provider offers on the machine a session will run
 * on (MAR-4272).
 *
 * A host that lists its own choices is the authority on them: a remote
 * composer offers what that machine's provider accepts, not what this app's
 * local CLI would. A host that says nothing -- every local catalog, and a
 * daemon that sends none -- leaves this app's own lists standing, which is
 * the only thing it ever offered before.
 *
 * A Codex sandbox the host does not offer (`effectiveSandboxModes` maps it to
 * null) is not offered here, and one it runs as another says so in its
 * description, so the raise is visible in the list as well as in the notice.
 */
export function resolvePermissionChoices(
  providerId: string | null,
  host: ProviderHostPermissions | null | undefined,
): PermissionChoices {
  const locallyCustomizable =
    providerId === 'codex' || providerId === 'claude-code'
  if (!host) {
    return {
      presetItems: SIMPLE_PERMISSION_PRESET_OPTIONS,
      canCustomize: locallyCustomizable,
      codexApprovalPolicyItems: CODEX_APPROVAL_POLICY_OPTIONS,
      codexSandboxItems: CODEX_SANDBOX_OPTIONS,
      claudeCodePermissionModeItems: CLAUDE_CODE_PERMISSION_MODE_OPTIONS,
    }
  }

  const effective = host.codex?.effectiveSandboxModes ?? {}
  const providerPart =
    providerId === 'codex'
      ? host.codex
      : providerId === 'claude-code'
        ? host.claudeCode
        : null
  return {
    presetItems: SIMPLE_PERMISSION_PRESET_OPTIONS.filter((option) =>
      host.presets.includes(option.id),
    ),
    canCustomize:
      locallyCustomizable &&
      host.presets.includes('custom') &&
      providerPart !== null,
    codexApprovalPolicyItems: CODEX_APPROVAL_POLICY_OPTIONS.filter((option) =>
      host.codex?.approvalPolicies.includes(option.id),
    ),
    codexSandboxItems: CODEX_SANDBOX_OPTIONS.flatMap((option) => {
      if (!host.codex?.sandboxModes.includes(option.id)) return []
      const runsAs = effective[option.id]
      if (runsAs === null) return []
      if (runsAs === undefined || runsAs === option.id) return [option]
      return [
        {
          ...option,
          description: `${option.description} Runs as ${sandboxLabel(runsAs)} on this host.`,
        },
      ]
    }),
    claudeCodePermissionModeItems: CLAUDE_CODE_PERMISSION_MODE_OPTIONS.filter(
      (option) => host.claudeCode?.permissionModes.includes(option.id),
    ),
  }
}

/**
 * The preset a new session on this host should start on: the host's default
 * when the host offers it, otherwise the other simple preset when that one is
 * offered (MAR-4272). A host that offers neither keeps the default, and its
 * own start refusal says why.
 */
export function offeredDefaultPermissionPreset(
  preferred: 'ask' | 'yolo',
  host: ProviderHostPermissions | null | undefined,
): 'ask' | 'yolo' {
  if (!host || host.presets.includes(preferred)) return preferred
  const other = preferred === 'ask' ? 'yolo' : 'ask'
  return host.presets.includes(other) ? other : preferred
}

/**
 * The Codex sandbox a permission config asks for: the protocol's own reading
 * of the presets (Ask is `workspace-write`, Yolo `danger-full-access`), and
 * a Custom config's own sandbox.
 */
export function codexSandboxAskedFor(
  config: SessionPermissionConfig,
): CodexSandboxMode {
  if (config.preset === 'yolo') return 'danger-full-access'
  if (config.preset === 'custom' && config.codex) return config.codex.sandbox
  return 'workspace-write'
}

/**
 * What a Codex session about to start on this host would really run with,
 * when that is not what it asks for (MAR-4272).
 *
 * A host may raise a sandbox: where a container or the machine itself is the
 * boundary, `workspace-write` runs as `danger-full-access`, so Ask runs
 * with full access there. Said before the start, because after it the session
 * already has that access. Null when the provider is not Codex, when the host
 * runs the sandbox as asked, and when the host does not speak for it -- an
 * unknown is not a raise, and saying one would be this app guessing.
 */
export function describeHostSandbox(input: {
  providerId: string | null
  config: SessionPermissionConfig
  host: ProviderHostPermissions | null | undefined
  hostLabel: string
}): string | null {
  if (input.providerId !== 'codex' || !input.host?.codex) return null
  const asked = codexSandboxAskedFor(input.config)
  const runsAs = input.host.codex.effectiveSandboxModes[asked]
  if (runsAs === undefined || runsAs === asked) return null
  if (runsAs === null) {
    return `${input.hostLabel} does not offer Codex's ${sandboxLabel(asked)} sandbox.`
  }
  return `${input.hostLabel} runs Codex's ${sandboxLabel(asked)} sandbox as ${sandboxLabel(runsAs)}.`
}
