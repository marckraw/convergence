import { BrowserWindow, ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import type { CrewService } from './crew.service'
import type {
  CreateCrewRecipeSeatInput,
  CrewMemberRef,
  UpdateCrewSeatInput,
} from './crew.service'
import type { TrackerBindingInput } from '../tracker/tracker-binding.pure'
import type {
  CreateSessionCrewInput,
  SeatRenameResult,
  SessionCrew,
  SessionCrewMember,
  UpdateSessionCrewInput,
} from './crew.types'
import { normalizeCrewBatonName } from './crew.pure'
import type { RelayService } from '../relay/relay.service'
import {
  broadcastRelays as defaultBroadcastRelays,
  type RelayBroadcastFn,
} from '../relay/relay.ipc'

export const CREW_UPDATED_CHANNEL = 'crew:updated'

export type CrewBroadcastFn = (crews: SessionCrew[]) => void

export const broadcastCrews: CrewBroadcastFn = (crews) => {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(CREW_UPDATED_CHANNEL, crews)
    }
  }
}

function memberMatchesRef(
  member: SessionCrewMember,
  ref: CrewMemberRef,
): boolean {
  if ('sessionId' in ref) return member.sessionId === ref.sessionId
  const wanted = normalizeCrewBatonName(ref.batonName)
  return (
    member.sessionId === null && wanted !== null && member.batonName === wanted
  )
}

/**
 * Every mutation answers the caller AND broadcasts the whole crew list to all
 * windows: crews are cross-project furniture, so a second Mission Control
 * window must never hold a stale roster.
 */
export function registerCrewIpcHandlers(deps: {
  service: CrewService
  /** Owns `session_relays` writes for a seat rename carry (MAR-3157). */
  relays: RelayService
  /** Shared with RelayService so rename + carry commit in one transaction. */
  db: Database.Database
  broadcast?: CrewBroadcastFn
  broadcastRelays?: RelayBroadcastFn
  /**
   * Forgets a deleted crew's tracker key (MAR-3084 lap 2, C). A secret must
   * not outlive its owner, and the deleted crew's form was the only surface
   * that could remove it.
   */
  forgetTrackerKey?: (crewId: string) => Promise<unknown>
  log?: (message: string, error: unknown) => void
}): void {
  const { service, relays, db } = deps
  const broadcast = deps.broadcast ?? broadcastCrews
  const broadcastWireList = deps.broadcastRelays ?? defaultBroadcastRelays

  const mutate = <T>(run: () => T): T => {
    const result = run()
    broadcast(service.list())
    return result
  }

  ipcMain.handle('crew:list', () => service.list())

  ipcMain.handle('crew:create', (_event, input: CreateSessionCrewInput) =>
    mutate(() => service.create(input)),
  )

  ipcMain.handle(
    'crew:update',
    (_event, id: string, patch: UpdateSessionCrewInput) =>
      mutate(() => service.update(id, patch)),
  )

  // Deleting a crew forgets its tracker key, best-effort: a Keychain failure
  // is logged and never fails the delete, which has already happened. The
  // crew's work-ledger rows stay -- they are append-only history.
  ipcMain.handle('crew:delete', async (_event, id: string) => {
    mutate(() => service.delete(id))
    if (!deps.forgetTrackerKey) return
    try {
      await deps.forgetTrackerKey(id)
    } catch (error) {
      ;(deps.log ?? ((message, cause) => console.error(message, cause)))(
        `[crew] Could not forget the tracker key of deleted crew ${id}`,
        error,
      )
    }
  })

  // The tracker this crew reads (MAR-3084 R3). A mutation like every other
  // here, so a second window never holds a stale binding.
  ipcMain.handle(
    'crew:setTrackerBinding',
    (_event, crewId: string, binding: TrackerBindingInput | null) =>
      mutate(() => service.setTrackerBinding(crewId, binding)),
  )

  // What a seat IS (MAR-3083 R1/R6): its own door, like the baton name's.
  // Every member-scoped write names the member the same way, so a recipe --
  // which has no session id -- is editable and removable like any other seat.
  ipcMain.handle(
    'crew:setMemberSeat',
    (
      _event,
      crewId: string,
      member: CrewMemberRef,
      patch: UpdateCrewSeatInput,
    ) => mutate(() => service.setMemberSeat(crewId, member, patch)),
  )

  // A seat that is a recipe rather than a conversation (MAR-3083 R3).
  ipcMain.handle(
    'crew:addRecipeMember',
    (_event, crewId: string, input: CreateCrewRecipeSeatInput) =>
      mutate(() => service.addRecipeMember(crewId, input)),
  )

  ipcMain.handle(
    'crew:addMember',
    (_event, crewId: string, sessionId: string) =>
      mutate(() => service.addMember(crewId, sessionId)),
  )

  ipcMain.handle(
    'crew:removeMember',
    (_event, crewId: string, member: CrewMemberRef) =>
      mutate(() => service.removeMember(crewId, member)),
  )

  ipcMain.handle(
    'crew:setMemberBatonName',
    (
      _event,
      crewId: string,
      member: CrewMemberRef,
      batonName: string | null,
    ): SeatRenameResult => {
      const run = db.transaction((): SeatRenameResult => {
        const before = service.getById(crewId)
        if (!before) throw new Error(`Crew not found: ${crewId}`)
        const existing = before.members.find((entry) =>
          memberMatchesRef(entry, member),
        )
        if (!existing) throw new Error('That seat is not in this crew')
        const oldName = existing.batonName
        const crew = service.setMemberBatonName(crewId, member, batonName)
        const otherRecipeNames = new Set(
          before.members
            .filter(
              (entry) =>
                entry.sessionId === null && entry.batonName !== oldName,
            )
            .map((entry) => entry.batonName),
        )
        const afterMember =
          existing.sessionId != null
            ? crew.members.find(
                (entry) => entry.sessionId === existing.sessionId,
              )
            : crew.members.find(
                (entry) =>
                  entry.sessionId === null &&
                  entry.batonName !== null &&
                  !otherRecipeNames.has(entry.batonName),
              )
        const newName = afterMember?.batonName ?? null
        const carry = relays.carrySeatRename({
          crewId,
          oldName,
          newName,
          renamedMemberSessionId: existing.sessionId,
        })
        return {
          crew,
          carried: carry.carried,
          left: carry.left,
          oldName,
          newName,
        }
      })

      const result = run()
      broadcast(service.list())
      broadcastWireList(relays.list())
      return result
    },
  )

  // Where a card was dropped (R10). A mutation like every other in this file,
  // so a second window showing the same crew moves the card too.
  ipcMain.handle(
    'crew:setMemberPosition',
    (
      _event,
      crewId: string,
      sessionId: string,
      position: { x: number; y: number } | null,
    ) => mutate(() => service.setMemberPosition(crewId, sessionId, position)),
  )
}
