import { namesThisMachine } from '../../../src/shared/lib/execution-host-id.pure'
import { describeNonStringExecutionHostId } from './provider-catalog.pure'
import {
  describeInvalidExecutionHostEndpointId,
  isExecutionHostEndpointId,
  LOCAL_EXECUTION_HOST_ID,
} from '../execution-host-endpoint/execution-host-endpoint.pure'
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
   * Which values mean this machine is `namesThisMachine`'s answer, not this
   * door's: exactly `undefined`, `null`, the empty string and the literal
   * `'local'`, by the one predicate the renderer door calls as well. A caller
   * that has not been taught about Endpoints says nothing and keeps getting
   * exactly what it got before they existed.
   *
   * Every other value is one the caller *means*, and is taken exactly as it was
   * sent or refused by name. It used to go through `isLocalExecutionHost`,
   * which trims -- so ` local ` was answered as this machine, reinstating at a
   * new door precisely what S2 killed at the old one: "it used to be trimmed,
   * which is a quiet rewrite of the one value that must not be rewritten"
   * (`normalizeExecutionHostEndpoints`). Padded local gets no gentler a reading
   * than padded ` kuba `: neither names a machine, and answering either would
   * answer, for a machine, a question asked about a different string.
   *
   * `parseExecutionHostId` still reads absent *or blank* as local, and that is
   * right where it is used -- reading a session row written before Endpoints
   * existed, where blank is the absence of a value. This is not that. This is a
   * live request naming a machine, and whitespace is a value.
   *
   * The parameter is `unknown` because that is what comes off IPC. A declared
   * `string` here is a claim about the renderer, not a fact about the wire, and
   * the `String(...)` that used to stand in for the check turned a non-string
   * into a catalog about a machine named after its own coercion.
   */
  async get(executionHostId?: unknown): Promise<ProviderCatalog> {
    // The four values that mean this machine, asked of the one predicate the
    // renderer door calls too. Read here for itself, this door and that one
    // drifted three times running (MAR-2682).
    if (namesThisMachine(executionHostId)) {
      return this.localCatalog()
    }

    if (typeof executionHostId !== 'string') {
      const named = describeNonStringExecutionHostId(executionHostId)
      return unreachable(
        named,
        `Execution host id ${named} is not usable: an id is a string, and a ` +
          'value that is not one names no machine. Reading it as this machine ' +
          'would answer for a laptop about a request that meant a daemon.',
      )
    }

    // A real value the caller means. Reported rather than thrown: `get` answers
    // every other bad id with a catalog that says why, and an id that is not
    // one is not a worse case than an id nobody configured.
    const endpointId = executionHostId
    if (!isExecutionHostEndpointId(endpointId)) {
      return unreachable(
        endpointId,
        describeInvalidExecutionHostEndpointId(endpointId),
      )
    }

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
