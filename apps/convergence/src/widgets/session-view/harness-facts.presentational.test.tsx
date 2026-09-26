import {
  readClaudeHarnessFact,
  readClaudeMcpStatus,
} from '../../../electron/backend/provider/claude-code/claude-harness.pure'
import { readHarnessFactRow } from '../../../electron/backend/session/harness-fact-row.pure'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SessionHarnessFacts } from '@/shared/types/harness-facts.types'
import { HarnessAlertChip } from './harness-alert-chip.presentational'
import { HarnessFactsSections } from './harness-facts.presentational'
import { harnessPill } from './harness-facts.pure'

/**
 * The harness as the header draws it since MAR-3429 CH4 R3: its reading (the
 * label the alert chip carries) beside the sections Details holds. The
 * sections are always drawn here, so a press on the reading opens nothing.
 */
function HarnessFactsView(props: Parameters<typeof HarnessFactsSections>[0]) {
  const pill = harnessPill(props.facts)
  return (
    <>
      <span data-testid="harness-pill" data-alert={pill.alert}>
        {pill.label}
      </span>
      <HarnessFactsSections {...props} />
    </>
  )
}
it('shows the same hook count and bounded output in the popover — mutation drop hook rows turns red', () => {
  const facts: SessionHarnessFacts = {
    turns: [],
    currentTurn: {
      turnId: 't',
      hooks: [
        {
          id: 'h',
          name: 'PreToolUse:Bash',
          event: 'PreToolUse',
          status: 'ok',
          startedAt: 'now',
          durationMs: 17,
          output: { truncated: true, bytes: 9000, preview: 'bounded preview' },
        },
      ],
      retries: null,
      denials: null,
    },
    compactions: [],
    init: null,
    rateLimit: null,
  }
  render(
    <HarnessFactsView
      facts={facts}
      error={null}
      loading={false}
      onRetry={vi.fn()}
    />,
  )
  fireEvent.pointerDown(screen.getByTestId('harness-pill'), {
    button: 0,
    ctrlKey: false,
    pointerType: 'mouse',
  })
  const hooks = screen.queryByRole('region', { name: 'Hooks' })
  expect({
    pill: screen.getByTestId('harness-pill').textContent,
    name:
      hooks &&
      within(hooks).queryByText('PreToolUse:Bash · PreToolUse')?.textContent,
    output: screen.queryByText('Output · truncated')?.textContent,
    preview: screen.queryByText('bounded preview')?.textContent,
    duration: screen.queryByText('ok · 17 ms')?.textContent,
  }).toEqual({
    pill: 'Harness · hooks 1',
    name: 'PreToolUse:Bash · PreToolUse',
    output: 'Output · truncated',
    preview: 'bounded preview',
    duration: 'ok · 17 ms',
  })
})

it('R2prime placeholder is visible — mutation hide truncated record turns red', () => {
  const facts: SessionHarnessFacts = {
    turns: [],
    currentTurn: null,
    compactions: [],
    rateLimit: null,
    init: {
      kind: 'harness.init',
      at: 'now',
      truncated: true,
      claudeCodeVersion: null,
      model: null,
      permissionMode: null,
      mcpServers: null,
      plugins: null,
      capabilities: null,
      tools: null,
      skills: null,
      slashCommands: null,
    },
  }
  render(
    <HarnessFactsView
      facts={facts}
      loading={false}
      error={null}
      onRetry={vi.fn()}
    />,
  )
  fireEvent.pointerDown(screen.getByTestId('harness-pill'), {
    button: 0,
    ctrlKey: false,
    pointerType: 'mouse',
  })
  expect(screen.queryByText('Harness record truncated')).not.toBeNull()
})

