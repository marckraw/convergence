import type {
  ClaudeCodePermissionMode,
  CodexApprovalPolicy,
  CodexSandboxMode,
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
