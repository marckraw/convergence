import { describe, expect, it } from 'vitest'
import type { ProviderExecutionHost } from './execution-host.types'

export interface ExecutionHostContractContext {
  host: ProviderExecutionHost
  /** A conversational provider with continuation and one-shot support. */
  fullProviderId: string
  /** A provider without one-shot support. */
  noOneShotProviderId: string
  unknownProviderId: string
}

/**
 * Shared contract suite for Provider Execution Host adapters. Every adapter
 * (local or remote) must pass this suite unchanged — it pins the interface
 * invariants documented in execution-host.types.ts, so callers like
 * SessionService can treat adapters as interchangeable.
 */
export function describeProviderExecutionHostContract(
  adapterName: string,
  setup: () => ExecutionHostContractContext,
): void {
  describe(`ProviderExecutionHost contract: ${adapterName}`, () => {
    it('lists capabilities for every available provider', () => {
      const ctx = setup()
      const ids = ctx.host.capabilities().map((c) => c.providerId)
      expect(ids).toContain(ctx.fullProviderId)
      expect(ids).toContain(ctx.noOneShotProviderId)
    })

    it('reports per-provider capabilities consistent with the full list', () => {
      const ctx = setup()
      const fromList = ctx.host
        .capabilities()
        .find((c) => c.providerId === ctx.fullProviderId)
      expect(ctx.host.capabilitiesFor(ctx.fullProviderId)).toEqual(fromList)
    })

    it('reports one-shot and continuation support in capabilities', () => {
      const ctx = setup()
      expect(ctx.host.capabilitiesFor(ctx.fullProviderId)).toMatchObject({
        supportsContinuation: true,
        supportsOneShot: true,
      })
      expect(ctx.host.capabilitiesFor(ctx.noOneShotProviderId)).toMatchObject({
        supportsOneShot: false,
      })
    })

    it('returns null capabilities for unknown providers', () => {
      const ctx = setup()
      expect(ctx.host.capabilitiesFor(ctx.unknownProviderId)).toBeNull()
    })

    it('describes every available provider', async () => {
      const ctx = setup()
      const descriptors = await ctx.host.describe()
      expect(descriptors.map((d) => d.id)).toContain(ctx.fullProviderId)
    })

    it('starts a session and returns a live handle', () => {
      const ctx = setup()
      const handle = ctx.host.start(ctx.fullProviderId, {
        sessionId: 'contract-session',
        workingDirectory: '/tmp',
        initialMessage: 'hello',
        model: null,
        effort: null,
        continuationToken: null,
      })
      expect(typeof handle.sendMessage).toBe('function')
      expect(typeof handle.approve).toBe('function')
      expect(typeof handle.deny).toBe('function')
      expect(typeof handle.onDelta).toBe('function')
      handle.stop()
    })

    it('throws the canonical error when starting an unknown provider', () => {
      const ctx = setup()
      expect(() =>
        ctx.host.start(ctx.unknownProviderId, {
          sessionId: 'contract-session',
          workingDirectory: '/tmp',
          initialMessage: 'hello',
          model: null,
          effort: null,
          continuationToken: null,
        }),
      ).toThrow(`Provider not found: ${ctx.unknownProviderId}`)
    })

    it('runs a one-shot execution on a capable provider', async () => {
      const ctx = setup()
      const result = await ctx.host.oneShot(ctx.fullProviderId, {
        prompt: 'ping',
        modelId: 'test-model',
        workingDirectory: '/tmp',
      })
      expect(typeof result.text).toBe('string')
    })

    it('rejects one-shot for unknown providers with the canonical error', async () => {
      const ctx = setup()
      await expect(
        ctx.host.oneShot(ctx.unknownProviderId, {
          prompt: 'ping',
          modelId: 'test-model',
          workingDirectory: '/tmp',
        }),
      ).rejects.toThrow(`Provider not found: ${ctx.unknownProviderId}`)
    })

    it('rejects one-shot for providers without one-shot support', async () => {
      const ctx = setup()
      await expect(
        ctx.host.oneShot(ctx.noOneShotProviderId, {
          prompt: 'ping',
          modelId: 'test-model',
          workingDirectory: '/tmp',
        }),
      ).rejects.toThrow(
        `Provider ${ctx.noOneShotProviderId} does not support one-shot execution`,
      )
    })
  })
}
