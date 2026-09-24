import type {
  SessionPermissionConfig,
  SessionSummary,
} from '@/entities/session'
import type { ComposerSessionContext } from './composer.types'

/** The three summary lists the composer can find its Session in. */
export interface ComposerSessionLists {
  sessions: readonly SessionSummary[]
  globalChatSessions: readonly SessionSummary[]
  globalSessions: readonly SessionSummary[]
}

/**
 * The Session this composer is aimed at: the STORED summary, never a copy
 * (MAR-3325).
 *
 * Used as a store selector, so what it returns is what the composer redraws
 * for. The store replaces only the summary that changed and keeps every other
 * one by reference, so the answer here keeps its identity while other
 * conversations stream — whereas subscribing to a whole list redrew the
 * composer for every summary in the app. It must never build a value: a
 * selector returning something new on each call spins the app (run 16).
 *
 * The scoped list first — the project or chat that is open — then
 * `globalSessions`: aimed from Mission Control the Session can belong to a
 * project nobody has opened, and a composer that cannot find its Session
 * silently becomes a "start a new session" composer.
 */
export function findComposerSession(
  lists: ComposerSessionLists,
  contextKind: ComposerSessionContext['kind'],
  activeSessionId: string | null,
): SessionSummary | undefined {
  if (!activeSessionId) return undefined
  const scoped =
    contextKind === 'project' ? lists.sessions : lists.globalChatSessions
  return (
    scoped.find((session) => session.id === activeSessionId) ??
    lists.globalSessions.find((session) => session.id === activeSessionId)
  )
}

/**
 * A Session's permission config as a value (MAR-3325).
 *
 * The summary arrives over IPC, so its `permissionConfig` is a new object on
 * every summary even when nothing in it moved. Keyed by identity, the effect
 * that copies it into the composer re-ran — and committed — for every summary
 * of the open conversation. Keyed by this string it re-runs when a field does.
 *
 * Every field of the type, in a fixed order, so two configs that mean the same
 * thing always make the same key. `null` for a session that recorded none.
 */
export function sessionPermissionConfigKey(
  config: SessionPermissionConfig | null | undefined,
): string | null {
  if (!config) return null
  return JSON.stringify([
    config.preset,
    config.codex ? [config.codex.approvalPolicy, config.codex.sandbox] : null,
    config.claudeCode ? config.claudeCode.permissionMode : null,
  ])
}

/**
 * The config a key was made from, rebuilt field for field. The inverse of
 * {@link sessionPermissionConfigKey}: `fromKey(key(c))` equals `c` for every
 * config of the type, which the tests pin.
 */
export function sessionPermissionConfigFromKey(
  key: string | null,
): SessionPermissionConfig | null {
  if (key === null) return null
  const [preset, codex, claudeCode] = JSON.parse(key) as [
    SessionPermissionConfig['preset'],
    (
      | [
          NonNullable<SessionPermissionConfig['codex']>['approvalPolicy'],
          NonNullable<SessionPermissionConfig['codex']>['sandbox'],
        ]
      | null
    ),
    NonNullable<SessionPermissionConfig['claudeCode']>['permissionMode'] | null,
  ]
  return {
    preset,
    ...(codex
      ? { codex: { approvalPolicy: codex[0], sandbox: codex[1] } }
      : {}),
    ...(claudeCode ? { claudeCode: { permissionMode: claudeCode } } : {}),
  }
}

/**
 * Whether two composer contexts aim at the same place (MAR-3325).
 *
 * The composer is a memo boundary, and callers write its context inline — a
 * new object every render of a parent that redraws for every streamed token.
 * Compared by value, the boundary holds whoever the caller is.
 */
export function sameComposerContext(
  a: ComposerSessionContext,
  b: ComposerSessionContext,
): boolean {
  if (a === b) return true
  if (a.kind !== b.kind || a.activeSessionId !== b.activeSessionId) {
    return false
  }
  if (a.kind === 'project' && b.kind === 'project') {
    return a.projectId === b.projectId && a.workspaceId === b.workspaceId
  }
  return true
}
