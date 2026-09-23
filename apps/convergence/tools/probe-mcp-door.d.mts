/**
 * Types for the half of `probe-mcp-door.mjs` that
 * `electron/backend/door/client-handshakes.pure.test.ts` imports (MAR-3173).
 * The app's tsconfig does not check JavaScript, so without this file the
 * strict typecheck refuses the import.
 */

export declare const HELLO_TEXT: string
export declare const TOKEN_ENV_VAR: string
export declare const SERVER_NAME: string
export declare const MCP_PATH: string

export interface RecordedRpc {
  method: string | null
  kind: 'request' | 'notification' | 'response'
  protocolVersion: string | null
  clientInfo: Record<string, unknown> | null
  metaKeys: string[]
  toolName: string | null
}

export interface RecordedRequest {
  httpMethod: string
  path: string
  headerNames: string[]
  authorization: { present: false } | { present: true; scheme: string }
  host: string | null
  origin: string | null
  userAgent: string | null
  mcpMethodHeader: string | null
  mcpNameHeader: string | null
  mcpProtocolVersionHeader: string | null
  mcpSessionIdSent: boolean
  rpc: RecordedRpc[] | { unparsable: true } | null
  response: {
    status: number
    contentType: string | null
    mcpSessionIdReturned: boolean
  }
}

export declare function recordRequest(exchange: {
  method: string
  path: string
  headers: Record<string, string | string[] | undefined>
  body: string
  response: { status: number; headers: Record<string, string> }
}): RecordedRequest

export declare function startHelloServer(options: {
  host: string
  port: number
  token: string
  onRecord: (record: RecordedRequest) => void
}): Promise<{ url: string; close: () => Promise<void> }>

export declare function clientEnvironment(
  inherited: Record<string, string | undefined>,
  overrides: Record<string, string>,
  token: string,
): Record<string, string | undefined>
