import { createServer, type IncomingMessage, type Server } from 'http'
import {
  extractClaudeSkillActivationEvents,
  type ClaudeSkillActivationEvent,
} from './claude-skill-telemetry.pure'

const MAX_OTLP_LOG_BODY_BYTES = 1024 * 1024

export interface ClaudeSkillTelemetrySink {
  env: Record<string, string>
  dispose: () => void
}

export interface ClaudeSkillTelemetrySinkOptions {
  env?: NodeJS.ProcessEnv
  onSkillActivated: (event: ClaudeSkillActivationEvent) => void
}

function isDisabled(env: NodeJS.ProcessEnv): boolean {
  return (
    env.CONVERGENCE_CLAUDE_SKILL_TELEMETRY === '0' ||
    env.CONVERGENCE_DISABLE_CLAUDE_SKILL_TELEMETRY === '1' ||
    env.CLAUDE_CODE_ENABLE_TELEMETRY === '0'
  )
}

export function shouldUseEmbeddedClaudeSkillTelemetry(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (isDisabled(env)) {
    return false
  }

  return !env.OTEL_LOGS_EXPORTER && !env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT
}

export function buildEmbeddedClaudeSkillTelemetryEnv(
  endpoint: string,
  baseEnv: NodeJS.ProcessEnv = process.env,
) {
  return {
    CLAUDE_CODE_ENABLE_TELEMETRY: '1',
    OTEL_LOGS_EXPORTER: 'otlp',
    OTEL_EXPORTER_OTLP_LOGS_PROTOCOL: 'http/json',
    OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: `${endpoint}/v1/logs`,
    OTEL_LOG_TOOL_DETAILS: '1',
    OTEL_LOGS_EXPORT_INTERVAL: '1000',
    ...(!baseEnv.OTEL_METRICS_EXPORTER
      ? { OTEL_METRICS_EXPORTER: 'none' }
      : {}),
  }
}

function readRequestBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    request.setEncoding('utf8')
    request.on('data', (chunk: string) => {
      body += chunk
      if (body.length > MAX_OTLP_LOG_BODY_BYTES) {
        reject(new Error('OTLP logs payload is too large'))
        request.destroy()
      }
    })
    request.on('end', () => resolve(body))
    request.on('error', reject)
  })
}

function closeServer(server: Server): void {
  try {
    server.close()
  } catch {
    // Best effort only; telemetry must never block provider shutdown.
  }
}

export async function startClaudeSkillTelemetrySink(
  options: ClaudeSkillTelemetrySinkOptions,
): Promise<ClaudeSkillTelemetrySink | null> {
  const env = options.env ?? process.env
  if (!shouldUseEmbeddedClaudeSkillTelemetry(env)) {
    return null
  }

  const server = createServer((request, response) => {
    if (request.method !== 'POST') {
      response.writeHead(204)
      response.end()
      return
    }

    void readRequestBody(request)
      .then((body) => {
        try {
          const payload = body ? JSON.parse(body) : {}
          for (const event of extractClaudeSkillActivationEvents(payload)) {
            options.onSkillActivated(event)
          }
        } catch {
          // Ignore malformed telemetry. Claude sessions must continue.
        }
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end('{}')
      })
      .catch(() => {
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end('{}')
      })
  })

  return new Promise((resolve) => {
    server.on('error', () => {
      closeServer(server)
      resolve(null)
    })
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        closeServer(server)
        resolve(null)
        return
      }

      const endpoint = `http://127.0.0.1:${address.port}`
      resolve({
        env: buildEmbeddedClaudeSkillTelemetryEnv(endpoint, env),
        dispose: () => closeServer(server),
      })
    })
  })
}
