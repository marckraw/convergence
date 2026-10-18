import type { ExecutionToolAttachment } from '@mrck-labs/execution-host-protocol'
import { createExecutionHostClient } from '@mrck-labs/execution-host-protocol/client'
import type { RemoteExecutionHostConnection } from '@convergence/execution-host-client'
import type {
  ToolAttachmentOmissions,
  ToolImageBytes,
} from '../../session/conversation-item.types'
import { planToolImageDownloads } from './remote-tool-images.pure'

/**
 * How long one image may take, body included. A tool image is at most 8 MiB,
 * which a working connection moves in a few seconds; the deadline exists for
 * the one that hangs, so its slot is given back.
 */
export const TOOL_IMAGE_DOWNLOAD_TIMEOUT_MS = 30_000

/**
 * How many images one host is asked for at once, across all its sessions. A
 * tool that takes eight screenshots must not open eight requests beside the
 * event stream the session is still reading from the same host.
 */
export const TOOL_IMAGE_DOWNLOADS_PER_HOST = 2

/** The images that arrived, and the ones that did not, counted by reason. */
export interface FetchedToolImages {
  images: ToolImageBytes[]
  omissions: ToolAttachmentOmissions
}

interface RemoteToolImageFetcherDeps {
  fetch: typeof fetch
  timeoutMs?: number
  maxConcurrent?: number
}

/**
 * Downloads the images a remote tool result names (MAR-4274) with the
 * protocol client's `downloadAttachment` (kind `tool`): authenticated,
 * read to at most the size the reference gave, within a deadline, a few at a
 * time per host. Nothing here blocks the main process: every wait is a
 * request, and the bytes are handed on as they arrived.
 *
 * One per host, so the limit is the host's: two sessions on one machine
 * share it, and a session on another machine is not held up behind them.
 */
export class RemoteToolImageFetcher {
  private readonly timeoutMs: number
  private readonly maxConcurrent: number
  private active = 0
  private readonly waiting: Array<() => void> = []

  constructor(private readonly deps: RemoteToolImageFetcherDeps) {
    this.timeoutMs = deps.timeoutMs ?? TOOL_IMAGE_DOWNLOAD_TIMEOUT_MS
    this.maxConcurrent = deps.maxConcurrent ?? TOOL_IMAGE_DOWNLOADS_PER_HOST
  }

  /**
   * Every image the references name that could be fetched, in their order,
   * and a count of the rest. Never throws for a download that failed: that is
   * `download-failed`, one per image. Only `signal` ends it early, and then it
   * rejects with the signal's reason, as the client does.
   */
  async fetch(
    connection: RemoteExecutionHostConnection,
    sessionId: string,
    attachments: readonly ExecutionToolAttachment[],
    signal: AbortSignal,
  ): Promise<FetchedToolImages> {
    const plan = planToolImageDownloads(attachments)
    const omissions = { ...plan.omissions }
    const client = createExecutionHostClient({
      baseUrl: connection.baseUrl,
      token: connection.token,
      fetch: this.deps.fetch,
      requestTimeoutMs: this.timeoutMs,
    })

    const results = await Promise.all(
      plan.downloads.map(({ attachment, maxBytes }) =>
        this.withSlot(signal, async () => {
          try {
            const { bytes } = await client.downloadAttachment(
              sessionId,
              attachment.id,
              { kind: 'tool', maxBytes, timeoutMs: this.timeoutMs, signal },
            )
            return {
              name: attachment.name,
              mimeType: attachment.mimeType,
              bytes,
            } satisfies ToolImageBytes
          } catch (error) {
            if (signal.aborted) throw error
            return null
          }
        }),
      ),
    )

    const images: ToolImageBytes[] = []
    for (const image of results) {
      if (image) images.push(image)
      else
        omissions['download-failed'] = (omissions['download-failed'] ?? 0) + 1
    }
    return { images, omissions }
  }

  /** Runs `work` when a slot is free, and gives the slot back after. */
  private async withSlot<T>(
    signal: AbortSignal,
    work: () => Promise<T>,
  ): Promise<T> {
    await this.acquire(signal)
    try {
      return await work()
    } finally {
      this.release()
    }
  }

  private acquire(signal: AbortSignal): Promise<void> {
    if (signal.aborted) return Promise.reject(signal.reason)
    if (this.active < this.maxConcurrent) {
      this.active += 1
      return Promise.resolve()
    }
    return new Promise((resolve, reject) => {
      const take = () => {
        signal.removeEventListener('abort', leave)
        this.active += 1
        resolve()
      }
      // A run stopped while its images wait in line leaves the line, so a
      // released session holds no place behind a busy one.
      const leave = () => {
        const index = this.waiting.indexOf(take)
        if (index >= 0) this.waiting.splice(index, 1)
        reject(signal.reason)
      }
      signal.addEventListener('abort', leave, { once: true })
      this.waiting.push(take)
    })
  }

  private release(): void {
    this.active -= 1
    this.waiting.shift()?.()
  }
}
