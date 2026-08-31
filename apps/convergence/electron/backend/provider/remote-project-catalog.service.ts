import { readExecutionHostIdAtDoor } from './execution-host-id-door.pure'
import { LOCAL_EXECUTION_HOST_ID } from '../execution-host-endpoint/execution-host-endpoint.pure'
import type { RemoteExecutionHost } from './execution-host/remote-execution-host'
import type { RemoteProjectCatalog } from './execution-host/remote-project.types'

export interface RemoteProjectCatalogServiceDeps {
  /**
   * The Endpoints currently configured, and the host for one of them. Absent
   * when the app runs without remote execution at all, in which case no
   * machine has Projects.
   */
  remote?: {
    listEndpointIds: () => Promise<string[]>
    hostFor: (
      endpointId: string,
    ) => Pick<RemoteExecutionHost, 'describeProjectCatalog'>
  }
}

/**
 * Where one machine can work, asked of that machine (MAR-2689).
 *
 * The Execution Bar names the machine; this is what lets the slot beside it
 * name the *place on* that machine. Until now a remote start derived its place
 * silently from the session's own project — it sent that project's git origin
 * and nothing else — so a session born in the Convergence project told a daemon
 * to clone Convergence, whatever the human meant. Nothing showed it and nothing
 * could be chosen.
 *
 * Deliberately its own service rather than a second method on
 * `ProviderCatalogService`: they answer different questions about the same
 * machine, at different cadences, and a machine that offers no Projects is a
 * normal machine. What they share is the id ladder, and that is shared as a
 * value (`readExecutionHostIdAtDoor`) rather than by living in one class.
 *
 * Local has no Projects, and that is a listing rather than a refusal: this
 * machine is where a local session already runs, so there is no place to
 * choose and nothing to say. The slot renders nothing for it, which is what
 * keeps a Local composer byte-identical (MAR-2682, "a Local row does not
 * change").
 */
export class RemoteProjectCatalogService {
  constructor(private readonly deps: RemoteProjectCatalogServiceDeps) {}

  async get(executionHostId?: unknown): Promise<RemoteProjectCatalog> {
    const named = readExecutionHostIdAtDoor(executionHostId)
    if (named.kind === 'local') return localCatalog()
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
    // not configured has no Projects, and saying "none" without saying why
    // would read as a daemon that offers none.
    const endpointIds = await remote.listEndpointIds()
    if (!endpointIds.includes(endpointId)) {
      return unreachable(
        endpointId,
        `Execution host endpoint "${endpointId}" is not configured, so its ` +
          'projects cannot be listed.',
      )
    }

    const catalog = await remote.hostFor(endpointId).describeProjectCatalog()
    return { executionHostId: endpointId, ...catalog }
  }
}

/** This machine: no Projects to offer, and nothing wrong with that. */
function localCatalog(): RemoteProjectCatalog {
  return {
    executionHostId: LOCAL_EXECUTION_HOST_ID,
    supported: false,
    projects: [],
    unreachableReason: null,
  }
}

function unreachable(
  executionHostId: string,
  unreachableReason: string,
): RemoteProjectCatalog {
  return {
    executionHostId,
    supported: false,
    projects: [],
    unreachableReason,
  }
}
