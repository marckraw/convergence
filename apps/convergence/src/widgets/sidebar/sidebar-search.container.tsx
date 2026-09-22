import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isEditableTarget } from '@/shared/lib/editable-target.pure'
import type { SessionSummary } from '@/entities/session'
import { narrowSidebarSessionLists } from '@/shared/lib/name-search.pure'
import { SidebarSearchField } from './sidebar-search-field.presentational'
import { SidebarSearchToggle } from './sidebar-search-toggle.presentational'

export function useSidebarSearchShortcut({
  collapsed,
  expand,
  onRequest,
}: {
  collapsed: boolean
  expand: () => void
  onRequest: () => void
}) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (
        !(event.metaKey || event.ctrlKey) ||
        event.shiftKey ||
        event.altKey ||
        event.key.toLowerCase() !== 'f'
      )
        return
      if (
        event.target instanceof Element &&
        event.target.closest('[role="dialog"]') !== null
      )
        return
      const inSearch =
        event.target instanceof Element &&
        event.target.closest('[data-sidebar-search]') !== null
      if (isEditableTarget(event.target) && !inSearch) return
      event.preventDefault()
      event.stopPropagation()
      if (collapsed) expand()
      onRequest()
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [collapsed, expand, onRequest])
}

/**
 * Owns the sidebar conversation-name search query (never persisted) and
 * narrows both session lists together. Used only by SidebarConversations —
 * the production container that feeds Activity and the project tree — so
 * deleting either filter turns that container's tests red (R2/R7).
 */
export function useSidebarConversationSearch(options: {
  globalSessions: readonly SessionSummary[]
  sessions: readonly SessionSummary[]
  collapsed: boolean
  searchRequest: number
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const focusRequest = useRef(0)
  const [focusToken, setFocusToken] = useState(0)

  const lastSearchRequest = useRef(0)
  const selectOnFocus = useRef(false)

  useEffect(() => {
    if (options.searchRequest === lastSearchRequest.current) return
    lastSearchRequest.current = options.searchRequest
    selectOnFocus.current = open
    setOpen(true)
    focusRequest.current += 1
    setFocusToken(focusRequest.current)
  }, [options.searchRequest, open])

  useEffect(() => {
    if (!options.collapsed) return
    setOpen(false)
    setQuery('')
  }, [options.collapsed])

  useEffect(() => {
    if (!open || focusToken === 0) return
    inputRef.current?.focus()
    if (selectOnFocus.current) inputRef.current?.select()
    selectOnFocus.current = false
  }, [open, focusToken])

  const narrowed = useMemo(
    () =>
      narrowSidebarSessionLists(
        options.globalSessions,
        options.sessions,
        query,
      ),
    [options.globalSessions, options.sessions, query],
  )

  const toggle = useCallback(() => {
    setOpen((wasOpen) => {
      if (wasOpen) {
        setQuery('')
        return false
      }
      focusRequest.current += 1
      setFocusToken(focusRequest.current)
      return true
    })
  }, [])

  const clearQuery = useCallback(() => setQuery(''), [])

  const onEscape = useCallback(() => {
    if (query.length > 0) {
      setQuery('')
      return
    }
    setOpen(false)
  }, [query])

  const toggleControl = <SidebarSearchToggle open={open} onToggle={toggle} />

  const field = open ? (
    <SidebarSearchField
      query={query}
      inputRef={inputRef}
      onQueryChange={setQuery}
      onClear={clearQuery}
      onEscape={onEscape}
    />
  ) : null

  return {
    open,
    query,
    setQuery,
    toggle,
    clearQuery,
    onEscape,
    inputRef,
    searchedGlobalSessions: narrowed.globalSessions,
    searchedSessions: narrowed.sessions,
    toggleControl,
    field,
  }
}
