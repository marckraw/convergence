import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react'
import { useAppSettingsStore } from '@/entities/app-settings'
import { postComposerIntent } from '@/entities/composer-intent'
import { useContextDrillStore } from '@/entities/context-drill'
import {
  buildConversationActions,
  useConversationProjectActions,
} from '@/entities/conversation-actions'
import { useDialogStore } from '@/entities/dialog'
import {
  isLocalExecutionHost,
  LOCAL_EXECUTION_HOST_ID,
} from '@/entities/execution-host'
import { requestLoomNavigation } from '@/entities/loom-navigation'
import {
  isSessionCompacting,
  providerCatalogHostLabel,
  providerCatalogSourceForHost,
  useSessionStore,
  type SessionSummary,
} from '@/entities/session'
import { remoteSkillsNotice, useSkillStore } from '@/entities/skill'
import { detectShortcutPlatform } from '@/shared/lib/keyboard-shortcut.pure'
import {
  levelAfterEscape,
  nextFocusIndex,
  placeActionsPanel,
  resolveRoutineRows,
  resolveSkillListState,
  visibleSkillActions,
  type ActionsMenuGroup,
  type ActionsMenuLevel,
  type ActionsPanelPlacement,
  type RoutineRowView,
} from './conversation-actions-menu.pure'
import { ConversationActionsView } from './conversation-actions.presentational'
import { useConversationRoutines } from './use-conversation-routines'

interface ConversationActionsContainerProps {
  session: Pick<
    SessionSummary,
    'id' | 'providerId' | 'status' | 'attention' | 'activity' | 'executionHost'
  >
  /** Whose skill catalog this conversation reads: its project's, or the chat's. */
  catalogScope: { kind: 'project'; projectId: string } | { kind: 'global' }
  /** The conversation surface; the compact lists stay inside it (R1). */
  boundaryRef: RefObject<HTMLElement | null>
}

const GLOBAL_SKILL_CATALOG_ID = 'global'

/** ⌘. on macOS, Ctrl+. elsewhere; not rebindable, and not ⌘K (R6). */
function isActionsShortcut(event: globalThis.KeyboardEvent): boolean {
  if (event.key !== '.' || event.shiftKey || event.altKey) return false
  const mac =
    detectShortcutPlatform(
      typeof navigator === 'undefined' ? undefined : navigator.platform,
    ) === 'mac'
  return mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey
}

function anyDialogOpen(): boolean {
  if (useDialogStore.getState().openDialog !== null) return true
  return document.querySelector('[data-slot="dialog-content"]') !== null
}

/**
 * The Actions button in a conversation (MAR-3393, handoff r1).
 *
 * Owns only the menu: which level is open, where the list sits, and focus.
 * Every sentence it shows is somebody else's -- CA1's routine reasons, the
 * drill resolver's beat and Cancel state, the skill store's failure -- and
 * every action it takes is an existing flow: the composer's own chip path
 * (through a composer intent), the drill store, the compact action, the fork
 * dialog, the composer's account picker and Loom navigation.
 */
