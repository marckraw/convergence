import type {
  CreateInitiativeInput,
  CreateInitiativeOutputInput,
  Initiative,
  InitiativeAttempt,
  InitiativeOutput,
  InitiativeSynthesisResult,
  LinkInitiativeAttemptInput,
  UpdateInitiativeAttemptInput,
  UpdateInitiativeInput,
  UpdateInitiativeOutputInput,
} from './initiative.types'

export const initiativeApi = {
  list: (): Promise<Initiative[]> => window.electronAPI.initiative.list(),

  getById: (id: string): Promise<Initiative | null> =>
    window.electronAPI.initiative.getById(id),

  create: (input: CreateInitiativeInput): Promise<Initiative> =>
    window.electronAPI.initiative.create(input),

  update: (id: string, input: UpdateInitiativeInput): Promise<Initiative> =>
    window.electronAPI.initiative.update(id, input),

  delete: (id: string): Promise<void> =>
    window.electronAPI.initiative.delete(id),

  listAttempts: (initiativeId: string): Promise<InitiativeAttempt[]> =>
    window.electronAPI.initiative.listAttempts(initiativeId),

  listAttemptsForSession: (sessionId: string): Promise<InitiativeAttempt[]> =>
    window.electronAPI.initiative.listAttemptsForSession(sessionId),

  linkAttempt: (
    input: LinkInitiativeAttemptInput,
  ): Promise<InitiativeAttempt> =>
    window.electronAPI.initiative.linkAttempt(input),

  updateAttempt: (
    id: string,
    input: UpdateInitiativeAttemptInput,
  ): Promise<InitiativeAttempt> =>
    window.electronAPI.initiative.updateAttempt(id, input),

  unlinkAttempt: (id: string): Promise<void> =>
    window.electronAPI.initiative.unlinkAttempt(id),

  setPrimaryAttempt: (
    initiativeId: string,
    attemptId: string,
  ): Promise<InitiativeAttempt> =>
    window.electronAPI.initiative.setPrimaryAttempt(initiativeId, attemptId),

  listOutputs: (initiativeId: string): Promise<InitiativeOutput[]> =>
    window.electronAPI.initiative.listOutputs(initiativeId),

  addOutput: (input: CreateInitiativeOutputInput): Promise<InitiativeOutput> =>
    window.electronAPI.initiative.addOutput(input),

  updateOutput: (
    id: string,
    input: UpdateInitiativeOutputInput,
  ): Promise<InitiativeOutput> =>
    window.electronAPI.initiative.updateOutput(id, input),

  deleteOutput: (id: string): Promise<void> =>
    window.electronAPI.initiative.deleteOutput(id),

  synthesize: (
    initiativeId: string,
    requestId?: string,
  ): Promise<InitiativeSynthesisResult> =>
    window.electronAPI.initiative.synthesize(initiativeId, requestId),
}
