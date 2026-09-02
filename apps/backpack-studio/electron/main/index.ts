import { app, BrowserWindow } from 'electron'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { StudioStartup } from '../../src/shared/studio-api/studio-api.types'
import {
  mergeEnv,
  parseDotEnv,
  readStudioConfig,
  type StudioConfig,
} from '../backend/config/studio-config.pure'
import { ConversationService } from '../backend/conversation/conversation.service'
import { DaemonClient } from '../backend/daemon/daemon-client'
import { describeDaemonStatus } from '../backend/daemon/daemon-wire.pure'
import { JsonFileConversationStore } from '../backend/record/conversation-store'
import {
  broadcastConversationEvent,
  registerStudioIpc,
} from '../backend/studio-ipc'

/**
 * Backpack Studio's shell (MAR-2770).
 *
 * Thin on purpose: it reads the configuration, builds the three objects that
 * do the work, opens a window and gets out of the way. Everything with a
 * decision in it lives under `backend/`.
 *
 * The daemon's URL and token are read here and stay here. Nothing below this
 * file's `DaemonClient` is given either, no IPC channel carries them, and the
 * window has no member on `window.backpackStudio` that could.
 */

let service: ConversationService | null = null
let startup: Promise<StudioStartup> | null = null

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 860,
    minHeight: 560,
    title: 'Backpack Studio',
    backgroundColor: '#0f1115',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/**
 * The environment Studio actually reads: the process's own, with a gitignored
 * `.env` beside the app standing in wherever the process says nothing.
 *
 * A missing or unreadable file is not an error — running with the variables
 * exported in a shell is the other supported way — so the failure to read one
 * produces an empty record rather than a refusal.
 */
async function readEnvironment(): Promise<Record<string, string | undefined>> {
  const candidates = [
    join(app.getAppPath(), '.env'),
    join(process.cwd(), '.env'),
  ]
  for (const candidate of candidates) {
    try {
      return mergeEnv(
        process.env,
        parseDotEnv(await readFile(candidate, 'utf-8')),
      )
    } catch {
      continue
    }
  }
  return process.env
}

/**
 * Builds the working parts, once, for a configuration that is complete.
 *
 * The handshake is deliberately NOT awaited here. It is a network round trip
 * with a fifteen-second cap, and blocking the window on it would make a slow
 * daemon look like an app that will not open. `getStartup` awaits it instead —
 * memoised, so a second window costs no second probe.
 */
function build(config: StudioConfig): Promise<StudioStartup> {
  const client = new DaemonClient({
    baseUrl: config.daemonBaseUrl,
    token: config.daemonToken,
  })
  service = new ConversationService({
    store: new JsonFileConversationStore(
      join(app.getPath('userData'), 'conversations'),
    ),
    client,
    providerId: config.providerId,
    workingDirectory: config.daemonProject,
    onSnapshot: (snapshot) =>
      broadcastConversationEvent({
        conversationId: snapshot.id,
        snapshot,
      }),
  })

  const hydrated = service.hydrate()
  return (async () => {
    const handshake = await client.handshake()
    // Re-attaching to what was already running is part of being ready: a window
    // that asked for the conversation list before the record had been read
    // would be told there were none.
    await hydrated
    return {
      kind: 'ready',
      providerId: config.providerId,
      daemon: describeDaemonStatus(handshake, config.providerId),
    }
  })()
}

app.whenReady().then(async () => {
  const reading = readStudioConfig(await readEnvironment())
  startup = reading.ok
    ? build(reading.config)
    : Promise.resolve({ kind: 'misconfigured', missing: reading.missing })

  registerStudioIpc({
    getStartup: () =>
      startup ?? Promise.resolve({ kind: 'misconfigured', missing: [] }),
    get service() {
      return service
    },
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quitting waits for the appends the streams still owe, so the log on disk is
// never behind the transcript the window was showing.
app.on('before-quit', (event) => {
  const running = service
  if (!running) return
  service = null
  event.preventDefault()
  void running.dispose().finally(() => app.quit())
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
