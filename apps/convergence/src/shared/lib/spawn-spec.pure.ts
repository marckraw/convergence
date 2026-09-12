import { namesThisMachine } from './execution-host-id.pure'
import {
  decodeSessionWorkAddress,
  namesAConcreteWorkPlace,
  type SessionWorkAddress,
} from './work-address.pure'

/** MAR-2689's refusal, shared by the recipe normalizer and import reader. */
export const REMOTE_SPAWN_PROJECT_REQUIRED =
  'An errand on a remote host belongs to a project'

export const REMOTE_SPAWN_PLACE_REQUIRED =
  'A session on a remote execution host has to be told where it works. ' +
  'Pick a Project or a repository in the composer before starting it — ' +
  'starting it without one would run it somewhere nobody named.'

export const MAX_ROLE_CARD_LENGTH = 8000

/** The birth requirements shared by the stored recipe and its draft. */
export function spawnSpecProblem(spec: {
  projectId: string | null
  executionHost?: string
  workAddress?: SessionWorkAddress | null
  roleCard?: string | null
}): string | null {
  if ((spec.roleCard?.trim().length ?? 0) > MAX_ROLE_CARD_LENGTH)
    return `A role card cannot be longer than ${MAX_ROLE_CARD_LENGTH} characters`
  if (namesThisMachine(spec.executionHost)) return null
  if (!spec.projectId?.trim()) return REMOTE_SPAWN_PROJECT_REQUIRED
  const decoded = decodeSessionWorkAddress(spec.workAddress)
  if (decoded.status === 'malformed') return decoded.reason
  const address = decoded.status === 'decoded' ? decoded.address : null
  return namesAConcreteWorkPlace(address) ? null : REMOTE_SPAWN_PLACE_REQUIRED
}