it.each([
  ['connected', false],
  ['pending', false],
  ['disabled', false],
  ['failed', true],
  ['needs-auth', true],
] as const)(
  'I4 rendered MCP %s — mutation invert alert vocabulary turns red',
  (status, alert) => {
    const facts: SessionHarnessFacts = {
      turns: [],
      currentTurn: null,
      compactions: [],
      rateLimit: null,
      init: {
        kind: 'harness.init',
        at: 'now',
        claudeCodeVersion: null,
        model: null,
        permissionMode: null,
        mcpServers: {
          total: 1,
          connected: 0,
          others: [{ name: 'server', status }],
          omittedAlerts: 0,
          omitted: 0,
        },
        plugins: null,
        capabilities: null,
        tools: null,
        skills: null,
        slashCommands: null,
      },
    }
    render(
      <HarnessFactsView
        facts={facts}
        loading={false}
        error={null}
        onRetry={vi.fn()}
      />,
    )
    fireEvent.pointerDown(screen.getByTestId('harness-pill'), {
      button: 0,
      ctrlKey: false,
      pointerType: 'mouse',
    })
    expect({
      pill: screen.getByTestId('harness-pill').getAttribute('data-alert'),
      row: screen
        .getByText(`server · ${status}`)
        .classList.contains('text-destructive'),
    }).toEqual({ pill: String(alert), row: alert })
  },
)

it('R2triple bounded init stays useful — mutation hide omitted counts or alert turns red', () => {
  const facts: SessionHarnessFacts = {
    turns: [],
    currentTurn: null,
    compactions: [],
    rateLimit: null,
    init: {
      kind: 'harness.init',
      at: 'now',
      claudeCodeVersion: null,
      model: 'cut',
      permissionMode: null,
      fieldBounds: { model: { truncated: true, bytes: 900 } },
      mcpServers: {
        total: 121,
        connected: 1,
        others: [{ name: 'linear', status: 'failed' }],
        omittedAlerts: 0,
        omitted: 104,
      },
      plugins: { count: 120, names: ['plugin'], omitted: 104 },
      capabilities: { values: ['control'], omitted: 88 },
      tools: { count: 7 },
      skills: { count: 8 },
      slashCommands: { count: 9 },
    },
  }
  render(
    <HarnessFactsView
      facts={facts}
      error={null}
      loading={false}
      onRetry={vi.fn()}
    />,
  )
  fireEvent.pointerDown(screen.getByTestId('harness-pill'), {
    button: 0,
    ctrlKey: false,
    pointerType: 'mouse',
  })
  expect({
    alert: screen.getByTestId('harness-pill').getAttribute('data-alert'),
    servers: screen.queryByText(
      '… and 104 more not connected (0 failed or needing auth)',
    )?.textContent,
    plugins: screen.queryByText('… and 104 more plugins')?.textContent,
    capabilities: screen.queryByText(/88 more capabilities/)?.textContent,
    tools: screen.queryByText('Tools: 7')?.textContent,
    skills: screen.queryByText('Skills: 8')?.textContent,
    commands: screen.queryByText('Slash commands: 9')?.textContent,
    truncated: screen.queryByText('Some reported text was truncated.')
      ?.textContent,
  }).toEqual({
    alert: 'true',
    servers: '… and 104 more not connected (0 failed or needing auth)',
    plugins: '… and 104 more plugins',
    capabilities: 'Capabilities: control · 88 more capabilities',
    tools: 'Tools: 7',
    skills: 'Skills: 8',
    commands: 'Slash commands: 9',
    truncated: 'Some reported text was truncated.',
  })
})
it('R2triple cuts are disclosed beside their text — mutation hide cut indicators turns red', () => {
  const fieldBounds = { text: { truncated: true as const, bytes: 9000 } }
  const facts: SessionHarnessFacts = {
    turns: [],
    currentTurn: {
      turnId: 't',
      hooks: [
        {
          id: 'h',
          name: 'cut',
          event: null,
          status: 'ok',
          startedAt: null,
          durationMs: null,
          output: null,
          fieldBounds,
        },
      ],
      denials: [
        {
          toolName: 'Bash',
          reasonType: null,
          reason: 'cut',
          at: null,
          fieldBounds,
        },
      ],
      retries: {
        attempts: 1,
        state: 'unknown',
        last: {
          kind: 'harness.retry',
          phase: 'attempt',
          at: 'now',
          attempt: 1,
          maxRetries: null,
          retryDelayMs: null,
          errorStatus: null,
          message: 'cut',
          noResponse: null,
          fieldBounds,
        },
      },
    },
    init: null,
    rateLimit: {
      kind: 'harness.rateLimit',
      at: 'now',
      status: null,
      type: null,
      utilization: null,
      resetsAt: null,
      overageStatus: null,
      overageResetsAt: null,
      overageDisabledReason: null,
      isUsingOverage: null,
      overageInUse: null,
      surpassedThreshold: null,
      fieldBounds,
    },
    compactions: [
      {
        kind: 'harness.compaction',
        at: 'now',
        trigger: 'cut',
        preTokens: null,
        postTokens: null,
        durationMs: null,
        sequence: 1,
        fieldBounds,
      },
    ],
  }
  render(
    <HarnessFactsView
      facts={facts}
      error={null}
      loading={false}
      onRetry={vi.fn()}
    />,
  )
  fireEvent.pointerDown(screen.getByTestId('harness-pill'), {
    button: 0,
    ctrlKey: false,
    pointerType: 'mouse',
  })
  expect({
    rate: screen.queryByText('Rate limit text truncated')?.textContent,
    compact: screen.queryByText('Compacted (cut) · text truncated')
      ?.textContent,
    hook: screen.queryByText('Hook text truncated')?.textContent,
    retry: screen.queryByText('Retry text truncated')?.textContent,
    denial: screen.queryByText(/Bash · text truncated/)?.textContent,
  }).toEqual({
    rate: 'Rate limit text truncated',
    compact: 'Compacted (cut) · text truncated',
    hook: 'Hook text truncated',
    retry: 'Retry text truncated',
    denial: 'Bash · text truncated · cut',
  })
})

