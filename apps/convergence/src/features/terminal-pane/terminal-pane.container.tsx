import { useEffect, useLayoutEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { ClipboardAddon } from '@xterm/addon-clipboard'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import '@xterm/xterm/css/xterm.css'

import { terminalApi, useTerminalStore } from '@/entities/terminal'
import { buildXtermOptions } from './xterm-setup.pure'
import { xtermRegistry } from './xterm-registry'

interface TerminalPaneContainerProps {
  sessionId: string
  tabId: string
  isFocused?: boolean
}

export const TerminalPaneContainer = ({
  sessionId,
  tabId,
  isFocused,
}: TerminalPaneContainerProps) => {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const markTabExited = useTerminalStore((s) => s.markTabExited)

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return
    let disposed = false
    const unsubs: Array<() => void> = []

    const term = new Terminal(buildXtermOptions())
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.loadAddon(new WebLinksAddon())
    term.loadAddon(new ClipboardAddon())
    const unicode11 = new Unicode11Addon()
    term.loadAddon(unicode11)
    term.unicode.activeVersion = '11'
    term.open(host)
    try {
      term.loadAddon(new WebglAddon())
    } catch {
      // WebGL unavailable; fall back to canvas/DOM renderer
    }
    try {
      fit.fit()
    } catch {
      // host has zero dimensions during initial mount; resize effect retries
    }

    termRef.current = term
    fitRef.current = fit
    const unregister = xtermRegistry.register(tabId, () => term.clear())
    unsubs.push(unregister)

    const boot = async () => {
      const { initialBuffer } = await terminalApi.attach(tabId)
      if (disposed) return
      if (initialBuffer) term.write(initialBuffer)

      unsubs.push(
        terminalApi.onData(tabId, (data) => {
          term.write(data)
        }),
      )
      unsubs.push(
        terminalApi.onExit(tabId, ({ exitCode }) => {
          markTabExited(sessionId, tabId, exitCode)
          term.writeln(`\r\n[process exited with code ${exitCode}]`)
        }),
      )
      const inputSub = term.onData((data) => {
        void terminalApi.write(tabId, data)
      })
      unsubs.push(() => inputSub.dispose())

      if (term.cols > 0 && term.rows > 0) {
        void terminalApi.resize(tabId, term.cols, term.rows)
      }
    }

    void boot()

    return () => {
      disposed = true
      for (const unsub of unsubs) {
        try {
          unsub()
        } catch {
          // listener already torn down
        }
      }
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [sessionId, tabId, markTabExited])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const observer = new ResizeObserver(() => {
      const fit = fitRef.current
      const term = termRef.current
      if (!fit || !term) return
      try {
        fit.fit()
      } catch {
        return
      }
      if (term.cols > 0 && term.rows > 0) {
        void terminalApi.resize(tabId, term.cols, term.rows)
      }
    })
    observer.observe(host)
    return () => {
      observer.disconnect()
    }
  }, [tabId])

  useEffect(() => {
    if (isFocused) {
      termRef.current?.focus()
    }
  }, [isFocused])

  return (
    <div
      className="flex min-h-0 flex-1 overflow-hidden bg-[#0b0b0f] px-2 py-1.5"
      data-testid="terminal-pane-host"
      data-tab-id={tabId}
    >
      <div ref={hostRef} className="h-full w-full min-w-0" />
    </div>
  )
}
