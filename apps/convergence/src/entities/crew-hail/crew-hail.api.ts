import type { CrewHail } from './crew-hail.types'

export const crewHailApi = {
  listOpen: (): Promise<CrewHail[]> => window.electronAPI.crewHail.listOpen(),

  acknowledge: (id: string): Promise<void> =>
    window.electronAPI.crewHail.acknowledge(id),

  acknowledgeCrew: (crewId: string): Promise<number> =>
    window.electronAPI.crewHail.acknowledgeCrew(crewId),

  onUpdated: (callback: (hails: CrewHail[]) => void): (() => void) =>
    window.electronAPI.crewHail.onUpdated(callback),
}