it('RUN61 r5 pending then failed names linear — mutation remove priority sort turns red', () => {
  const init = readClaudeHarnessFact(
    {
      type: 'system',
      subtype: 'init',
      mcp_servers: [
        ...Array.from({ length: 16 }, (_, i) => ({
          name: `pending-${i}`,
          status: 'pending',
        })),
        { name: 'linear', status: 'failed' },
      ],
    },
    'now',
  )
  const facts: SessionHarnessFacts = {
    turns: [],
    currentTurn: null,
    compactions: [],
    rateLimit: null,
    init: init?.kind === 'harness.init' ? init : null,
  }
  render(
    <HarnessFactsView
      facts={facts}
      error={null}
      loading={false}
      onRetry={vi.fn()}
    />,
  )
  fireEvent.pointerDown(screen.getByTestId('harness-pill'), {
    button: 0,
    ctrlKey: false,
    pointerType: 'mouse',
  })
  expect({
    alert: screen.getByTestId('harness-pill').getAttribute('data-alert'),
    linear: screen.queryByText('linear · failed')?.textContent,
    overflow: screen.queryByText(
      '… and 1 more not connected (0 failed or needing auth)',
    )?.textContent,
  }).toEqual({
    alert: 'true',
    linear: 'linear · failed',
    overflow: '… and 1 more not connected (0 failed or needing auth)',
  })
})
it('RUN61 r5 omitted alerts alone remain visible — mutation ignore omittedAlerts turns red', () => {
  const init = readClaudeHarnessFact(
    { type: 'system', subtype: 'init', mcp_servers: [] },
    'now',
  )
  if (init?.kind !== 'harness.init') throw Error('fixture init')
  // Isolate the omitted-count arm independently of the named-row arm.
  init.mcpServers = {
    total: 2,
    connected: 0,
    others: [],
    omitted: 2,
    omittedAlerts: 2,
  }
  const facts: SessionHarnessFacts = {
    turns: [],
    currentTurn: null,
    compactions: [],
    rateLimit: null,
    init,
  }
  render(
    <HarnessFactsView
      facts={facts}
      error={null}
      loading={false}
      onRetry={vi.fn()}
    />,
  )
  fireEvent.pointerDown(screen.getByTestId('harness-pill'), {
    button: 0,
    ctrlKey: false,
    pointerType: 'mouse',
  })
  expect({
    alert: screen.getByTestId('harness-pill').getAttribute('data-alert'),
    overflow: screen.queryByText(
      '… and 2 more not connected (2 failed or needing auth)',
    )?.textContent,
  }).toEqual({
    alert: 'true',
    overflow: '… and 2 more not connected (2 failed or needing auth)',
  })
})
it('RUN61 r5 raw init placeholder is shown — mutation drop raw mapping turns red', () => {
  const init = readHarnessFactRow('system', { truncated: true }, 'now', 'init')
  const facts: SessionHarnessFacts = {
    turns: [],
    currentTurn: null,
    compactions: [],
    rateLimit: null,
    init: init?.kind === 'harness.init' ? init : null,
  }
  render(
    <HarnessFactsView
      facts={facts}
      error={null}
      loading={false}
      onRetry={vi.fn()}
    />,
  )
  fireEvent.pointerDown(screen.getByTestId('harness-pill'), {
    button: 0,
    ctrlKey: false,
    pointerType: 'mouse',
  })
  expect(screen.queryByText('Harness record truncated')).not.toBeNull()
})

