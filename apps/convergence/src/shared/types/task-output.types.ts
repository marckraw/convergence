/**
 * Why a remote host did not give a task's output tail (`tasks.output.v1`,
 * MAR-4275). The first five are the host's own refusal codes; `unsupported`
 * is a host that does not serve the route, and `malformed` an answer that is
 * not the task's output.
 */
export type RemoteTaskOutputRefusalCode =
  | 'unsupported'
  | 'session-unknown'
  | 'task-unknown'
  | 'no-output'
  | 'read-refused'
  | 'rejected'
  | 'malformed'

/**
 * A remote task's output tail, or the reason there is none. A host that could
 * not be reached at all is not here: that read throws.
 */
export type RemoteTaskOutputReading =
  | {
      kind: 'output'
      /** Whole lines, redacted by the host. */
      text: string
      /** The task's status when the host read the file. */
      status: 'running' | 'completed' | 'failed' | 'stopped' | 'unknown'
      /** The window does not hold the output's start. */
      truncated: boolean
      /** The output file's size on the host, in bytes. */
      totalBytes: number
      /** When the host read it: an RFC 3339 timestamp. */
      readAt: string
    }
  | { kind: 'refused'; code: RemoteTaskOutputRefusalCode }
