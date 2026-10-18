import { describe, expect, it } from 'vitest'
import {
  CODEX_SANDBOX_OPTIONS,
  codexSandboxAskedFor,
  defaultCustomPermissionConfigForProvider,
  describeHostSandbox,
  getSimplePermissionPreset,
  offeredDefaultPermissionPreset,
  resolvePermissionChoices,
  resolveSimplePermissionConfig,
  withClaudeCodePermissionMode,
  withCodexApprovalPolicy,
  withCodexSandbox,
} from './session-permissions.pure'
import type { ProviderHostPermissions } from './session.types'

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

/**
 * A host's own permission choices (MAR-4272). The container host case is the
 * one the ticket names: Codex's workspace-write runs as danger-full-access
 * there, so Ask runs with full access, and that must be said before the start.
 */
describe('permission choices on a host that states its own', () => {
  const CONTAINER_HOST: ProviderHostPermissions = {
    presets: ['ask', 'yolo', 'custom'],
    codex: {
      approvalPolicies: ['on-request', 'never'],
      sandboxModes: ['read-only', 'workspace-write', 'danger-full-access'],
      effectiveSandboxModes: {
        'read-only': null,
        'workspace-write': 'danger-full-access',
        'danger-full-access': 'danger-full-access',
      },
    },
    claudeCode: null,
  }

  it("leaves this app's own choices standing where the host says nothing", () => {
    const choices = resolvePermissionChoices('codex', null)
    expect(choices.presetItems.map((item) => item.id)).toEqual(['ask', 'yolo'])
    expect(choices.canCustomize).toBe(true)
    expect(choices.codexSandboxItems).toBe(CODEX_SANDBOX_OPTIONS)
  })

  it("offers the host's choices, without a sandbox it does not offer, and marks a raised one", () => {
    const choices = resolvePermissionChoices('codex', CONTAINER_HOST)
    expect(choices.codexApprovalPolicyItems.map((item) => item.id)).toEqual([
      'on-request',
      'never',
    ])
    expect(
      choices.codexSandboxItems.map((item) => [item.id, item.description]),
    ).toEqual([
      [
        'workspace-write',
        'Allow writes in the active workspace. Runs as Full access on this host.',
      ],
      ['danger-full-access', 'Disable sandbox restrictions.'],
    ])
  })

  it('offers no Custom where the host has no preset or no part for the provider', () => {
    expect(
      resolvePermissionChoices('claude-code', CONTAINER_HOST).canCustomize,
    ).toBe(false)
    expect(
      resolvePermissionChoices('codex', {
        ...CONTAINER_HOST,
        presets: ['ask', 'yolo'],
      }).canCustomize,
    ).toBe(false)
    expect(
      resolvePermissionChoices('codex', {
        ...CONTAINER_HOST,
        presets: ['ask'],
      }).presetItems.map((item) => item.id),
    ).toEqual(['ask'])
  })

  it('reads the sandbox each preset asks for as the protocol does', () => {
    expect(codexSandboxAskedFor({ preset: 'ask' })).toBe('workspace-write')
    expect(codexSandboxAskedFor({ preset: 'yolo' })).toBe('danger-full-access')
    expect(
      codexSandboxAskedFor({
        preset: 'custom',
        codex: { approvalPolicy: 'never', sandbox: 'read-only' },
      }),
    ).toBe('read-only')
  })

  it('says, before the start, that Ask runs with full access on a container host', () => {
    // Mutation: compare the effective sandbox to itself, or skip the
    // lookup, and this goes null -- the start would say nothing.
    expect(
      describeHostSandbox({
        providerId: 'codex',
        config: { preset: 'ask' },
        host: CONTAINER_HOST,
        hostLabel: 'kuba-vps',
      }),
    ).toBe("kuba-vps runs Codex's Workspace write sandbox as Full access.")
  })

  it('says a sandbox the host does not offer', () => {
    expect(
      describeHostSandbox({
        providerId: 'codex',
        config: {
          preset: 'custom',
          codex: { approvalPolicy: 'never', sandbox: 'read-only' },
        },
        host: CONTAINER_HOST,
        hostLabel: 'kuba-vps',
      }),
    ).toBe("kuba-vps does not offer Codex's Read only sandbox.")
  })

  it('says nothing when it runs as asked, when the host does not speak for it, or for another provider', () => {
    const base = { host: CONTAINER_HOST, hostLabel: 'kuba-vps' }
    expect(
      describeHostSandbox({
        ...base,
        providerId: 'codex',
        config: { preset: 'yolo' },
      }),
    ).toBeNull()
    expect(
      describeHostSandbox({
        ...base,
        providerId: 'codex',
        config: { preset: 'ask' },
        host: {
          ...CONTAINER_HOST,
          codex: { ...CONTAINER_HOST.codex!, effectiveSandboxModes: {} },
        },
      }),
    ).toBeNull()
    expect(
      describeHostSandbox({
        ...base,
        providerId: 'claude-code',
        config: { preset: 'ask' },
      }),
    ).toBeNull()
    expect(
      describeHostSandbox({
        ...base,
        providerId: 'codex',
        config: { preset: 'ask' },
        host: null,
      }),
    ).toBeNull()
  })

  it("starts a new session on the host's default only when the host offers it", () => {
    expect(offeredDefaultPermissionPreset('yolo', null)).toBe('yolo')
    expect(offeredDefaultPermissionPreset('yolo', CONTAINER_HOST)).toBe('yolo')
    expect(
      offeredDefaultPermissionPreset('yolo', {
        ...CONTAINER_HOST,
        presets: ['ask', 'custom'],
      }),
    ).toBe('ask')
    expect(
      offeredDefaultPermissionPreset('yolo', {
        ...CONTAINER_HOST,
        presets: ['custom'],
      }),
    ).toBe('yolo')
  })
})
