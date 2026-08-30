import { isLocalExecutionHost } from '@/entities/execution-host'
import {
  remoteProjectMatchingOrigin,
  type RemoteProject,
  type RemoteProjectCatalogState,
} from '@/entities/session'
import {
  describeBranchPhrase,
  describeBranchToBeCut,
  describeCloneableRepository,
  describeRemoteProjectPlace,
  describeStatedBranch,
  statedWorkPlace,
  type ReportedWorkspace,
  type SessionWorkAddress,
} from '@/shared/lib/work-address.pure'
import type { ExecutionBarView } from './execution-bar.pure'

/** The one choice in the slot that is not a Project on the machine. */
export const REPOSITORY_WORK_ADDRESS_CHOICE_ID = 'repository'

/** How a Project's choice is identified in the slot. */
function projectChoiceId(projectId: string): string {
  return `project:${projectId}`
}

/**
 * One place the slot offers, and the record that place produces (MAR-2689).
 *
 * The address travels *with* the choice rather than being rebuilt from the id
 * when he picks one. The strip states a place and the send carries that place;
 * rebuilding it at the send would make them two derivations of one fact, and a
 * choice id that no longer resolves would then silently send something else.
 */
export interface WorkAddressChoice {
  id: string
  label: string
  address: SessionWorkAddress
}

/**
 * What the local project's repository is, or that we have not looked yet
 * (MAR-2689).
 *
 * A union rather than a nullable string, because "no repository a daemon could
 * clone" and "we have not read the origin yet" lead to opposite renders — the
 * first says Repository mode is impossible, the second must say nothing at all
 * — and a single `null` cannot tell them apart.
 */
export type LocalRepositoryState =
  | { status: 'asking' }
  | { status: 'known'; repository: string | null }

/**
 * The strip's second slot: where a remote session will work (MAR-2689).
 *
 * Five states, and none of them is "empty". A remote session that says nothing
 * about its place is the defect this slice exists to close — a session
 * dispatched from inside the Convergence project told a daemon to clone
 * Convergence, silently, because the place was derived from whatever project
 * the session happened to be born in and shown nowhere.
 *
 * `settled` is a statement of fact read from the record, exactly as the machine
 * beside it is: the daemon owns a running session and its place cannot change
 * under it, so a chooser there would be a control that lies about what it does.
 */
export type WorkAddressSlotView =
  | { mode: 'hidden' }
  | { mode: 'asking'; text: string }
  | { mode: 'unavailable'; text: string }
  | {
      mode: 'choosing'
      choices: readonly WorkAddressChoice[]
      /** Null when nothing could be preselected and he has picked nothing. */
      selectedId: string | null
      address: SessionWorkAddress | null
      /**
       * The branch field, present only for the one mode that has a branch to
       * write (MAR-2694). Null in Project mode: a residency runs on the
       * checkout's own HEAD, so a field there would be a control with nothing
       * to control.
       */
      branch: BranchFieldView | null
      notice: string | null
    }
  | {
      mode: 'settled'
      /** The place and the branch it works on: `marckraw/repo @ agent/2694`. */
      label: string
      /** The branch that was asked for, when the daemon cut another one. */
      requestedBranch: string | null
    }

/**
 * The branch field and the sentence beside it (MAR-2694).
 *
 * `value` is what he typed, untouched -- the field is a controlled input and
 * the view is what it renders. `statement` is what the strip says will happen,
 * which is a different thing from the field's text: an empty field is not an
 * empty branch, it is the daemon naming one, and the strip says so in words.
 */
export interface BranchFieldView {
  value: string
  statement: string
}

export interface WorkAddressSlotInput {
  /** The machine, resolved first: the place is a fact *about* that machine. */
  executionBar: ExecutionBarView
  hostLabel: string
  projects: RemoteProjectCatalogState | null
  localRepository: LocalRepositoryState
  /** The last place he picked, honoured only while it is still offered. */
  selectedId: string | null
  /**
   * What he typed into the branch field, verbatim (MAR-2694). Read only in
   * Repository mode; a draft left behind by a mode switch never reaches the
   * wire, because the address that carries it is only built there.
   */
  branchDraft: string
  /** What a live session recorded, for the settled reading. */
  recordedAddress: SessionWorkAddress | null | undefined
  /** What the daemon reported back for a live session, when it has (MAR-2694). */
  reportedWorkspace: ReportedWorkspace | null | undefined
}

