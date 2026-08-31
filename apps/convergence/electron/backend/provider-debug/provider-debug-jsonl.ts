import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
} from 'fs'
import { join } from 'path'
import {
  JSONL_RETAIN_AGE_MS,
  JSONL_RETAIN_ROTATIONS,
  JSONL_ROTATE_BYTES,
} from './provider-debug.pure'
import {
  nextRotationIndex,
  selectCleanupTargets,
} from './provider-debug-jsonl.pure'

export interface JsonlWriter {
  writeLine(sessionId: string, line: string): void
  cleanup(knownSessionIds: ReadonlySet<string>): void
}

export interface JsonlWriterOptions {
  directory: string
  rotateBytes?: number
  retainRotations?: number
  retainAgeMs?: number
  now?: () => number
}

export function createJsonlWriter(options: JsonlWriterOptions): JsonlWriter {
  const directory = options.directory
  const rotateBytes = options.rotateBytes ?? JSONL_ROTATE_BYTES
  const retainRotations = options.retainRotations ?? JSONL_RETAIN_ROTATIONS
  const retainAgeMs = options.retainAgeMs ?? JSONL_RETAIN_AGE_MS
  const now = options.now ?? Date.now

  function ensureDirectory(): void {
    if (!existsSync(directory)) {
      mkdirSync(directory, { recursive: true })
    }
  }

  function rotateIfNeeded(filename: string): void {
    let size: number
    try {
      size = statSync(filename).size
    } catch {
      return
    }
    if (size < rotateBytes) return
    const baseName = filename.replace(/\.jsonl$/, '')
    const sessionId = baseName.split('/').pop() ?? ''
    const filenames = readdirSync(directory)
    const idx = nextRotationIndex(filenames, sessionId)
    const target = `${baseName}.${idx}.jsonl`
    try {
      renameSync(filename, target)
    } catch {
      // Rotation is best effort — keep appending if rename fails.
    }
  }

  return {
    writeLine(sessionId, line) {
      ensureDirectory()
      const filename = join(directory, `${sessionId}.jsonl`)
      try {
        appendFileSync(filename, line.endsWith('\n') ? line : line + '\n')
        rotateIfNeeded(filename)
      } catch {
        // Disk failures are non-fatal; in-memory ring still receives the entry.
      }
    },

    cleanup(knownSessionIds) {
      let entries: string[]
      try {
        entries = existsSync(directory) ? readdirSync(directory) : []
      } catch {
        return
      }
      const candidates = entries.flatMap((filename) => {
        try {
          const stat = statSync(join(directory, filename))
          return [{ filename, mtimeMs: stat.mtimeMs }]
        } catch {
          return []
        }
      })
      const targets = selectCleanupTargets({
        candidates,
        knownSessionIds,
        now: now(),
        retainAgeMs,
        retainRotations,
      })
      for (const filename of targets) {
        try {
          unlinkSync(join(directory, filename))
        } catch {
          // Best effort.
        }
      }
    },
  }
}
