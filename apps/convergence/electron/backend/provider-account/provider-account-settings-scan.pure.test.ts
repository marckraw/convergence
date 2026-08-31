import { describe, expect, it } from 'vitest'
import {
  isCredentialShapedEnvName,
  scanSharedSettingsForCredentials,
} from './provider-account-settings-scan.pure'

describe('scanSharedSettingsForCredentials', () => {
  it('says nothing about settings that carry no credential', () => {
    expect(
      scanSharedSettingsForCredentials({
        model: 'opus',
        env: { EDITOR: 'vim', CLAUDE_CODE_ENABLE_TELEMETRY: '1' },
      }),
    ).toEqual([])
  })

  it('warns that apiKeyHelper makes account selection decorative', () => {
    const warnings = scanSharedSettingsForCredentials({
      apiKeyHelper: '/usr/local/bin/get-key.sh',
    })

    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatchObject({
      kind: 'api-key-helper',
      key: 'apiKeyHelper',
    })
    expect(warnings[0].message).toMatch(/outranks subscription OAuth/)
  })

  it('ignores an empty apiKeyHelper', () => {
    expect(scanSharedSettingsForCredentials({ apiKeyHelper: '   ' })).toEqual(
      [],
    )
  })

  it('warns about credentials injected through the settings env block', () => {
    const warnings = scanSharedSettingsForCredentials({
      env: {
        ANTHROPIC_API_KEY: 'sk-ant-in-settings',
        EDITOR: 'vim',
      },
    })

    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatchObject({
      kind: 'credential-env-key',
      key: 'env.ANTHROPIC_API_KEY',
    })
  })

  it('reports every offending key, in a stable order', () => {
    const warnings = scanSharedSettingsForCredentials({
      apiKeyHelper: 'helper.sh',
      env: {
        CLAUDE_CODE_OAUTH_TOKEN: 'x',
        ANTHROPIC_AUTH_TOKEN: 'y',
      },
    })

    expect(warnings.map((warning) => warning.key)).toEqual([
      'apiKeyHelper',
      'env.ANTHROPIC_AUTH_TOKEN',
      'env.CLAUDE_CODE_OAUTH_TOKEN',
    ])
  })

  it('degrades quietly on a missing or malformed settings file', () => {
    expect(scanSharedSettingsForCredentials(null)).toEqual([])
    expect(scanSharedSettingsForCredentials('not json')).toEqual([])
    expect(scanSharedSettingsForCredentials([1, 2, 3])).toEqual([])
    expect(scanSharedSettingsForCredentials({ env: 'nonsense' })).toEqual([])
  })
})

describe('isCredentialShapedEnvName', () => {
  it('recognises the names that outrank subscription OAuth', () => {
    expect(isCredentialShapedEnvName('ANTHROPIC_API_KEY')).toBe(true)
    expect(isCredentialShapedEnvName('CLAUDE_CODE_USE_BEDROCK')).toBe(true)
  })

  it('recognises credential shapes it has never seen', () => {
    expect(isCredentialShapedEnvName('SOME_VENDOR_TOKEN')).toBe(true)
    expect(isCredentialShapedEnvName('MY_SECRET')).toBe(true)
    expect(isCredentialShapedEnvName('DB_PASSWORD')).toBe(true)
    expect(isCredentialShapedEnvName('AWS_KEYS')).toBe(true)
  })

  it('leaves ordinary configuration alone', () => {
    expect(isCredentialShapedEnvName('EDITOR')).toBe(false)
    expect(isCredentialShapedEnvName('MONKEY_BUSINESS')).toBe(false)
    expect(isCredentialShapedEnvName('CLAUDE_CODE_ENABLE_TELEMETRY')).toBe(
      false,
    )
  })
})
