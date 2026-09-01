import { normalizeGitHubRemoteUrl } from '@/shared/lib/git-origin.pure'
import type { ProviderCatalogSource } from './provider-catalog.pure'

/**
 * One Project on one machine (MAR-2689). Mirrors `RemoteProject` in
 * `@convergence/execution-host-client` (MAR-2737).
 *
 * Still a mirror rather than an import, and for the reason it always was: the
 * renderer learns about a remote Project over IPC, so what it declares is the
 * shape of the message it receives. Importing the client core here would put a
 * main-process module in the renderer's graph to save a seven-line interface.
 */
export interface RemoteProject {
  id: string
  name: string
  workingDirectory: string
  origin: string | null
}

/** Every Project one machine offers, carrying which machine that is. */
export interface RemoteProjectCatalog {
  executionHostId: string
  supported: boolean
  projects: RemoteProject[]
  unreachableReason: string | null
}

/**
 * A Projects catalog and what is known about it, in every state it can be in
 * (MAR-2689).
 *
 * Each state carries the source it belongs to -- landed, pending and failed
 * alike -- for the reason the provider catalog learned the hard way: two
 * Endpoints are asked concurrently the moment he switches between them, and a
 * `pending` marker with no source on it lets one machine's round trip be read
 * as the other's.
 */
export type RemoteProjectCatalogState =
  | { status: 'pending'; source: ProviderCatalogSource }
  | {
      status: 'landed'
      source: ProviderCatalogSource
      supported: boolean
      projects: RemoteProject[]
      unreachableReason: string | null
    }
  | { status: 'failed'; source: ProviderCatalogSource; reason: string }

export type RemoteProjectCatalogs = Record<string, RemoteProjectCatalogState>

/**
 * A Projects catalog that arrived, checked against the machine it was asked of.
 *
 * The echoed `executionHostId` is read here or nowhere, exactly as the provider
 * catalog reads its own: a field nothing compares is a comment, not a guard. A
 * reply that names another machine is refused rather than trusted for this one,
 * and refused *as a failure* rather than dropped -- a silent drop would leave
 * the source pending forever and the slot asking a machine that has already
 * answered.
 */
export function landedRemoteProjectCatalog(
  source: ProviderCatalogSource,
  catalog: RemoteProjectCatalog,
): RemoteProjectCatalogState {
  if (catalog.executionHostId !== source.executionHostId) {
    return {
      status: 'failed',
      source,
      reason:
        `the reply describes "${catalog.executionHostId}", which is not the ` +
        'machine that was asked.',
    }
  }
  return {
    status: 'landed',
    source,
    supported: catalog.supported,
    projects: catalog.projects,
    unreachableReason: catalog.unreachableReason,
  }
}

/**
 * The Project on a machine that holds the same repository as the local one
 * (MAR-2689).
 *
 * Both sides go through `normalizeGitHubRemoteUrl` before they are compared,
 * so `git@github.com:marckraw/new-blok.git` on this laptop and
 * `https://github.com/marckraw/new-blok` on the daemon are recognised as one
 * repository. Comparing the raw strings would make the match depend on how each
 * machine happened to clone, which is not a fact about the repository at all.
 *
 * Null whenever there is nothing to be sure of: no local origin, no Project
 * carrying one (which is every machine until the daemon starts reporting it —
 * MAR-2688), or a genuine absence of a match. Null means *Repository mode*
 * downstream; it never means "pick the first one".
 *
 * The first match wins. Two Projects on one machine can hold the same
 * repository, and nothing here can know which he means — so this preselects one
 * and the chooser stays his to override, rather than inventing a tie-break the
 * daemon never described.
 */
export function remoteProjectMatchingOrigin(
  projects: readonly RemoteProject[],
  localRepository: string | null,
): RemoteProject | null {
  if (!localRepository) return null
  const local = normalizeGitHubRemoteUrl(localRepository)
  if (!local) return null
  return (
    projects.find((project) => {
      if (!project.origin) return false
      return normalizeGitHubRemoteUrl(project.origin) === local
    }) ?? null
  )
}
