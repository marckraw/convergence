import { create } from 'zustand'
import type { AppSurface } from '@/shared/types/app-surface.types'

interface AppSurfaceState {
  activeSurface: AppSurface
}

interface AppSurfaceActions {
  setActiveSurface: (surface: AppSurface) => void
}

export type AppSurfaceStore = AppSurfaceState & AppSurfaceActions

export const useAppSurfaceStore = create<AppSurfaceStore>((set) => ({
  activeSurface: 'code',
  setActiveSurface: (activeSurface) => set({ activeSurface }),
}))
