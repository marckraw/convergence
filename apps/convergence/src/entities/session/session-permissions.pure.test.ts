import { describe, expect, it } from 'vitest'
import {
  defaultCustomPermissionConfigForProvider,
  getSimplePermissionPreset,
  resolveSimplePermissionConfig,
  withClaudeCodePermissionMode,
  withCodexApprovalPolicy,
  withCodexSandbox,
} from './session-permissions.pure'

describe('session permission helpers', () => {
  it('resolves simple permission presets', () => {
    expect(resolveSimplePermissionConfig('ask')).toEqual({ preset: 'ask' })
    expect(resolveSimplePermissionConfig('yolo')).toEqual({ preset: 'yolo' })
    expect(getSimplePermissionPreset({ preset: 'custom' })).toBe('ask')
    expect(getSimplePermissionPreset({ preset: 'yolo' })).toBe('yolo')
  })

  it('builds provider-specific custom defaults', () => {
    expect(defaultCustomPermissionConfigForProvider('codex')).toEqual({
      preset: 'custom',
      codex: {
        approvalPolicy: 'on-request',
        sandbox: 'workspace-write',
      },
    })
    expect(defaultCustomPermissionConfigForProvider('claude-code')).toEqual({
      preset: 'custom',
      claudeCode: {
        permissionMode: 'default',
      },
    })
    expect(defaultCustomPermissionConfigForProvider('pi')).toEqual({
      preset: 'ask',
    })
  })

  it('updates Codex custom controls', () => {
    const config = withCodexSandbox(
      withCodexApprovalPolicy({ preset: 'ask' }, 'never'),
      'danger-full-access',
    )

    expect(config).toEqual({
      preset: 'custom',
      codex: {
        approvalPolicy: 'never',
        sandbox: 'danger-full-access',
      },
    })
  })

  it('updates Claude Code custom permission mode', () => {
    expect(
      withClaudeCodePermissionMode({ preset: 'ask' }, 'bypassPermissions'),
    ).toEqual({
      preset: 'custom',
      claudeCode: {
        permissionMode: 'bypassPermissions',
      },
    })
  })
})
