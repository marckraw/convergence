import type { SessionCrewMember } from '@/entities/session-crew'

/** The longest role card the door accepts (`crew.pure.ts` refuses beyond). */
export const ROLE_CARD_LIMIT = 4000

/** The seat fields a refusal can be about — where its sentence is drawn. */
export type SeatRefusalField =
  | 'batonName'
  | 'role'
  | 'roleCard'
  | 'lanePolicy'
  | 'hostPolicy'
  | 'wipLimit'

/**
 * One seat edit carries exactly one field (MAR-3118 lap 2, F3), so the field a
 * refusal is about is known by construction, never guessed.
 */
export type SeatPatch =
  | { role: SessionCrewMember['role'] }
  | { roleCard: string | null }
  | { hostPolicy: string | null }
  | { lanePolicy: SessionCrewMember['lanePolicy'] }
  | { wipLimit: number | null }

/** The field a seat edit carries — where its refusal is drawn. */
export function seatPatchField(patch: SeatPatch): SeatRefusalField {
  if ('role' in patch) return 'role'
  if ('roleCard' in patch) return 'roleCard'
  if ('hostPolicy' in patch) return 'hostPolicy'
  if ('lanePolicy' in patch) return 'lanePolicy'
  return 'wipLimit'
}

/** A host endpoint as the drawer names it. */
export interface SeatHostOption {
  id: string
  label: string
}

export const LOCAL_HOST_ID = 'local'
export const LOCAL_HOST_LABEL = 'This Mac'

/** Whether a host id means this Mac: no host chosen is this Mac too. */
export function isLocalHost(hostId: string | null): boolean {
  return hostId === null || hostId === '' || hostId === LOCAL_HOST_ID
}

/** A host id in words: this Mac, the endpoint's label, or the id itself. */
export function hostLabel(
  hostId: string | null,
  endpoints: readonly SeatHostOption[],
): string {
  if (isLocalHost(hostId)) return LOCAL_HOST_LABEL
  return endpoints.find((endpoint) => endpoint.id === hostId)?.label ?? hostId!
}

/**
 * Where a seat's host comes from: a resident works where its conversation
 * runs; a recipe spawns where its policy says.
 */
export function seatHostId(
  member: SessionCrewMember,
  conversationHost: string | null,
): string | null {
  return member.sessionId === null
    ? member.hostPolicy
    : (conversationHost ?? member.hostPolicy)
}

export function laneLabel(lane: SessionCrewMember['lanePolicy']): string {
  if (lane === 'main') return 'main'
  if (lane === 'own-worktree') return 'own worktree'
  return 'default'
}

/**
 * What a closed row says a seat comes from: its conversation's title, or the
 * recipe and its model.
 */
export function seatSourceLabel(
  member: SessionCrewMember,
  conversationTitle: string | null,
): string {
  if (member.conversationMissing) return 'conversation gone'
  if (member.sessionId === null)
    return `recipe · ${member.model ?? member.providerId ?? 'no model'}`
  return conversationTitle ?? 'a conversation'
}

/** A seat's name on its row; an unnamed seat still has to be readable. */
export function seatDisplayName(member: SessionCrewMember): string {
  return member.batonName ?? 'unnamed'
}

/**
 * The accessible name of a closed row: everything the row shows, in words, so
 * a seat is identifiable without opening it (R1).
 */
export function seatRowAccessibleName(input: {
  member: SessionCrewMember
  source: string
  host: string
}): string {
  const { member } = input
  return [
    `${seatDisplayName(member)} — ${input.source}`,
    `host ${input.host}`,
    `lane ${laneLabel(member.lanePolicy)}`,
    `WIP ${member.wipLimit}`,
    member.roleCard ? 'has a role card' : 'no role card',
  ].join(' · ')
}

/** `612 / 4,000` — the counter under the card's title. */
export function formatRoleCardCount(length: number): string {
  return `${length.toLocaleString('en-US')} / ${ROLE_CARD_LIMIT.toLocaleString('en-US')}`
}

/**
 * The live helper under a seat's name (R5): what a wire writes to reach it.
 */
export function batonNameHelper(typed: string, isRecipe: boolean): string {
  const name = typed.trim()
  const address = name
    ? `Wires address this seat as “${name}”.`
    : 'Wires cannot address this seat until it has a name.'
  return isRecipe
    ? `${address} A recipe has no conversation — it is spawned when a wire fires.`
    : address
}

/**
 * The one muted line under a refusal: what did NOT change (R7). The stored
 * value is still the one in force, and saying so is what keeps a person from
 * believing their typing took.
 */
export function refusalKeptLine(
  field: SeatRefusalField,
  member: SessionCrewMember,
): string {
  switch (field) {
    case 'batonName':
      return member.batonName
        ? `Still named “${member.batonName}” — your text stays until a name is accepted.`
        : 'Still unnamed — your text stays until a name is accepted.'
    case 'wipLimit':
      return `Still saved as ${member.wipLimit}. WIP stays ${member.wipLimit}.`
    case 'roleCard':
      return member.roleCard
        ? 'Previous card kept — nothing is saved until it fits; the last accepted card still leads each run.'
        : 'Nothing is saved until it fits; this seat still has no card.'
    case 'role':
      return `Still a ${member.role}.`
    case 'lanePolicy':
      return `Lane stays ${laneLabel(member.lanePolicy)}.`
    case 'hostPolicy':
      return 'Host unchanged.'
  }
}
