import { beforeEach, describe, expect, it } from 'vitest'
import { useDialogStore } from './dialog.model'

describe('useDialogStore', () => {
  beforeEach(() => {
    useDialogStore.setState({ openDialog: null, payload: null })
  })

  it('opens a dialog by kind', () => {
    useDialogStore.getState().open('app-settings')
    expect(useDialogStore.getState().openDialog).toBe('app-settings')
  })

  it('closes the open dialog', () => {
    useDialogStore.getState().open('providers')
    useDialogStore.getState().close()
    expect(useDialogStore.getState().openDialog).toBeNull()
  })

  it('replaces the open kind when open() is called for a different kind', () => {
    useDialogStore.getState().open('app-settings')
    useDialogStore.getState().open('mcp-servers')
    expect(useDialogStore.getState().openDialog).toBe('mcp-servers')
  })

  it('carries a payload for dialogs that need one', () => {
    useDialogStore.getState().open('session-fork', { parentSessionId: 'p-1' })
    expect(useDialogStore.getState().openDialog).toBe('session-fork')
    expect(useDialogStore.getState().payload).toEqual({
      parentSessionId: 'p-1',
    })
  })

  it('clears payload on close', () => {
    useDialogStore.getState().open('session-fork', { parentSessionId: 'p-1' })
    useDialogStore.getState().close()
    expect(useDialogStore.getState().payload).toBeNull()
  })
})
