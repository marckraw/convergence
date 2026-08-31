import type {
  ClaudeCodePermissionMode,
  CodexApprovalPolicy,
  CodexSandboxMode,
  SessionPermissionConfig,
  SessionPermissionPreset,
} from './provider.types'

export const DEFAULT_SESSION_PERMISSION_CONFIG: SessionPermissionConfig = {
  preset: 'ask',
}

const CODEX_APPROVAL_POLICIES = new Set<CodexApprovalPolicy>([
  'untrusted',
  'on-request',
  'never',
])

const CODEX_SANDBOX_MODES = new Set<CodexSandboxMode>([
  'read-only',
  'workspace-write',
  'danger-full-access',
])

const CLAUDE_CODE_PERMISSION_MODES = new Set<ClaudeCodePermissionMode>([
  'default',
  'acceptEdits',
  'auto',
  'dontAsk',
  'plan',
  'bypassPermissions',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizePreset(value: unknown): SessionPermissionPreset {
  return value === 'yolo' || value === 'custom' ? value : 'ask'
}

function normalizeCodexConfig(
  value: unknown,
): SessionPermissionConfig['codex'] | undefined {
  if (!isRecord(value)) return undefined
  const approvalPolicy = CODEX_APPROVAL_POLICIES.has(
    value.approvalPolicy as CodexApprovalPolicy,
  )
    ? (value.approvalPolicy as CodexApprovalPolicy)
    : null
  const sandbox = CODEX_SANDBOX_MODES.has(value.sandbox as CodexSandboxMode)
    ? (value.sandbox as CodexSandboxMode)
    : null

  if (!approvalPolicy || !sandbox) return undefined
  return { approvalPolicy, sandbox }
}

function normalizeClaudeCodeConfig(
  value: unknown,
): SessionPermissionConfig['claudeCode'] | undefined {
  if (!isRecord(value)) return undefined
  const permissionMode = CLAUDE_CODE_PERMISSION_MODES.has(
    value.permissionMode as ClaudeCodePermissionMode,
  )
    ? (value.permissionMode as ClaudeCodePermissionMode)
    : null

  return permissionMode ? { permissionMode } : undefined
}

export function normalizeSessionPermissionConfig(
  value: unknown,
): SessionPermissionConfig {
  if (!isRecord(value)) return DEFAULT_SESSION_PERMISSION_CONFIG

  const preset = normalizePreset(value.preset)
  const codex = normalizeCodexConfig(value.codex)
  const claudeCode = normalizeClaudeCodeConfig(value.claudeCode)

  return {
    preset,
    ...(codex ? { codex } : {}),
    ...(claudeCode ? { claudeCode } : {}),
  }
}

export function parseSessionPermissionConfig(
  raw: string | null | undefined,
): SessionPermissionConfig {
  if (!raw) return DEFAULT_SESSION_PERMISSION_CONFIG

  try {
    return normalizeSessionPermissionConfig(JSON.parse(raw) as unknown)
  } catch {
    return DEFAULT_SESSION_PERMISSION_CONFIG
  }
}

export function serializeSessionPermissionConfig(value: unknown): string {
  return JSON.stringify(normalizeSessionPermissionConfig(value))
}

export function resolveCodexPermissionConfig(
  value: SessionPermissionConfig | null | undefined,
): { approvalPolicy: CodexApprovalPolicy; sandbox: CodexSandboxMode } {
  const config = normalizeSessionPermissionConfig(value)

  if (config.preset === 'yolo') {
    return {
      approvalPolicy: 'never',
      sandbox: 'danger-full-access',
    }
  }

  if (config.preset === 'custom' && config.codex) {
    return config.codex
  }

  return {
    approvalPolicy: 'on-request',
    sandbox: 'workspace-write',
  }
}

export function resolveClaudeCodePermissionMode(
  value: SessionPermissionConfig | null | undefined,
): ClaudeCodePermissionMode {
  const config = normalizeSessionPermissionConfig(value)

  if (config.preset === 'yolo') {
    return 'bypassPermissions'
  }

  if (config.preset === 'custom' && config.claudeCode) {
    return config.claudeCode.permissionMode
  }

  return 'default'
}