/**
 * The branch a typed field names, or `null` for "the daemon names it"
 * (MAR-2694).
 *
 * Emptiness is decided by trimming and the value is never trimmed, which is the
 * same split `namesAConcreteWorkPlace` already makes: a field holding only
 * spaces has nothing written in it, and a field holding `' agent/x '` has
 * something written in it that this app has no business editing. Exact or
 * refused, never repaired -- and the decoder at the main-process door refuses
 * a blank one by name, so the two ends agree about what "written down" means.
 */
export function branchNameFromDraft(draft: string): string | null {
  return draft.trim().length > 0 ? draft : null
}

/**
 * Resolves the slot on every render rather than mirroring it into state, for
 * the reason the machine tier above it is resolved that way: the Endpoint edit
 * that invalidates a pick and the render that would have shown it are then the
 * same beat.
 *
 * The pick is clamped here at the read and the raw pick is left alone, so
 * switching machines and switching back restores the place he chose instead of
 * quietly demoting him to the default for the rest of the session.
 *
 * There is no slot on Local, and that is not a shortcut. A local session works
 * in the directory the record already names; there is nothing to choose and
 * nothing to say, and a tier that could neither choose nor report anything is
 * noise on the one composer that must stay byte-identical (MAR-2682).
 */
export function resolveWorkAddressSlot(
  input: WorkAddressSlotInput,
): WorkAddressSlotView {
  const bar = input.executionBar
  if (bar.mode === 'hidden') return { mode: 'hidden' }
  if (isLocalExecutionHost(bar.hostId)) return { mode: 'hidden' }

  if (bar.mode === 'settled') {
    const statement = statedWorkPlace(
      input.recordedAddress,
      input.reportedWorkspace,
    )
    const branch = describeStatedBranch(statement)
    return {
      mode: 'settled',
      label: branch
        ? `${statement.place} ${describeBranchPhrase(branch)}`
        : statement.place,
      requestedBranch: statement.requestedBranchName,
    }
  }

  // Nothing is offered until both halves are in: the Projects decide what the
  // machine has, and the local origin decides both whether Repository is
  // possible and which Project is the same repository. Guessing from half an
  // answer would put a place on the strip that the other half then changes.
  const projects = input.projects
  if (!projects || projects.status === 'pending') {
    return { mode: 'asking', text: askingText(input.hostLabel) }
  }
  if (input.localRepository.status === 'asking') {
    return { mode: 'asking', text: askingText(input.hostLabel) }
  }

  const listed = projects.status === 'landed' ? projects : null
  const localRepository = input.localRepository.repository

  const choices: WorkAddressChoice[] = (listed?.projects ?? []).map(
    (project) => ({
      id: projectChoiceId(project.id),
      label: describeRemoteProjectPlace(project.name),
      address: {
        mode: 'project',
        projectId: project.id,
        workingDirectory: project.workingDirectory,
        label: describeRemoteProjectPlace(project.name),
      },
    }),
  )
  const branchName = branchNameFromDraft(input.branchDraft)
  if (localRepository) {
    choices.push({
      id: REPOSITORY_WORK_ADDRESS_CHOICE_ID,
      label: describeCloneableRepository(localRepository),
      address: {
        mode: 'repository',
        repository: localRepository,
        branchName,
        label: describeCloneableRepository(localRepository),
      },
    })
  }

  // Why the machine's Projects could not be read, said beside whatever is still
  // offerable rather than instead of it: Repository mode needs no answer from
  // the daemon, so a machine that never replied still leaves a real choice
  // standing. A machine that simply does not do Projects gets no notice at all
  // — it has none, and that is a listing, not a fault.
  //
  // "Could not be read" and not "could not be asked", because both failures
  // land here: a machine that never answered, and one that answered with
  // something that is not a listing. Neither may reach him as "it has none"
  // (MAR-2689).
  const unreadableReason =
    projects.status === 'failed'
      ? projects.reason
      : (listed?.unreachableReason ?? null)
  const notice = unreadableReason
    ? `Could not read which Projects ${input.hostLabel} has: ${unreadableReason}`
    : null

  if (choices.length === 0) {
    return {
      mode: 'unavailable',
      text:
        notice ??
        `This project has no GitHub origin ${input.hostLabel} could clone, ` +
          'and that machine lists no Projects to work in.',
    }
  }

  const picked = choices.find((choice) => choice.id === input.selectedId)
  const preselected =
    picked ?? defaultChoice(choices, listed?.projects ?? [], localRepository)
  return {
    mode: 'choosing',
    choices,
    selectedId: preselected?.id ?? null,
    address: preselected?.address ?? null,
    // Read off the preselected address rather than off the choice id, so the
    // field appears for exactly the mode whose address can carry a branch.
    branch:
      preselected?.address.mode === 'repository'
        ? {
            value: input.branchDraft,
            statement: describeBranchToBeCut(branchName),
          }
        : null,
    notice,
  }
}

