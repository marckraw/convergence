import { readExecutionHostIdAtDoor } from './execution-host-id-door.pure'
import { LOCAL_EXECUTION_HOST_ID } from '../execution-host-endpoint/execution-host-endpoint.pure'
import type { RemoteExecutionHost } from './execution-host/remote-execution-host'
import type { ProviderDescriptor } from './provider.types'
import type {
  ProviderCatalog,
  ProviderCatalogEntry,
} from './provider-catalog.types'

export interface ProviderCatalogServiceDeps {
  /** This machine's registry, read through the same `describe()` a host gives. */
  local: { describe: () => Promise<ProviderDescriptor[]> }
  /** The local-only descriptor filtering the app settings apply. */
  filterLocalDescriptors: (
    descriptors: ProviderDescriptor[],
  ) => ProviderDescriptor[]
  /**
   * The Endpoints currently configured, and the host for one of them. Absent
   * when the app runs without remote execution at all, in which case every
   * catalog is this machine's.
   */
  remote?: {
    listEndpointIds: () => Promise<string[]>
    hostFor: (
      endpointId: string,
    ) => Pick<RemoteExecutionHost, 'describeCatalog'>
  }
}

/**
 * What one machine offers, asked of that machine (MAR-2682).
 *
 * The Execution Bar names where a session will run; this is what makes the
 * option row above it able to obey. Before this existed the provider list came
 * from `providerRegistry.getAll()` no matter which machine the strip named, so
 * a daemon that runs three CLIs was offered every CLI installed here -- the
 * contradiction MAR-2619 exists to end.
 *
 * Every catalog carries the id of the machine it was read from. That is the
 * load-bearing field: a list of providers is only true of one machine, and a
 * caller holding one with no name on it cannot tell whether it still applies.
 */
export class ProviderCatalogService {
  constructor(private readonly deps: ProviderCatalogServiceDeps) {}

  /**
   * The catalog for one machine, and the door an execution host id arrives at
   * from the renderer (MAR-2682).
   *
   * Which values mean this machine, which are Endpoint ids and which name no
   * machine at all is `readExecutionHostIdAtDoor`'s answer, not this door's --
   * the same ladder the Projects catalog climbs, so the two cannot come to read
   * one id differently (MAR-2689). Its docblock is where the reasoning lives;
   * restating it here is how a second reading gets written.
   *
   * `parseExecutionHostId` still reads absent *or blank* as local, and that is
   * right where it is used -- reading a session row written before Endpoints
   * existed, where blank is the absence of a value. This is not that. This is a
   * live request naming a machine, and whitespace is a value.
   */
  async get(executionHostId?: unknown): Promise<ProviderCatalog> {
    // The one ladder both per-machine doors climb (MAR-2689). Reported rather
    // than thrown: `get` answers every other bad id with a catalog that says
    // why, and an id that is not one is not a worse case than an id nobody
    // configured.
    const named = readExecutionHostIdAtDoor(executionHostId)
    if (named.kind === 'local') return this.localCatalog()
    if (named.kind === 'unusable') {
      return unreachable(named.named, named.reason)
    }

    const endpointId = named.endpointId
    const remote = this.deps.remote
    if (!remote) {
      return unreachable(
        endpointId,
        'Remote execution is not available in this app runtime.',
      )
    }

    // Asked before a host is built, so a stale or mistyped id cannot mint a
    // host -- and cannot be answered with a catalog either. An Endpoint that is
    // not configured has no providers, and saying "none" without saying why
    // would read as a daemon that runs nothing.
    const endpointIds = await remote.listEndpointIds()
    if (!endpointIds.includes(endpointId)) {
      return unreachable(
        endpointId,
        `Execution host endpoint "${endpointId}" is not configured, so its ` +
          'providers cannot be listed.',
      )
    }

    const catalog = await remote.hostFor(endpointId).describeCatalog()
    return { executionHostId: endpointId, ...catalog }
  }

  /**
   * This machine's providers, exactly as `provider:getAll` served them before
   * catalogs were per-host: the registry's descriptors with the app settings'
   * local filtering applied, and nothing blocked. Local is byte-identical by
   * construction rather than by resemblance (MAR-2682, "a Local row does
   * not change").
   */
  private async localCatalog(): Promise<ProviderCatalog> {
    const descriptors = this.deps.filterLocalDescriptors(
      await this.deps.local.describe(),
    )
    return {
      executionHostId: LOCAL_EXECUTION_HOST_ID,
      providers: descriptors.map(
        (descriptor): ProviderCatalogEntry => ({
          descriptor,
          blockedReason: null,
        }),
      ),
      unreachableReason: null,
    }
  }
}

function unreachable(
  executionHostId: string,
  unreachableReason: string,
): ProviderCatalog {
  return { executionHostId, providers: [], unreachableReason }
}