// -- MAR-3213 R2: the panel names the connected servers; old facts still render --

function openHarnessPopover(facts: SessionHarnessFacts) {
  render(
    <HarnessFactsView
      facts={facts}
      error={null}
      loading={false}
      onRetry={vi.fn()}
    />,
  )
  fireEvent.pointerDown(screen.getByTestId('harness-pill'), {
    button: 0,
    ctrlKey: false,
    pointerType: 'mouse',
  })
}

it('MAR-3213 R2 names the connected servers under the count — mutation derive the names from the whole list turns red', () => {
  // The reader is the real one, so the fact's shape is exactly what a live
  // session writes: names of the connected only, pending left to `others`.
  const fact = readClaudeHarnessFact(
    {
      type: 'system',
      subtype: 'init',
      mcp_servers: [
        { name: 'claude.ai Figma', status: 'connected' },
        { name: 'srv-b', status: 'connected' },
        { name: 'linear', status: 'needs-auth' },
      ],
    },
    'now',
  )
  if (fact?.kind !== 'harness.init') throw Error('not init')
  const facts: SessionHarnessFacts = {
    turns: [],
    currentTurn: null,
    compactions: [],
    init: {
      ...fact,
      mcpServers: fact.mcpServers
        ? { ...fact.mcpServers, connectedOmitted: 1 }
        : null,
    },
    rateLimit: null,
  }
  openHarnessPopover(facts)
  expect(screen.getByText('MCP servers · 2 connected of 3')).toBeInTheDocument()
  // The connected names line, then the not-connected list as today.
  expect(
    screen.getByText('Connected: claude.ai Figma, srv-b'),
  ).toBeInTheDocument()
  expect(screen.getByText('… and 1 more connected')).toBeInTheDocument()
  expect(screen.getByText('linear · needs-auth')).toBeInTheDocument()
})

it('MAR-3213 R2 an old fact without the new fields renders exactly today — mutation render the names unconditionally turns red', () => {
  // A fact recorded before this change: no connectedNames, no
  // connectedOmitted. Its render must be byte-identical to the panel before
  // the fields existed — no new line, no empty label, no "undefined".
  const facts: SessionHarnessFacts = {
    turns: [],
    currentTurn: null,
    compactions: [],
    init: {
      kind: 'harness.init',
      at: 'now',
      claudeCodeVersion: null,
      model: null,
      permissionMode: null,
      mcpServers: {
        total: 2,
        connected: 1,
        others: [{ name: 'linear', status: 'needs-auth' }],
        omitted: 0,
        omittedAlerts: 0,
      },
      plugins: null,
      capabilities: null,
      tools: null,
      skills: null,
      slashCommands: null,
    },
    rateLimit: null,
  }
  const { container } = render(
    <HarnessFactsView
      facts={facts}
      error={null}
      loading={false}
      onRetry={vi.fn()}
    />,
  )
  fireEvent.pointerDown(screen.getByTestId('harness-pill'), {
    button: 0,
    ctrlKey: false,
    pointerType: 'mouse',
  })
  expect(screen.getByText('MCP servers · 1 connected of 2')).toBeInTheDocument()
  expect(screen.getByText('linear · needs-auth')).toBeInTheDocument()
  expect(screen.queryByText(/Connected:/)).not.toBeInTheDocument()
  expect(screen.queryByText(/more connected/)).not.toBeInTheDocument()
  expect(container.textContent).not.toContain('undefined')
})

