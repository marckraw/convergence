import type { RelaySpawnSpec } from './relay.types'

/** Composes the first message of an errand from its recipe and source. */
export function composeErrandBrief(
  spec: Pick<RelaySpawnSpec, 'roleCard' | 'returnWire'>,
  sourceName: string,
  payload: string,
): string {
  if (spec.roleCard === null) return payload
  const delivery = spec.returnWire
    ? `When you finish, your last message is delivered to ${sourceName} — make it the report.`
    : null
  return [spec.roleCard, delivery, payload]
    .filter((block) => block !== null)
    .join('\n\n')
}
