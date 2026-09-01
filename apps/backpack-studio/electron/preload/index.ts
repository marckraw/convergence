import { contextBridge } from 'electron'

/**
 * The bridge, deliberately almost empty (MAR-2737).
 *
 * Studio has no IPC surface yet because it has no main-process work to do. The
 * file exists so the shell's three-part shape — main, preload, renderer — is
 * the one Convergence uses, and so the first real capability has somewhere
 * obvious to land.
 */
contextBridge.exposeInMainWorld('backpackStudio', {
  platform: process.platform,
})
