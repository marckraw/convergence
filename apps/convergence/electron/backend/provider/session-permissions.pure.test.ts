import { describe, expect, it } from 'vitest'
import {
  normalizeSessionPermissionConfig,
  resolveClaudeCodePermissionMode,
  resolveCodexPermissionConfig,
} from './session-permissions.pure'

describe('session permission config', () => {
  it('maps ask defaults to provider-safe modes', () => {
    expect(resolveCodexPermissionConfig({ preset: 'ask' })).toEqual({
      approvalPolicy: 'on-request',
      sandbox: 'workspace-write',
    })
    expect(resolveClaudeCodePermissionMode({ preset: 'ask' })).toBe('default')
  })

  it('maps yolo to provider bypass modes', () => {
    expect(resolveCodexPermissionConfig({ preset: 'yolo' })).toEqual({
      approvalPolicy: 'never',
      sandbox: 'danger-full-access',
    })
    expect(resolveClaudeCodePermissionMode({ preset: 'yolo' })).toBe(
      'bypassPermissions',
    )
  })

  it('normalizes custom provider-specific controls', () => {
    const config = normalizeSessionPermissionConfig({
      preset: 'custom',
      codex: {
        approvalPolicy: 'untrusted',
        sandbox: 'read-only',
      },
      claudeCode: {
        permissionMode: 'plan',
      },
    })

    expect(resolveCodexPermissionConfig(config)).toEqual({
      approvalPolicy: 'untrusted',
      sandbox: 'read-only',
    })
    expect(resolveClaudeCodePermissionMode(config)).toBe('plan')
  })
})
