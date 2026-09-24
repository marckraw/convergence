import {
  memo,
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
  isSearchCaretKey,
  levelAfterEscape,
  levelEntryFocusIndex,
  nextFocusIndex,
  placeActionsPanel,
  projectSkillsNeedLoad,
  resolveRoutineRows,
  resolveSkillListState,
  visibleSkillActions,
  type ActionsMenuGroup,
  type ActionsMenuLevel,
  type ActionsPanelPlacement,
  type RoutineRowView,
} from './conversation-actions-menu.pure'
import { ConversationActionsView } from './conversation-actions.presentational'
import type { ConversationActionsViewProps } from './conversation-actions.types'
import { useConversationRoutines } from './use-conversation-routines'

/**
 * Primitives only, so the memo below holds while a reply streams (R16): the
 * surface redraws on every streamed append, and none of these move with it.
 */
interface ConversationActionsContainerProps {
  sessionId: string
  providerId: string
  status: SessionSummary['status']
  attention: SessionSummary['attention']
  activity: SessionSummary['activity']
  executionHost: SessionSummary['executionHost']
  /** This conversation's project, whose skill catalog it reads; null for a chat. */
  catalogProjectId: string | null
  /** The conversation surface; the compact lists stay inside it (R1). */
  boundaryRef: RefObject<HTMLElement | null>
}

type RoutineId = RoutineRowView['id']

const GLOBAL_SKILL_CATALOG_ID = 'global'
const NO_PENDING: ReadonlySet<RoutineId> = new Set()
/** What a closed Skills list costs: nothing is filtered or derived (R16). */
const SKILLS_NOT_OPEN: ConversationActionsViewProps['skills'] = {
  state: { kind: 'loading' },
  rows: [],
  notice: null,
  query: '',
}

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

/** Nothing inside an `inert` ancestor (expanded Loom) answers ⌘. (R13). */
function insideInert(element: Element | null): boolean {
  return element?.closest('[inert]') != null
}