export function ConversationActionsContainer({
  session,
  catalogScope,
  boundaryRef,
}: ConversationActionsContainerProps) {
  const [level, setLevel] = useState<ActionsMenuLevel>('closed')
  const [query, setQuery] = useState('')
  const [cancelRefusal, setCancelRefusal] = useState<string | null>(null)
  const [compactError, setCompactError] = useState<string | null>(null)
  const [placement, setPlacement] = useState<ActionsPanelPlacement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const anchorRef = useRef<HTMLDivElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)
  /** Set by a close that must hand focus back to the button. */
  const restoreFocusRef = useRef(false)
  /** The fan entry to focus when Esc comes back from a group. */
  const returnGroupRef = useRef<ActionsMenuGroup | null>(null)
  const open = level !== 'closed'

  const routines = useConversationRoutines({
    sessionId: session.id,
    open,
    status: session.status,
    attention: session.attention,
    activity: session.activity,
  })
  const drillBeat =
    useContextDrillStore((state) => state.beats[session.id]) ?? null
  const drillDescription = useContextDrillStore(
    (state) => state.descriptions[session.id],
  )
  const compacting = isSessionCompacting(session)

  const catalog = useSkillStore((state) => state.catalog)
  const isCatalogLoading = useSkillStore((state) => state.isCatalogLoading)
  const loadingProviders = useSkillStore((state) => state.loadingProviders)
  const catalogError = useSkillStore((state) => state.catalogError)
  const failedProviders = useSkillStore((state) => state.failedProviders)
  const projectActions = useConversationProjectActions(session.id)
  const endpoints = useAppSettingsStore(
    (state) => state.settings.executionHostEndpoints,
  )

  /**
   * The same host the composer feeds `remoteSkillsNotice` for a live session:
   * the session's recorded machine, blank meaning this one, labelled by the
   * same catalog-source derivation. Not a second notion of "remote".
   */
  const hostId = isLocalExecutionHost(session.executionHost)
    ? LOCAL_EXECUTION_HOST_ID
    : (session.executionHost ?? LOCAL_EXECUTION_HOST_ID)
  const notice = remoteSkillsNotice({
    hostId,
    hostLabel: providerCatalogHostLabel(
      providerCatalogSourceForHost(hostId, endpoints).executionHostId,
      endpoints,
    ),
  })

  const skillActions = useMemo(
    () =>
      buildConversationActions({
        routines: [],
        skillCatalog: catalog,
        providerId: session.providerId,
      }),
    [catalog, session.providerId],
  )
  const skillRows = visibleSkillActions({
    actions: skillActions,
    catalog,
    providerId: session.providerId,
    query,
  })
  const skillState = resolveSkillListState({
    catalog,
    catalogId:
      catalogScope.kind === 'project'
        ? catalogScope.projectId
        : GLOBAL_SKILL_CATALOG_ID,
    isCatalogLoading,
    loadingProviderIds: loadingProviders.map((entry) => entry.providerId),
    catalogError,
    failedProviders,
    providerId: session.providerId,
  })
  const routineRows = resolveRoutineRows({
    routines: routines.routines,
    drillBeat,
    drillDescription,
    compacting,
  })

  const fanGroups = useMemo(
    () => [
      { id: 'skills' as const, label: 'Skills' },
      { id: 'routines' as const, label: 'Routines' },
      ...(projectActions.length > 0
        ? [{ id: 'project' as const, label: 'Project' }]
        : []),
    ],
    [projectActions.length],
  )

  const close = useCallback((restoreFocus: boolean) => {
    restoreFocusRef.current = restoreFocus
    returnGroupRef.current = null
    setLevel('closed')
    setQuery('')
    setCancelRefusal(null)
    setCompactError(null)
  }, [])

  const openGroup = useCallback(
    (group: ActionsMenuGroup) => {
      setLevel(group)
      if (group === 'skills') {
        const store = useSkillStore.getState()
        if (catalogScope.kind === 'global') void store.loadGlobalCatalog()
        else void store.loadCatalog(catalogScope.projectId)
      }
    },
    [catalogScope],
  )

  const toggle = useCallback(() => {
    if (level === 'closed') setLevel('fan')
    else close(true)
  }, [close, level])

  // ⌘. opens and closes, while this surface is mounted and no dialog is up.
  useEffect(() => {
    const handler = (event: globalThis.KeyboardEvent) => {
      if (!isActionsShortcut(event) || anyDialogOpen()) return
      event.preventDefault()
      event.stopPropagation()
      toggle()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [toggle])

  // A press outside closes the menu and cancels nothing.
  useEffect(() => {
    if (!open) return
    const handler = (event: PointerEvent) => {
      const anchor = anchorRef.current
      if (
        anchor &&
        event.target instanceof Node &&
        anchor.contains(event.target)
      )
        return
      close(false)
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [close, open])

  // Focus follows the level: the first entry of what just opened, the fan
  // entry a list came back from, or the button after a close that asks.
  useEffect(() => {
    if (level === 'closed') {
      if (restoreFocusRef.current) triggerRef.current?.focus()
      restoreFocusRef.current = false
      return
    }
    const menu = menuRef.current
    if (!menu) return
    if (level === 'fan' && returnGroupRef.current) {
      const index = fanGroups.findIndex(
        (entry) => entry.id === returnGroupRef.current,
      )
      returnGroupRef.current = null
      const items = menu.querySelectorAll<HTMLElement>('[data-actions-item]')
      items[Math.max(0, index)]?.focus()
      return
    }
    if (level === 'skills' && searchRef.current) {
      searchRef.current.focus()
      return
    }
    const items = menu.querySelectorAll<HTMLElement>('[data-actions-item]')
    // A list opens on its first action, past the back control.
    items[level === 'fan' ? 0 : Math.min(1, items.length - 1)]?.focus()
    // Keyed on the level (and the fan's shape), never on content: a re-render
    // inside a level keeps focus where the keyboard put it.
  }, [level, fanGroups])

  // Measured on every open of a list and on resize: 286 wide, upward,
  // inside the surface with an 8 px margin.
  const isGroup = level !== 'closed' && level !== 'fan'
  useLayoutEffect(() => {
    if (!isGroup) return
    const measure = () => {
      const boundary = boundaryRef.current?.getBoundingClientRect()
      const anchor = anchorRef.current?.getBoundingClientRect()
      if (!boundary || !anchor || boundary.width === 0) {
        setPlacement(null)
        return
      }
      setPlacement(placeActionsPanel({ boundary, anchor }))
    }
    measure()
    window.addEventListener('resize', measure)
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    if (observer && boundaryRef.current) observer.observe(boundaryRef.current)
    return () => {
      window.removeEventListener('resize', measure)
      observer?.disconnect()
    }
  }, [boundaryRef, isGroup])

  const onMenuKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        const next = levelAfterEscape(level)
        if (next === 'closed') {
          close(true)
          return
        }
        returnGroupRef.current =
          level === 'fan' || level === 'closed' ? null : level
        setQuery('')
        setLevel(next)
        return
      }
      const menu = menuRef.current
      if (!menu) return
      const items = Array.from(
        menu.querySelectorAll<HTMLElement>('[data-actions-item]'),
      )
      const index = items.indexOf(document.activeElement as HTMLElement)
      const target = event.target as HTMLElement
      const inSearch = target === searchRef.current
      // Home/End belong to the search text while typing in it.
      if (inSearch && (event.key === 'Home' || event.key === 'End')) return
      const next = nextFocusIndex(event.key, index, items.length)
      if (next !== null) {
        event.preventDefault()
        items[next]?.focus()
        return
      }
      // Typing on a skill row goes to the search.
      if (
        level === 'skills' &&
        !inSearch &&
        event.key.length === 1 &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        event.key !== ' '
      ) {
        searchRef.current?.focus()
      }
    },
    [close, level],
  )

  const onSkill = useCallback(
    (id: string) => {
      const action = skillRows.find((row) => row.id === id)
      if (!action?.offered) return
      postComposerIntent(session.id, {
        kind: 'add-skill',
        skill: action.skill,
      })
      // Focus goes to the composer, which moves it itself.
      close(false)
    },
    [close, session.id, skillRows],
  )

  const onRoutine = useCallback(
    (id: RoutineRowView['id']) => {
      setCancelRefusal(null)
      setCompactError(null)
      switch (id) {
        case 'drill':
          // Started, not awaited: the store owns the promise and the beats
          // arrive on `contextDrill:changed`, open menu or not.
          void useContextDrillStore.getState().run(session.id)
          return
        case 'compact':
          void useSessionStore
            .getState()
            .compactSessionContext(session.id)
            .catch((error: unknown) => {
              setCompactError(
                error instanceof Error ? error.message : String(error),
              )
            })
          return
        case 'fork':
          close(false)
          useDialogStore
            .getState()
            .open('session-fork', { parentSessionId: session.id })
          return
        case 'hand-off':
          close(false)
          postComposerIntent(session.id, { kind: 'open-account-picker' })
          return
      }
    },
    [close, session.id],
  )

  const onCancelDrill = useCallback(() => {
    void useContextDrillStore
      .getState()
      .cancel(session.id)
      .then(setCancelRefusal)
  }, [session.id])

  const onProject = useCallback(
    (id: string) => {
      const action = projectActions.find((entry) => entry.id === id)
      if (!action?.offered || !action.navigation) return
      close(false)
      requestLoomNavigation(action.navigation)
    },
    [close, projectActions],
  )

  return (
    <ConversationActionsView
      level={level}
      fanGroups={fanGroups}
      placement={placement}
      skills={{
        state: skillState,
        rows: skillRows.map((row) => ({
          id: row.id,
          label: row.label,
          offered: row.offered,
          reason: row.reason ?? null,
        })),
        notice,
        query,
      }}
      routines={{
        loaded: routines.loaded,
        error: routines.error,
        rows: routineRows,
        cancelRefusal,
        compactError,
        running: drillBeat !== null,
      }}
      projectRows={projectActions.map((action) => ({
        id: action.id,
        label: action.label,
        offered: action.offered,
        reason: action.reason ?? null,
      }))}
      triggerRef={triggerRef}
      anchorRef={anchorRef}
      menuRef={menuRef}
      searchRef={searchRef}
      onToggle={toggle}
      onClose={() => close(true)}
      onBack={() => {
        returnGroupRef.current =
          level === 'fan' || level === 'closed' ? null : level
        setQuery('')
        setLevel('fan')
      }}
      onOpenGroup={openGroup}
      onMenuKeyDown={onMenuKeyDown}
      onQueryChange={setQuery}
      onSkill={onSkill}
      onRoutine={onRoutine}
      onCancelDrill={onCancelDrill}
      onProject={onProject}
    />
  )
}
