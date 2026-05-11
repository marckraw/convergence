import type {
  CreateSpaceInput,
  CreateSpaceArtifactInput,
  Space,
  SpaceAttempt,
  SpaceArtifact,
  SpaceSynthesisResult,
  LinkSpaceAttemptInput,
  UpdateSpaceAttemptInput,
  UpdateSpaceInput,
  UpdateSpaceArtifactInput,
} from './space.types'

export const spaceApi = {
  list: (): Promise<Space[]> => window.electronAPI.space.list(),

  getById: (id: string): Promise<Space | null> =>
    window.electronAPI.space.getById(id),

  create: (input: CreateSpaceInput): Promise<Space> =>
    window.electronAPI.space.create(input),

  update: (id: string, input: UpdateSpaceInput): Promise<Space> =>
    window.electronAPI.space.update(id, input),

  delete: (id: string): Promise<void> => window.electronAPI.space.delete(id),

  listAttempts: (spaceId: string): Promise<SpaceAttempt[]> =>
    window.electronAPI.space.listAttempts(spaceId),

  listAttemptsForSession: (sessionId: string): Promise<SpaceAttempt[]> =>
    window.electronAPI.space.listAttemptsForSession(sessionId),

  linkAttempt: (input: LinkSpaceAttemptInput): Promise<SpaceAttempt> =>
    window.electronAPI.space.linkAttempt(input),

  updateAttempt: (
    id: string,
    input: UpdateSpaceAttemptInput,
  ): Promise<SpaceAttempt> => window.electronAPI.space.updateAttempt(id, input),

  unlinkAttempt: (id: string): Promise<void> =>
    window.electronAPI.space.unlinkAttempt(id),

  setPrimaryAttempt: (
    spaceId: string,
    attemptId: string,
  ): Promise<SpaceAttempt> =>
    window.electronAPI.space.setPrimaryAttempt(spaceId, attemptId),

  listArtifacts: (spaceId: string): Promise<SpaceArtifact[]> =>
    window.electronAPI.space.listArtifacts(spaceId),

  addArtifact: (input: CreateSpaceArtifactInput): Promise<SpaceArtifact> =>
    window.electronAPI.space.addArtifact(input),

  updateArtifact: (
    id: string,
    input: UpdateSpaceArtifactInput,
  ): Promise<SpaceArtifact> =>
    window.electronAPI.space.updateArtifact(id, input),

  deleteArtifact: (id: string): Promise<void> =>
    window.electronAPI.space.deleteArtifact(id),

  synthesize: (
    spaceId: string,
    requestId?: string,
  ): Promise<SpaceSynthesisResult> =>
    window.electronAPI.space.synthesize(spaceId, requestId),
}
