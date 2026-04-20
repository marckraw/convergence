import { create } from 'zustand'
import type { DialogKind, DialogPayload } from './dialog.types'

interface DialogState {
  openDialog: DialogKind | null
  payload: DialogPayload
}

interface DialogActions {
  open: (kind: DialogKind, payload?: DialogPayload) => void
  close: () => void
}

export type DialogStore = DialogState & DialogActions

export const useDialogStore = create<DialogStore>((set) => ({
  openDialog: null,
  payload: null,
  open: (kind, payload = null) => set({ openDialog: kind, payload }),
  close: () => set({ openDialog: null, payload: null }),
}))
