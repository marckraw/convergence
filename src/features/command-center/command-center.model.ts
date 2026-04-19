import { create } from 'zustand'

interface CommandCenterState {
  isOpen: boolean
  query: string
}

interface CommandCenterActions {
  open: () => void
  close: () => void
  toggle: () => void
  setQuery: (query: string) => void
}

export type CommandCenterStore = CommandCenterState & CommandCenterActions

export const useCommandCenterStore = create<CommandCenterStore>((set) => ({
  isOpen: false,
  query: '',
  open: () => set({ isOpen: true, query: '' }),
  close: () => set({ isOpen: false, query: '' }),
  toggle: () =>
    set((state) =>
      state.isOpen ? { isOpen: false, query: '' } : { isOpen: true, query: '' },
    ),
  setQuery: (query) => set({ query }),
}))
