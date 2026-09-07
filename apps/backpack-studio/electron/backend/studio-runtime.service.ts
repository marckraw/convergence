import { app } from 'electron'
import { join } from 'node:path'
import type {
  DaemonStatusView,
  StudioStartup,
} from '../../src/shared/api/studio-api.types'
import { loadStudioConfig } from './config/studio-environment.service'
import { ConversationService } from './conversation/conversation.service'
import { DaemonClient } from './daemon/daemon-client'
import { describeDaemonStatus } from './daemon/daemon-wire.pure'
import { JsonFileConversationStore } from './record/conversation-store'
import {
  broadcastConversationEvent,
  broadcastDaemonStatus,
  registerStudioIpc,
} from './studio-ipc'

/** Composition root: joins the file record and remote client behind Studio's IPC contract. */
export async function registerStudioRuntime(): Promise<void> {
  const reading = await loadStudioConfig()
  let service: ConversationService | null = null
  let recordReady = Promise.resolve()
  let daemon: DaemonStatusView | null = null
  let handshake: Promise<DaemonStatusView | null> = Promise.resolve(null)
  let startup: () => Promise<StudioStartup>
  if (reading.ok) {
    const { config } = reading
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
        broadcastConversationEvent({ conversationId: snapshot.id, snapshot }),
    })
    recordReady = service.hydrate()
    handshake = client.handshake().then((result) => {
      daemon = describeDaemonStatus(
        result,
        config.providerId,
        new URL(config.daemonBaseUrl).hostname,
      )
      broadcastDaemonStatus(daemon)
      return daemon
    })
    startup = async () => {
      await recordReady
      return { kind: 'ready', providerId: config.providerId, daemon }
    }
  } else {
    startup = async () => ({ kind: 'misconfigured', missing: reading.missing })
  }
  registerStudioIpc({
    getStartup: startup,
    getDaemonStatus: () => handshake,
    whenRecordReady: () => recordReady,
    get service() {
      return service
    },
  })
  app.on('before-quit', (event) => {
    const running = service
    if (!running) return
    service = null
    event.preventDefault()
    void running.dispose().finally(() => app.quit())
  })
}
