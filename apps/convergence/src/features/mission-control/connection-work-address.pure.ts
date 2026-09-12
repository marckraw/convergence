import {
  resolveWorkAddressSlot,
  type WorkAddressSlotInput,
  type WorkAddressSlotView,
} from '@/entities/execution-host'
import type { SessionWorkAddress } from '@/shared/lib/work-address.pure'

/** A recipe retains its recorded destination while the endpoint's catalog changes. */
export function resolveConnectionWorkAddress(
  input: WorkAddressSlotInput,
): WorkAddressSlotView {
  const offered = resolveWorkAddressSlot(input)
  const recorded = input.recordedAddress
  if (!recorded || recorded.mode === 'unknown' || offered.mode === 'hidden')
    return offered
  if (offered.mode === 'choosing') {
    const matching = offered.choices.find(
      (choice) => addressKey(choice.address) === addressKey(recorded),
    )
    if (matching)
      return {
        ...offered,
        notice:
          matching.label !== recorded.label
            ? `This recorded place was renamed to ${matching.label}.`
            : offered.notice,
      }
  }
  const fact = resolveWorkAddressSlot({
    ...input,
    host: { ...input.host, mode: 'settled' },
  })
  if (fact.mode !== 'settled') return fact
  return {
    ...fact,
    notice:
      input.projects?.status === 'landed' &&
      input.localRepository.status === 'known'
        ? 'This recorded place is no longer offered by the endpoint.'
        : 'The recorded place is kept while the endpoint’s choices are unavailable.',
  }
}

function addressKey(address: SessionWorkAddress): string {
  return JSON.stringify(
    address.mode === 'project'
      ? [address.mode, address.projectId]
      : address.mode === 'repository'
        ? [address.mode, address.repository, address.branchName, address.label]
        : [address.mode],
  )
}
