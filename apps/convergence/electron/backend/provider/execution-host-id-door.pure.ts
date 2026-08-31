import { namesThisMachine } from '../../../src/shared/lib/execution-host-id.pure'
import { describeNonStringExecutionHostId } from './provider-catalog.pure'
import {
  describeInvalidExecutionHostEndpointId,
  isExecutionHostEndpointId,
} from '../execution-host-endpoint/execution-host-endpoint.pure'

/**
 * What an execution host id arriving from the renderer turns out to be
 * (MAR-2682, MAR-2689).
 *
 * Three answers and no fourth: this machine, a syntactically usable Endpoint
 * id, or a value that names no machine and says why. `unusable` carries the
 * rendered id as well as the sentence because every caller reports it back on
 * a value keyed by the machine it is about, and a refusal that cannot say
 * which string it refused is a refusal about nothing.
 */
export type ExecutionHostIdAtDoor =
  | { kind: 'local' }
  | { kind: 'endpoint'; endpointId: string }
  | { kind: 'unusable'; named: string; reason: string }

/**
 * Reads an execution host id the way every per-machine door must (MAR-2689).
 *
 * There are two of those doors now — the provider catalog and the Projects
 * catalog — and they ask the identical question in the identical order: is
 * this this machine, is it a string at all, and is the string an Endpoint id.
 * Written out twice, that ladder is a rule in two places, and this codebase
 * already knows what happens then: the renderer door and the main-process door
 * for exactly this id drifted three times running, and each repair fixed the
 * door that had been named (`namesThisMachine`). So the ladder is a value here
 * and the doors read it.
 *
 * The parameter is `unknown` because that is what comes off IPC. A declared
 * `string` is a claim about the renderer, not a fact about the wire.
 *
 * `namesThisMachine` is asked rather than restated, and it is deliberately not
 * `isLocalExecutionHost`: that one trims, so ` local ` would be answered as
 * this machine, which reinstates at a new door precisely what S2 killed at the
 * old one. Padded local gets no gentler a reading than padded ` kuba `.
 */
export function readExecutionHostIdAtDoor(
  executionHostId: unknown,
): ExecutionHostIdAtDoor {
  if (namesThisMachine(executionHostId)) return { kind: 'local' }

  if (typeof executionHostId !== 'string') {
    const named = describeNonStringExecutionHostId(executionHostId)
    return {
      kind: 'unusable',
      named,
      reason:
        `Execution host id ${named} is not usable: an id is a string, and a ` +
        'value that is not one names no machine. Reading it as this machine ' +
        'would answer for a laptop about a request that meant a daemon.',
    }
  }

  if (!isExecutionHostEndpointId(executionHostId)) {
    return {
      kind: 'unusable',
      named: executionHostId,
      reason: describeInvalidExecutionHostEndpointId(executionHostId),
    }
  }

  return { kind: 'endpoint', endpointId: executionHostId }
}
