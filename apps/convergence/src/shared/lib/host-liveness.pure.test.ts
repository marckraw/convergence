import { expect, it } from 'vitest'
import { hostLivenessLabel } from './host-liveness.pure'
it('uses host age, minute bands and absence — mutation use seconds below a minute turns red', () => {
  const now = Date.parse('2026-09-15T12:00:00Z')
  expect(hostLivenessLabel('lm', '2026-09-15T11:58:30Z', now)).toBe(
    'host · 1m ago',
  )
  expect(hostLivenessLabel('lm', '2026-09-15T11:59:45Z', now)).toBe(
    'host · <1m ago',
  )
  expect(hostLivenessLabel('lm', null, now)).toBe('host · not recorded')
  expect(hostLivenessLabel('lm', 'invalid', now)).toBe('host · not recorded')
  expect(hostLivenessLabel('local', '2026-09-15T11:58:30Z', now)).toBeNull()
})
