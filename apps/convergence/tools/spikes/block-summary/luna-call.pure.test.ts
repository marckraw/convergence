import { describe, expect, it } from 'vitest'
import {
  buildLunaOneShotInput,
  LUNA_ONE_SHOT_TIMEOUT_MS,
  parseLunaEffort,
  redactForReport,
  selectCodexBinary,
} from './luna-call.pure'

describe('luna one-shot call', () => {
  it('accepts only the three efforts', () => {
    expect(parseLunaEffort(['--effort', 'low'])).toBe('low')
    expect(parseLunaEffort(['--effort', 'medium'])).toBe('medium')
    expect(parseLunaEffort(['--effort', 'high'])).toBe('high')
    expect(() => parseLunaEffort(['--effort', 'max'])).toThrow(/Usage/)
    expect(() => parseLunaEffort([])).toThrow(/Usage/)
  })

  it('calls gpt-6-luna on the ambient account with no write permissions', () => {
    expect(
      buildLunaOneShotInput({
        prompt: 'Work block:\n{}',
        effort: 'low',
        workingDirectory: '/tmp/luna',
        requestId: 'req-1',
      }),
    ).toEqual({
      prompt: 'Work block:\n{}',
      modelId: 'gpt-6-luna',
      effort: 'low',
      workingDirectory: '/tmp/luna',
      timeoutMs: LUNA_ONE_SHOT_TIMEOUT_MS,
      requestId: 'req-1',
      providerAccountId: null,
      permissionConfig: {
        preset: 'custom',
        codex: { approvalPolicy: 'never', sandbox: 'read-only' },
      },
    })
  })

  it('skips a Codex binary the app-server gate refuses', () => {
    const picked = selectCodexBinary(
      [
        { binaryPath: '/old/codex', version: '0.142.0' },
        { binaryPath: '/new/codex', version: '0.156.1' },
      ],
      (version) => version !== '0.142.0',
    )
    expect(picked.binaryPath).toBe('/new/codex')
    expect(() =>
      selectCodexBinary(
        [{ binaryPath: '/old/codex', version: '0.142.0' }],
        () => false,
      ),
    ).toThrow(/0\.142\.0/)
  })

  it('redacts credential-shaped text before it is stored', () => {
    expect(redactForReport('denied sk-live-secret-value')).toBe(
      'denied [redacted]',
    )
    expect(redactForReport('Authorization Bearer abc.def.ghi')).toBe(
      'Authorization Bearer [redacted]',
    )
  })
})