function askingText(hostLabel: string): string {
  return `Asking ${hostLabel} where it can work…`
}

/**
 * The place preselected when he has not picked one (MAR-2689).
 *
 * Origin first: the Project on that machine holding the same repository as the
 * project this session was born in is the one he means, and matching is the
 * only way to know it without asking. No match falls back to Repository mode —
 * clone the repository this project points at — which is what the app has
 * always done, now said out loud.
 *
 * Nothing at all is a real answer, and deliberately not "the first Project".
 * When there is no local origin to match and no repository to clone, every
 * Project on that machine is equally plausible and none is chosen for him.
 */
function defaultChoice(
  choices: readonly WorkAddressChoice[],
  projects: readonly RemoteProject[],
  localRepository: string | null,
): WorkAddressChoice | null {
  const match = remoteProjectMatchingOrigin(projects, localRepository)
  if (match) {
    const matched = choices.find(
      (choice) => choice.id === projectChoiceId(match.id),
    )
    if (matched) return matched
  }
  return (
    choices.find((choice) => choice.id === REPOSITORY_WORK_ADDRESS_CHOICE_ID) ??
    null
  )
}

/**
 * The place a new session records, derived from the very view the strip
 * renders.
 *
 * The send closes over this rather than over the slot, for the same reason
 * `executionHostForNewSession` exists beside the machine tier: a primitive
 * value changes exactly when the send would go somewhere else, while the view
 * is rebuilt every render.
 *
 * Null on every mode but `choosing`, including `settled` — a live session's
 * place was recorded when it was born and a later turn does not restate it.
 */
export function workAddressForNewSession(
  view: WorkAddressSlotView,
): SessionWorkAddress | null {
  return view.mode === 'choosing' ? view.address : null
}

/**
 * Whether the strip has a place to state, so a send may leave (MAR-2689).
 *
 * The first of the three doors that make a remote session born without a
 * concrete place impossible. Pressing send while the slot still says "Asking
 * little-monster where it can work…" used to create the session anyway, with
 * `unknown` on the record, and the start then fell through to the legacy
 * derivation and cloned whatever repository the session's own project pointed
 * at — the original incident, reached through the very control built to end
 * it.
 *
 * Keyed on `workAddressForNewSession` for the mode that has a place to give,
 * so the value the composer sends and the value that unlocks the send are one
 * derivation rather than two that agree until one is edited — the same reason
 * the send closes over that primitive at all.
 *
 * `hidden` and `settled` are ready and owe nothing. A Local composer has no
 * place to state, and a live session's place was recorded when it was born; a
 * door that demanded an address from either would block the one composer that
 * must stay byte-identical (MAR-2682) and every turn after the first.
 */
export function workAddressReadyForSend(view: WorkAddressSlotView): boolean {
  switch (view.mode) {
    case 'hidden':
    case 'settled':
      return true
    case 'asking':
    case 'unavailable':
      return false
    case 'choosing':
      return workAddressForNewSession(view) !== null
  }
}