function focusIsLost(): boolean {
  const active = document.activeElement
  return active === null || active === document.body
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
function ConversationActionsContainerView({
  sessionId,
  providerId,
  status,
  attention,
  activity,
  executionHost,
  catalogProjectId,
  boundaryRef,
}: ConversationActionsContainerProps) {
  const [level, setLevel] = useState<ActionsMenuLevel>('closed')
  const [query, setQuery] = useState('')
  const [cancelRefusal, setCancelRefusal] = useState<string | null>(null)
  const [compactError, setCompactError] = useState<string | null>(null)
  const [placement, setPlacement] = useState<ActionsPanelPlacement | null>(null)
  const [pending, setPending] = useState<ReadonlySet<RoutineId>>(NO_PENDING)
  /** The same set, readable in the click that has not re-rendered yet (R15). */
  const pendingRef = useRef<ReadonlySet<RoutineId>>(NO_PENDING)
  /**
   * Which open this is. A close moves it on, so an answer that lands after
   * the menu it was asked from has closed is dropped, never shown on the
   * next open (R14).
   */
  const openGenerationRef = useRef(0)
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
    sessionId,
    open,
    status,
    attention,
    activity,
  })
  const drillBeat =
    useContextDrillStore((state) => state.beats[sessionId]) ?? null
  const drillDescription = useContextDrillStore(
    (state) => state.descriptions[sessionId],
  )
  const compacting = isSessionCompacting({ activity })

  // The skill catalog is read only while Skills is open: a closed menu is not
  // redrawn by a catalog the composer's own picker is loading (R16).
  const skillsOpen = level === 'skills'
  const catalog = useSkillStore((state) => (skillsOpen ? state.catalog : null))
  const isCatalogLoading = useSkillStore(
    (state) => skillsOpen && state.isCatalogLoading,
  )
  const loadingProviders = useSkillStore((state) =>
    skillsOpen ? state.loadingProviders : null,
  )
  const catalogError = useSkillStore((state) =>
    skillsOpen ? state.catalogError : null,
  )
  const failedProviders = useSkillStore((state) =>
    skillsOpen ? state.failedProviders : null,
  )
  const projectActions = useConversationProjectActions(sessionId)
  const endpoints = useAppSettingsStore(
    (state) => state.settings.executionHostEndpoints,
  )

  const skillActions = useMemo(
    () =>
      skillsOpen
        ? buildConversationActions({
            routines: [],
            skillCatalog: catalog,
            providerId,
          })
        : [],
    [catalog, providerId, skillsOpen],
  )
  const skills = useMemo<ConversationActionsViewProps['skills']>(() => {
    if (!skillsOpen) return SKILLS_NOT_OPEN
    /**
     * The same host the composer feeds `remoteSkillsNotice` for a live
     * session: the session's recorded machine, blank meaning this one,
     * labelled by the same catalog-source derivation. Not a second notion of
     * "remote".
     */
    const hostId = isLocalExecutionHost(executionHost)
      ? LOCAL_EXECUTION_HOST_ID
      : (executionHost ?? LOCAL_EXECUTION_HOST_ID)
    return {
      state: resolveSkillListState({
        catalog,
        catalogId: catalogProjectId ?? GLOBAL_SKILL_CATALOG_ID,
        isCatalogLoading,
        loadingProviderIds: (loadingProviders ?? []).map(
          (entry) => entry.providerId,
        ),
        catalogError,
        failedProviders: failedProviders ?? {},
        providerId,
      }),
      rows: visibleSkillActions({
        actions: skillActions,
        catalog,
        providerId,
        query,
      }).map((row) => ({
        id: row.id,
        label: row.label,
        offered: row.offered,
        reason: row.reason ?? null,
      })),
      notice: remoteSkillsNotice({
        hostId,
        hostLabel: providerCatalogHostLabel(
          providerCatalogSourceForHost(hostId, endpoints).executionHostId,
          endpoints,
        ),
      }),
      query,
    }
  }, [
    catalog,
    catalogError,
    catalogProjectId,
    endpoints,
    executionHost,
    failedProviders,
    isCatalogLoading,
    loadingProviders,
    providerId,
    query,
    skillActions,
    skillsOpen,
  ])
  const routineRows = resolveRoutineRows({
    routines: routines.routines,
    drillBeat,
    drillDescription,
    compacting,
    pending,
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
    openGenerationRef.current += 1
    setLevel('closed')
    setQuery('')
    setCancelRefusal(null)
    setCompactError(null)
  }, [])

  const openGroup = useCallback(
    (group: ActionsMenuGroup) => {
      setLevel(group)
      if (group !== 'skills') return
      const store = useSkillStore.getState()
      if (catalogProjectId === null) {
        void store.loadGlobalCatalog()
        return
      }
      // R9: skills the store already holds for this project are the answer.
      if (
        projectSkillsNeedLoad({
          catalogProjectId: store.catalog?.projectId ?? null,
          projectId: catalogProjectId,
        })
      ) {
        void store.loadCatalog(catalogProjectId)
      }
    },
    [catalogProjectId],
  )

  const toggle = useCallback(() => {
    if (level === 'closed') setLevel('fan')
    else close(true)
  }, [close, level])

  // ⌘. opens and closes, while this surface is mounted, can be seen (R13),
  // and no dialog is up.
  useEffect(() => {
    const handler = (event: globalThis.KeyboardEvent) => {
      if (!isActionsShortcut(event) || anyDialogOpen()) return
      if (insideInert(anchorRef.current)) return
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
      // A close that asked for the button gets it; so does one whose
      // destination could not take focus (a disabled composer), rather than
      // leaving it on <body>. A destination that took it keeps it.
      if (restoreFocusRef.current || focusIsLost()) triggerRef.current?.focus()
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
    focusLevelEntry(menu, level)
    // Keyed on the level (and the fan's shape), never on content: a re-render
    // inside a level keeps focus where the keyboard put it.
  }, [level, fanGroups])

  // R10: while the menu is open, focus never falls to <body>. When the
  // focused entry unmounts under the keyboard (the search replaced by
  // Loading, Cancel or "Close menu" when a drill ends), the level's entry or
  // the menu root takes it, so Esc and the arrows keep working. Runs after
  // every render, because any of them can remove the focused node.
  useLayoutEffect(() => {
    if (level === 'closed' || !focusIsLost()) return
    const menu = menuRef.current
    if (menu) focusLevelEntry(menu, level)
  })

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
      // The caret keys belong to the search text while typing in it (R11).
      if (inSearch && isSearchCaretKey(event.key)) return
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
      const action = skillActions.find(
        (row): row is Extract<typeof row, { kind: 'skill' }> =>
          row.kind === 'skill' && row.id === id,
      )
      if (!action?.offered) return
      postComposerIntent(sessionId, {
        kind: 'add-skill',
        skill: action.skill,
      })
      // Focus goes to the composer, which moves it itself.
      close(false)
    },
    [close, sessionId, skillActions],
  )

  const setRoutinePending = useCallback((id: RoutineId, on: boolean) => {
    if (pendingRef.current.has(id) === on) return
    const next = new Set(pendingRef.current)
    if (on) next.add(id)
    else next.delete(id)
    pendingRef.current = next
    setPending(next)
  }, [])

  const onRoutine = useCallback(
    (id: RoutineId) => {
      // One start per activation: a started routine is pending until its
      // call settles (R15). Once the backend's beat or compacting activity
      // arrives, that is what the row draws (`resolveRoutineRows`).
      if (pendingRef.current.has(id)) return
      setCancelRefusal(null)
      setCompactError(null)
      const generation = openGenerationRef.current
      switch (id) {
        case 'drill':
          // Not awaited: the store owns the promise and the beats arrive on
          // `contextDrill:changed`, open menu or not.
          setRoutinePending('drill', true)
          void useContextDrillStore
            .getState()
            .run(sessionId)
            .finally(() => setRoutinePending('drill', false))
          return
        case 'compact':
          setRoutinePending('compact', true)
          void useSessionStore
            .getState()
            .compactSessionContext(sessionId)
            .catch((error: unknown) => {
              // An answer to a menu that has since closed is not this one's.
              if (openGenerationRef.current !== generation) return
              setCompactError(
                error instanceof Error ? error.message : String(error),
              )
            })
            .finally(() => setRoutinePending('compact', false))
          return
        case 'fork':
          close(false)
          useDialogStore
            .getState()
            .open('session-fork', { parentSessionId: sessionId })
          return
        case 'hand-off':
          close(false)
          postComposerIntent(sessionId, { kind: 'open-account-picker' })
          return
      }
    },
    [close, sessionId, setRoutinePending],
  )

  const onCancelDrill = useCallback(() => {
    const generation = openGenerationRef.current
    void useContextDrillStore
      .getState()
      .cancel(sessionId)
      .then((refusal) => {
        if (openGenerationRef.current !== generation) return
        setCancelRefusal(refusal)
      })
  }, [sessionId])

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
      skills={skills}
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

/**
 * The level's entry (R6/R10): the fan's first group, a list's first action
 * past its back control, and the menu root when the level has no entry.
 */
function focusLevelEntry(menu: HTMLElement, level: ActionsMenuLevel): void {
  if (level === 'skills') {
    const search = menu.querySelector<HTMLElement>('input[data-actions-item]')
    if (search) {
      search.focus()
      return
    }
  }
  const items = menu.querySelectorAll<HTMLElement>('[data-actions-item]')
  const index = levelEntryFocusIndex(level, items.length)
  if (index >= 0) items[index]?.focus()
  else menu.focus()
}

/**
 * The Actions button, a memo on primitive props: a streamed reply redraws
 * the surface on every append and must not redraw a closed menu (R16).
 */
export const ConversationActionsContainer = memo(
  ConversationActionsContainerView,
)
