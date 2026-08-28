import { describe, expect, it } from 'vitest'
import type { ProviderExecutionHost } from './execution-host.types'

export interface ExecutionHostContractContext {
  host: ProviderExecutionHost
  /**
   * A conversational provider with continuation support. Also one-shot
   * capable unless `hostSupportsOneShot` is false.
   */
  fullProviderId: string
  /** A provider without one-shot support. */
  noOneShotProviderId: string
  unknownProviderId: string
  /**
   * Whether the adapter can run one-shot executions at all. Defaults to
   * true. Adapters without one-shot transport (the remote host until a wire
   * endpoint exists) must advertise `supportsOneShot: false` for every
   * provider and reject one-shot calls with the canonical unsupported error.
   */
  hostSupportsOneShot?: boolean
  /**
   * The id `fullProviderId` carries in this host's *catalog*, when that differs
   * from the id the host is driven by. The remote host is driven with the
   * daemon's ids and describes itself in the local registry's, because a
   * descriptor is what a session is picked from and a session records the local
   * id (MAR-2682). Defaults to `fullProviderId`, which is the local host and
   * every host whose two namespaces are one.
   */
  describedProviderId?: string
}

/**
 * Shared contract suite for Provider Execution Host adapters. Every adapter
 * (local or remote) must pass this suite unchanged — it pins the interface
 * invariants documented in execution-host.types.ts, so callers like
 * SessionService can treat adapters as interchangeable.
 *
 * The vocabulary is the one execution-host.types.ts defines: *listed* is what
 * the host knows about, *runnable* is what it will actually start, *blocked* is
 * the difference. These checks are about the listing; `assertProviderRunnable`
 * is the only one about permission. The word "available" is not used for either
 * — it was, and a reader took a descriptive method for a gate because of it
 * (MAR-2682).
 */
export function describeProviderExecutionHostContract(
  adapterName: string,
  setup: () => ExecutionHostContractContext,
): void {
  describe(`ProviderExecutionHost contract: ${adapterName}`, () => {
    it('summarizes capabilities for every listed provider', () => {
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
        supportsOneShot: ctx.hostSupportsOneShot !== false,
      })
      expect(ctx.host.capabilitiesFor(ctx.noOneShotProviderId)).toMatchObject({
        supportsOneShot: false,
      })
    })

    it('returns null capabilities for unknown providers', () => {
      const ctx = setup()
      expect(ctx.host.capabilitiesFor(ctx.unknownProviderId)).toBeNull()
    })

    it('answers the permission question for a provider it will run', () => {
      const ctx = setup()
      expect(() =>
        ctx.host.assertProviderRunnable(ctx.fullProviderId),
      ).not.toThrow()
    })

    it('refuses an unknown provider by name, not by silence', () => {
      // The same sentence `start` gives, from the method callers ask *before*
      // starting. A gate that answered null here is how "listed and refused"
      // reached a human as "not found" (MAR-2682).
      const ctx = setup()
      expect(() =>
        ctx.host.assertProviderRunnable(ctx.unknownProviderId),
      ).toThrow(`Provider not found: ${ctx.unknownProviderId}`)
    })

    it('describes every listed provider', async () => {
      const ctx = setup()
      const descriptors = await ctx.host.describe()
      expect(descriptors.map((d) => d.id)).toContain(
        ctx.describedProviderId ?? ctx.fullProviderId,
      )
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
      if (ctx.hostSupportsOneShot === false) {
        await expect(
          ctx.host.oneShot(ctx.fullProviderId, {
            prompt: 'ping',
            modelId: 'test-model',
            workingDirectory: '/tmp',
          }),
        ).rejects.toThrow(
          `Provider ${ctx.fullProviderId} does not support one-shot execution`,
        )
        return
      }
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
