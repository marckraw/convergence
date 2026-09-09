import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { SessionHarnessFacts } from '@/shared/types/harness-facts.types'
import { HarnessFactsView } from './harness-facts.presentational'
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
    servers: screen.queryByText('… and 104 more not connected')?.textContent,
    plugins: screen.queryByText('… and 104 more plugins')?.textContent,
    capabilities: screen.queryByText(/88 more capabilities/)?.textContent,
    tools: screen.queryByText('Tools: 7')?.textContent,
    skills: screen.queryByText('Skills: 8')?.textContent,
    commands: screen.queryByText('Slash commands: 9')?.textContent,
    truncated: screen.queryByText('Some reported text was truncated.')
      ?.textContent,
  }).toEqual({
    alert: 'true',
    servers: '… and 104 more not connected',
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
