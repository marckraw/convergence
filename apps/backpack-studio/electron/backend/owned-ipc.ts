import { BrowserWindow, type IpcMainInvokeEvent } from 'electron'

/** Studio and update invokes share the same app-window boundary. */
export function owned(event: IpcMainInvokeEvent): void {
  if (
    event.senderFrame !== event.sender.mainFrame ||
    !BrowserWindow.fromWebContents(event.sender)
  ) {
    throw new Error('Studio requests require the app window')
  }
}
