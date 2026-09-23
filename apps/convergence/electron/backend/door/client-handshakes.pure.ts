import type {
  RecordedRequest,
  RecordedRpc,
} from '../../../tools/probe-mcp-door.mjs'

/**
 * Reading the Door S0 fixture (MAR-3173): the facts about each MCP client
 * are DERIVED from the requests `tools/probe-mcp-door.mjs --capture`
 * recorded, never typed by hand, so the fixture can only say what a client
 * sent.
 */

export type RecordedVariant = {
  command: string
  exit: number | string
  requests: RecordedRequest[]
}

export type RecordedClient = {
  client: string
  version: string
  capturedAt: string
  connect: RecordedVariant
  unauthorized?: RecordedVariant
  modelTurn?: RecordedVariant
}

export type NotMeasured = 'not measured'

function rpcOf(request: RecordedRequest): RecordedRpc[] {
  return Array.isArray(request.rpc) ? request.rpc : []
}

/**
 * The HTTP status the probe answered for the first request carrying
 * `method`, or `'not measured'` when the client never sent it — a skipped or
 * refused `tools/call` is a gap in the record, never a guessed 200.
 */
export function statusOf(
  variant: RecordedVariant | undefined,
  method: string,
): number | NotMeasured {
  const request = variant?.requests.find((candidate) =>
    rpcOf(candidate).some((rpc) => rpc.method === method),
  )
  return request ? request.response.status : 'not measured'
}

/** R2's six facts, read from what the client sent on its connect command. */
export function handshakeOf(entry: RecordedClient) {
  const requests = entry.connect.requests
  const rpcs = requests.flatMap(rpcOf)
  return {
    protocolVersion: rpcs[0]?.protocolVersion ?? null,
    sendsInitialize: rpcs.some((rpc) => rpc.method === 'initialize'),
    sendsMcpMethodHeader: requests.some(
      (request) => request.mcpMethodHeader !== null,
    ),
    sendsSessionId: requests.some((request) => request.mcpSessionIdSent),
    authorizationArrived: requests.every(
      (request) => request.authorization.present,
    ),
    toolsListStatus: statusOf(entry.connect, 'tools/list'),
  }
}
