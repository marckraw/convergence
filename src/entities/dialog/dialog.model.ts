import { create } from 'zustand'
import type { DialogKind } from './dialog.types'

interface DialogState {
  openDialog: DialogKind | null
}

interface DialogActions {
  open: (kind: DialogKind) => void
  close: () => void
}

export type DialogStore = DialogState & DialogActions

export const useDialogStore = create<DialogStore>((set) => ({
  openDialog: null,
  open: (kind) => set({ openDialog: kind }),
  close: () => set({ openDialog: null }),
}))