it('MAR-3427 C caps an alert pill chaining every reason: it truncates and keeps its full label in title — mutation remove the harness cap turns red', () => {
  const facts: SessionHarnessFacts = {
    turns: [],
    currentTurn: {
      turnId: 't',
      hooks: [],
      retries: null,
      denials: null,
    },
    compactions: [],
    rateLimit: null,
    init: {
      mcpServers: {
        connected: 0,
        others: [
          { name: 'a', status: 'needs-auth' },
          { name: 'b', status: 'failed' },
        ],
        omittedAlerts: 4,
        omitted: 0,
      },
      plugins: null,
      capabilities: null,
      tools: null,
      skills: null,
      slashCommands: null,
    },
  } as unknown as SessionHarnessFacts
  const pill = harnessPill(facts)
  render(
    <HarnessAlertChip label={pill.label} expanded={false} onOpen={vi.fn()} />,
  )
  const chip = screen.getByTestId('harness-alert')
  const label =
    'Harness · 1 integration needs sign-in · 1 integration failed · 4 more integrations need attention'
  expect(pill.alert).toBe(true)
  expect(chip).toHaveAttribute('title', label)
  // 15rem = 240 px, the width the header's layout test holds the chip to.
  expect(chip.className.split(/\s+/)).toContain('max-w-[15rem]')
  const text = within(chip).getByText(label)
  expect(text.className.split(/\s+/)).toEqual(
    expect.arrayContaining(['min-w-0', 'truncate']),
  )
})

describe('MAR-3206 — MCP servers in Details', () => {
  const init = readClaudeHarnessFact(
    {
      type: 'system',
      subtype: 'init',
      mcp_servers: [{ name: 'claude.ai Figma', status: 'needs-auth' }],
    },
    'start',
  ) as Extract<SessionHarnessFacts['init'], object>
  const status = (figma: string): SessionHarnessFacts['mcpStatus'] => ({
    kind: 'harness.mcpStatus',
    at: 'later',
    servers: [
      {
        name: 'claude.ai Figma',
        status: figma,
        scope: 'claudeai',
        origin: 'https://mcp.figma.com',
      },
      {
        name: 'linear',
        status: 'connected',
        scope: 'user',
        origin: 'https://mcp.linear.app',
      },
    ],
    connected: figma === 'connected' ? 2 : 1,
    omitted: 0,
    omittedAlerts: 0,
    pluginServers: [
      {
        plugin: 'figma',
        server: 'figma',
        origin: 'https://mcp.figma.com',
        loaded: false,
      },
    ],
  })
  const facts = (figma: string): SessionHarnessFacts => ({
    turns: [],
    currentTurn: null,
    compactions: [],
    rateLimit: null,
    init,
    mcpStatus: status(figma),
  })
  const mcp = (
    overrides: Partial<
      Parameters<typeof HarnessFactsSections>[0]['mcp'] & object
    > = {},
  ) => ({
    unavailable: null,
    pending: null,
    error: null,
    onReconnect: vi.fn(),
    ...overrides,
  })

  it('names each server’s scope and address, says what hides the plugin, and Reconnect calls the running session', () => {
    const view = mcp()
    render(
      <HarnessFactsSections
        facts={facts('needs-auth')}
        error={null}
        loading={false}
        onRetry={() => {}}
        mcp={view}
      />,
    )
    const list = screen.getByLabelText('MCP servers')
    expect(list.textContent).toContain(
      'claude.ai Figma · needs-auth · claudeai · https://mcp.figma.com',
    )
    expect(list.textContent).toContain(
      'linear · connected · user · https://mcp.linear.app',
    )
    expect(screen.getByRole('note').textContent).toBe(
      "claude.ai Figma needs sign-in and is hiding the Figma plugin's server (same address). Authorize Figma at claude.ai → Settings → Connectors, then Reconnect.",
    )
    // Only a server in trouble offers Reconnect.
    expect(
      within(list)
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label')),
    ).toEqual(['Reconnect claude.ai Figma'])
    fireEvent.click(
      screen.getByRole('button', { name: 'Reconnect claude.ai Figma' }),
    )
    expect(view.onReconnect).toHaveBeenCalledWith('claude.ai Figma')
  })

  it('the row updates with the status: connected shows no sentence and no Reconnect', () => {
    render(
      <HarnessFactsSections
        facts={facts('connected')}
        error={null}
        loading={false}
        onRetry={() => {}}
        mcp={mcp()}
      />,
    )
    expect(screen.getByLabelText('MCP servers').textContent).toContain(
      'MCP servers · 2 connected of 2',
    )
    expect(screen.queryByRole('note')).toBeNull()
    expect(screen.queryByRole('button', { name: /Reconnect/ })).toBeNull()
  })

  it.each(['needs-auth', 'connected'])(
    'R5 a status with no running process says so in the heading, and no Reconnect is enabled (Figma %s)',
    (figma) => {
      const unavailable =
        'no process is running; the next message starts one and reads its connectors afresh'
      render(
        <HarnessFactsSections
          facts={facts(figma)}
          error={null}
          loading={false}
          onRetry={() => {}}
          mcp={mcp({ unavailable })}
        />,
      )
      const list = screen.getByLabelText('MCP servers')
      expect(list.textContent).toContain(
        `unchanged since later · ${unavailable}`,
      )
      expect(
        within(list)
          .queryAllByRole('button')
          .filter((button) => !(button as HTMLButtonElement).disabled),
      ).toEqual([])
      // The hidden-plugin sentence describes the account, which outlives
      // the process: it stays.
      expect(screen.queryAllByRole('note')).toHaveLength(
        figma === 'needs-auth' ? 1 : 0,
      )
    },
  )

  it('R5 a running process is named in the heading', () => {
    render(
      <HarnessFactsSections
        facts={facts('connected')}
        error={null}
        loading={false}
        onRetry={() => {}}
        mcp={mcp()}
      />,
    )
    expect(screen.getByLabelText('MCP servers').textContent).toContain(
      'unchanged since later · process running',
    )
  })

  it('R7 25 connected servers read "25 connected of 25" though 20 are listed — count over the listed servers and this turns red', () => {
    const fact = readClaudeMcpStatus(
      Array.from({ length: 25 }, (_, index) => ({
        name: `server-${index}`,
        status: 'connected',
        scope: 'user',
        config: { type: 'http', url: `https://s${index}.test/mcp` },
      })),
      [],
      'later',
    )
    render(
      <HarnessFactsSections
        facts={{ ...facts('connected'), mcpStatus: fact }}
        error={null}
        loading={false}
        onRetry={() => {}}
        mcp={mcp()}
      />,
    )
    expect(fact.servers).toHaveLength(20)
    expect(screen.getByLabelText('MCP servers').textContent).toContain(
      'MCP servers · 25 connected of 25 · ',
    )
  })

  it('R10 a 77-character plugin server name gets no Reconnect, says why, and raises no false hidden sentence', () => {
    const server = 'x'.repeat(64)
    const name = `plugin:figma:${server}`
    expect(name).toHaveLength(77)
    const fact = readClaudeMcpStatus(
      [
        {
          name: 'claude.ai Figma',
          status: 'needs-auth',
          scope: 'claudeai',
          config: { type: 'claudeai-proxy', url: 'https://mcp.figma.com/mcp' },
        },
        {
          name,
          status: 'failed',
          scope: 'dynamic',
          config: { type: 'http', url: 'https://mcp.figma.com/mcp' },
        },
      ],
      [{ plugin: 'figma', server, origin: 'https://mcp.figma.com' }],
      'later',
    )
    render(
      <HarnessFactsSections
        facts={{ ...facts('needs-auth'), mcpStatus: fact }}
        error={null}
        loading={false}
        onRetry={() => {}}
        mcp={mcp()}
      />,
    )
    const list = screen.getByLabelText('MCP servers')
    expect(
      within(list)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual(['Reconnect claude.ai Figma'])
    expect(list.textContent).toContain('name too long to reconnect from here')
    expect(screen.queryByRole('note')).toBeNull()
  })

  it('a refused reconnect says so beside the list', () => {
    render(
      <HarnessFactsSections
        facts={facts('needs-auth')}
        error={null}
        loading={false}
        onRetry={() => {}}
        mcp={mcp({
          error: { server: 'claude.ai Figma', message: 'needs authentication' },
        })}
      />,
    )
    expect(screen.getByRole('alert').textContent).toBe(
      'Reconnect claude.ai Figma failed: needs authentication',
    )
  })

  it('R6 a failed Reconnect’s error goes when the status flips to connected', () => {
    const view = mcp({
      error: { server: 'claude.ai Figma', message: 'needs authentication' },
    })
    const { rerender } = render(
      <HarnessFactsSections
        facts={facts('needs-auth')}
        error={null}
        loading={false}
        onRetry={() => {}}
        mcp={view}
      />,
    )
    const before = screen.queryByRole('alert')?.textContent ?? null
    rerender(
      <HarnessFactsSections
        facts={facts('connected')}
        error={null}
        loading={false}
        onRetry={() => {}}
        mcp={view}
      />,
    )
    expect({ before, after: screen.queryByRole('alert') }).toEqual({
      before: 'Reconnect claude.ai Figma failed: needs authentication',
      after: null,
    })
  })
})

it('CH4b R4 the harness block keeps one visible Harness title with no startup facts and with them — mutation the heading only inside init turns red', () => {
  const title = () => screen.getAllByRole('heading', { name: 'Harness' })
  const onRetry = vi.fn()
  const retryOnly: SessionHarnessFacts = {
    turns: [],
    currentTurn: {
      turnId: 't',
      hooks: [],
      denials: null,
      retries: {
        attempts: 2,
        state: 'in-flight',
        last: {
          kind: 'harness.retry',
          phase: 'attempt',
          attempt: 2,
          maxRetries: 10,
          retryDelayMs: 100,
          errorStatus: null,
          message: 'error',
          noResponse: null,
          at: 'now',
        },
      },
    },
    compactions: [],
    rateLimit: null,
    init: null,
  }
  const withInit: SessionHarnessFacts = {
    turns: [],
    currentTurn: null,
    compactions: [],
    rateLimit: null,
    init: {
      kind: 'harness.init',
      at: 'now',
      claudeCodeVersion: '1.0.0',
      model: 'sonnet',
      permissionMode: null,
      mcpServers: null,
      plugins: null,
      capabilities: null,
      tools: null,
      skills: null,
      slashCommands: null,
    },
  }
  const { rerender } = render(
    <HarnessFactsSections
      facts={null}
      error={null}
      loading
      onRetry={onRetry}
    />,
  )
  expect(title()).toHaveLength(1)
  expect(title()[0]).toBeVisible()

  rerender(
    <HarnessFactsSections
      facts={null}
      error="Could not read the harness"
      loading={false}
      onRetry={onRetry}
    />,
  )
  expect(title()).toHaveLength(1)
  expect(title()[0]).toBeVisible()

  rerender(
    <HarnessFactsSections
      facts={retryOnly}
      error={null}
      loading={false}
      onRetry={onRetry}
    />,
  )
  expect(title()).toHaveLength(1)
  expect(title()[0]).toBeVisible()

  rerender(
    <HarnessFactsSections
      facts={withInit}
      error={null}
      loading={false}
      onRetry={onRetry}
    />,
  )
  expect(title()).toHaveLength(1)
  expect(title()[0]).toBeVisible()
})
